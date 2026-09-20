import { describe, expect, it, vi } from 'vitest';
import { DissentError } from '@/core/errors/domain-errors';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import type { MarketDeskPort } from '@/server/market/market-desk.port';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';
import {
  FIXED_AT,
  QueueModel,
  assumptionAssessmentDraftFromRequest,
  argumentDraft,
  extractionOutput,
  makeEvidenceLedger,
  stressResearchDraftFromRequest,
  synthesisDraftFromRequest,
  thesisInput,
} from '../ai/fixtures';

function draftWithoutAssumptionTarget(
  interpretation?: string,
  relation: 'SUPPORTS' | 'CHALLENGES' = 'SUPPORTS'
) {
  const draft = argumentDraft(interpretation);
  return {
    ...draft,
    points: draft.points.map((point) => ({
      ...point,
      targetAssumptionIds: [],
      relation,
    })),
  };
}

function stressDraftWithoutScenarioArgumentReference(
  request: Parameters<typeof stressResearchDraftFromRequest>[0]
) {
  const draft = stressResearchDraftFromRequest(request);
  const incomplete = { ...draft.scenarios[1] } as Record<string, unknown>;
  delete incomplete.relevantArgumentPointIds;
  return { ...draft, scenarios: [draft.scenarios[0], incomplete] };
}

