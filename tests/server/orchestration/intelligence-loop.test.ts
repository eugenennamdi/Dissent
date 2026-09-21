import { describe, expect, it, vi } from 'vitest';
import { DissentError } from '@/core/errors/domain-errors';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import type { MarketDeskPort } from '@/server/market/market-desk.port';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';
import {
  FIXED_AT,
  QueueModel,
  argumentSelectionPlanFromRequest,
  assumptionAssessmentDraftFromRequest,
  extractionOutput,
  makeEvidenceLedger,
  stressResearchDraftFromRequest,
  synthesisDraftFromRequest,
  thesisInput,
} from '../ai/fixtures';

function marketDesk(onCall?: () => void): MarketDeskPort {
  return {
    async gatherMarketObservations(thesis) {
      onCall?.();
      return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
    },
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
  it('runs the complete workflow with distinct server-assembled grounded cases', async () => {
    const model = new QueueModel([
      extractionOutput,
      argumentSelectionPlanFromRequest,
      argumentSelectionPlanFromRequest,
      assumptionAssessmentDraftFromRequest,
      stressResearchDraftFromRequest,
      synthesisDraftFromRequest,
    ]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    let tick = 0;
    const result = await new IntelligenceLoop({
      ai,
      marketDesk: marketDesk(),
      now: () => (tick += 10),
    }).run(thesisInput);

    expect(result.structuredThesis.originalThesis).toBe(thesisInput.rawText);
    expect(result.advocateCase.stance).toBe('ADVOCATE');
    expect(result.dissentCase.stance).toBe('DISSENTER');
    expect(result.advocateCase.points[0]?.reasoning).not.toBe(
      result.dissentCase.points[0]?.reasoning
    );
    expect(result.modelCalls).toHaveLength(6);
    expect(model.requests.map((request) => request.operation)).toEqual([
      'structureThesis',
      'buildAdvocateCase',
      'buildDissentCase',
      'assessAssumptions',
      'generateStressResearch',
      'synthesizeBrief',
    ]);
    expect(model.requests.map((request) => request.maxOutputTokens)).toEqual([
      1_800,
      6_000,
      6_000,
      2_600,
      5_200,
      4_200,
    ]);
    expect(result.assumptions.every((item) => item.status !== 'UNTESTED')).toBe(true);
    expect(result.stressScenarios).toHaveLength(2);
    expect(result.invalidationConditions).toHaveLength(2);
    expect(result.brief.originalThesis).toBe(thesisInput.rawText);
    expect(result.brief.humanDecision).toBeNull();
    expect(result).not.toHaveProperty('humanDecision');
  });

  it('retries only a truncated late operation and preserves completed artifacts', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = new QueueModel([
      extractionOutput,
      argumentSelectionPlanFromRequest,
      argumentSelectionPlanFromRequest,
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
    let marketCalls = 0;
    const result = await new IntelligenceLoop({
      ai: new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) }),
      marketDesk: marketDesk(() => {
        marketCalls += 1;
      }),
    }).run(thesisInput);

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
    expect(result.brief.humanDecision).toBeNull();
    warning.mockRestore();
  });

  it('fails a malformed argument selection without retrying or restarting research', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = new QueueModel([
      extractionOutput,
      {
        primary: 'unknown_option',
        secondaryA: null,
        secondaryB: null,
        contextualA: null,
        contextualB: null,
      },
      argumentSelectionPlanFromRequest,
    ]);
    let marketCalls = 0;

    await expect(
      new IntelligenceLoop({
        ai: new DeepSeekAnalystAdapter({ model }),
        marketDesk: marketDesk(() => {
          marketCalls += 1;
        }),
      }).run(thesisInput)
    ).rejects.toMatchObject({ code: 'MODEL_OUTPUT_INVALID' });
    expect(marketCalls).toBe(1);
    expect(model.requests).toHaveLength(3);
    expect(
      model.requests.filter((request) => request.operation === 'buildAdvocateCase')
    ).toHaveLength(1);
    expect(
      model.requests.filter((request) => request.operation === 'buildDissentCase')
    ).toHaveLength(1);
    warning.mockRestore();
  });

  it('regenerates only a structurally incomplete stress stage', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = new QueueModel([
      extractionOutput,
      argumentSelectionPlanFromRequest,
      argumentSelectionPlanFromRequest,
      assumptionAssessmentDraftFromRequest,
      stressDraftWithoutScenarioArgumentReference,
      stressResearchDraftFromRequest,
      synthesisDraftFromRequest,
    ]);
    const result = await new IntelligenceLoop({
      ai: new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) }),
      marketDesk: marketDesk(),
    }).run(thesisInput);

    expect(model.requests.map((item) => item.operation)).toEqual([
      'structureThesis',
      'buildAdvocateCase',
      'buildDissentCase',
      'assessAssumptions',
      'generateStressResearch',
      'generateStressResearch',
      'synthesizeBrief',
    ]);
    expect(result.modelCalls[4]).toMatchObject({
      operation: 'generateStressResearch',
      attempt: 2,
      recoveryKind: 'STRUCTURAL',
    });
    expect(result.brief.humanDecision).toBeNull();
    warning.mockRestore();
  });

  it('fails closed on incomplete market research before argument generation', async () => {
    const model = new QueueModel([extractionOutput]);
    const ai = new DeepSeekAnalystAdapter({ model, now: () => new Date(FIXED_AT) });
    const incompleteMarketDesk: MarketDeskPort = {
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

    await expect(
      new IntelligenceLoop({ ai, marketDesk: incompleteMarketDesk }).run(thesisInput)
    ).rejects.toMatchObject({
      code: 'EVIDENCE_UNAVAILABLE',
      details: { reason: 'partial_market_research', retainedEvidenceCount: 2 },
    });
    expect(model.requests).toHaveLength(1);
  });
});