describe('IntelligenceLoop', () => {
  it('runs thesis structuring, real-ledger boundary, and distinct grounded cases', async () => {
    const advocateDraft = draftWithoutAssumptionTarget();
    const dissentDraft = {
      ...draftWithoutAssumptionTarget(
        'The historical observation does not establish forward persistence',
        'CHALLENGES'
      ),
      summaryRationale:
        'Available market evidence does not establish persistence across the thesis horizon',
    };
    const model = new QueueModel([
      extractionOutput,
      advocateDraft,
      dissentDraft,
      assumptionAssessmentDraftFromRequest,
      stressResearchDraftFromRequest,
      synthesisDraftFromRequest,
    ]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    const marketDesk: MarketDeskPort = {
      async gatherMarketObservations(thesis) {
        return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
      },
    };
    let tick = 0;
    const loop = new IntelligenceLoop({ ai, marketDesk, now: () => (tick += 10) });

    const result = await loop.run(thesisInput);

    expect(result.structuredThesis.originalThesis).toBe(thesisInput.rawText);
    expect(result.advocateCase.stance).toBe('ADVOCATE');
    expect(result.dissentCase.stance).toBe('DISSENTER');
    expect(result.advocateCase.summary).not.toBe(result.dissentCase.summary);
    expect(result.advocateCase.points[0]?.evidenceIds).toEqual(
      result.dissentCase.points[0]?.evidenceIds
    );
    expect(result.advocateCase.points[0]?.reasoning).not.toBe(
      result.dissentCase.points[0]?.reasoning
    );
    expect(result.modelCalls).toHaveLength(6);
    expect(model.requests.map((request) => request.maxOutputTokens)).toEqual([
      1_800,
      6_000,
      6_000,
      2_600,
      5_200,
      4_200,
    ]);
    expect(model.requests.map((request) => request.reasoningEffort)).toEqual([
      'low',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(result.assumptions.every((item) => item.status !== 'UNTESTED')).toBe(true);
    expect(result.stressScenarios).toHaveLength(2);
    expect(result.invalidationConditions).toHaveLength(2);
    expect(result.brief.originalThesis).toBe(thesisInput.rawText);
    expect(result.brief.humanDecision).toBeNull();
    expect(result.brief.contradictions).toEqual([]);
    expect(result.timingsMs.total).toBeGreaterThanOrEqual(0);
    expect(result).not.toHaveProperty('humanDecision');
    expect(result.advocateCase).not.toHaveProperty('humanDecision');
    expect(result.dissentCase).not.toHaveProperty('humanDecision');
  });

  it('retries only a truncated late operation and preserves completed artifacts', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const advocateDraft = draftWithoutAssumptionTarget();
    const dissentDraft = {
      ...draftWithoutAssumptionTarget(
        'The historical observation does not establish forward persistence',
        'CHALLENGES'
      ),
      summaryRationale:
        'Available market evidence does not establish persistence across the thesis horizon',
    };
    const model = new QueueModel([
      extractionOutput,
      advocateDraft,
      dissentDraft,
      assumptionAssessmentDraftFromRequest,
      () => {
        throw DissentError.outputTruncated('generateStressResearch', {
          operation: 'generateStressResearch',
          configuredOutputTokenBudget: 5_200,
          incompleteReason: 'max_output_tokens',
        });
      },
      stressResearchDraftFromRequest,
      synthesisDraftFromRequest,
    ]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    let marketCalls = 0;
    const marketDesk: MarketDeskPort = {
      async gatherMarketObservations(thesis) {
        marketCalls += 1;
        return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
      },
    };

    const result = await new IntelligenceLoop({ ai, marketDesk }).run(thesisInput);

    expect(marketCalls).toBe(1);
    expect(model.requests.map((item) => item.operation)).toEqual([
      'structureThesis',
      'buildAdvocateCase',
      'buildDissentCase',
      'assessAssumptions',
      'generateStressResearch',
      'generateStressResearch',
      'synthesizeBrief',
    ]);
    expect(model.requests.map((item) => item.maxOutputTokens)).toEqual([
      1_800,
      6_000,
      6_000,
      2_600,
      5_200,
      6_800,
      4_200,
    ]);
    expect(result.modelCalls).toHaveLength(6);
    expect(result.brief.originalThesis).toBe(thesisInput.rawText);
    expect(result.brief.humanDecision).toBeNull();
    warning.mockRestore();
  });

  it('regenerates only a structurally incomplete stress stage and preserves prior artifacts', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const advocateDraft = draftWithoutAssumptionTarget();
    const dissentDraft = {
      ...draftWithoutAssumptionTarget(
        'The historical observation does not establish forward persistence',
        'CHALLENGES'
      ),
      summaryRationale:
        'Available market evidence does not establish persistence across the thesis horizon',
    };
    const model = new QueueModel([
      extractionOutput,
      advocateDraft,
      dissentDraft,
      assumptionAssessmentDraftFromRequest,
      stressDraftWithoutScenarioArgumentReference,
      stressResearchDraftFromRequest,
      synthesisDraftFromRequest,
    ]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    let marketCalls = 0;
    const marketDesk: MarketDeskPort = {
      async gatherMarketObservations(thesis) {
        marketCalls += 1;
        return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
      },
    };

    const result = await new IntelligenceLoop({ ai, marketDesk }).run(thesisInput);

    expect(marketCalls).toBe(1);
    expect(model.requests.map((item) => item.operation)).toEqual([
      'structureThesis',
      'buildAdvocateCase',
      'buildDissentCase',
      'assessAssumptions',
      'generateStressResearch',
      'generateStressResearch',
      'synthesizeBrief',
    ]);
    expect(result.modelCalls).toHaveLength(6);
    expect(result.modelCalls[4]).toMatchObject({
      operation: 'generateStressResearch',
      attempt: 2,
      recoveryKind: 'STRUCTURAL',
    });
    expect(result.brief.originalThesis).toBe(thesisInput.rawText);
    expect(result.brief.humanDecision).toBeNull();
    warning.mockRestore();
  });

  it('fails closed on incomplete market research before argument generation', async () => {
    const model = new QueueModel([extractionOutput]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    const marketDesk: MarketDeskPort = {
      async gatherMarketObservations(thesis) {
        return {
          ledger: makeEvidenceLedger(thesis.id),
          complete: false,
          gaps: [
            {
              market: 'ETH/USDT',
              dimension: 'SPOT_CANDLES',
              reason: 'INSUFFICIENT_DATA',
              message: 'Not enough aligned candles',
            },
          ],
        };
      },
    };

    await expect(new IntelligenceLoop({ ai, marketDesk }).run(thesisInput)).rejects.toMatchObject({
      code: 'EVIDENCE_UNAVAILABLE',
      details: { reason: 'partial_market_research', retainedEvidenceCount: 2 },
    });
    expect(model.requests).toHaveLength(1);
  });

  it('rejects materially identical Advocate and Dissenter cases', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sameDraft = draftWithoutAssumptionTarget();
    const ai = new DeepSeekAnalystAdapter({
      model: new QueueModel([extractionOutput, sameDraft, sameDraft]),
      now: () => new Date(FIXED_AT),
    });
    const marketDesk: MarketDeskPort = {
      async gatherMarketObservations(thesis) {
        return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
      },
    };

    await expect(new IntelligenceLoop({ ai, marketDesk }).run(thesisInput)).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'CROSS_ARGUMENT_VALIDATION',
        invariantCode: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
        issuePath: 'arguments',
        argumentStance: 'CROSS_ARGUMENT',
        attempt: 1,
      },
    });
    expect(warning).toHaveBeenCalledWith('DISSENT_AI_ARGUMENT_INVALID', {
      provider: 'DeepSeek',
      operation: 'argumentation',
      requestedModel: 'test-model',
      actualModel: 'test-model',
      validationCategory: 'CROSS_ARGUMENT_VALIDATION',
      invariantCode: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
      issuePath: 'arguments',
      argumentStance: 'CROSS_ARGUMENT',
      argumentPointIndex: undefined,
      evidenceId: undefined,
      assumptionId: undefined,
      safeExplanation:
        'Advocate and Dissenter must provide materially distinct interpretations.',
      issues: [
        {
          code: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
          path: 'arguments',
        },
      ],
      attempt: 1,
      requestId: undefined,
    });
    warning.mockRestore();
  });
});
