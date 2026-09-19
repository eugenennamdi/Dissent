import { describe, expect, it } from 'vitest';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import type { MarketDeskPort } from '@/server/market/market-desk.port';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';
import {
  FIXED_AT,
  QueueModel,
  argumentDraft,
  extractionOutput,
  makeEvidenceLedger,
  thesisInput,
} from '../ai/fixtures';

function draftWithoutAssumptionTarget(interpretation?: string) {
  const draft = argumentDraft(interpretation);
  return {
    ...draft,
    points: draft.points.map((point) => ({ ...point, targetAssumptionIds: [] })),
  };
}

describe('IntelligenceLoop', () => {
  it('runs thesis structuring, real-ledger boundary, and distinct grounded cases', async () => {
    const advocateDraft = draftWithoutAssumptionTarget();
    const dissentDraft = {
      ...draftWithoutAssumptionTarget(
        'The evidence does not establish that relative momentum will persist'
      ),
      summaryInterpretation:
        'Available market evidence does not establish persistence across the thesis horizon',
    };
    const model = new QueueModel([extractionOutput, advocateDraft, dissentDraft]);
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
    expect(result.modelCalls).toHaveLength(3);
    expect(model.requests.map((request) => request.maxOutputTokens)).toEqual([
      1_800,
      6_000,
      6_000,
    ]);
    expect(model.requests.map((request) => request.reasoningEffort)).toEqual([
      'low',
      'none',
      'none',
    ]);
    expect(result.timingsMs.total).toBeGreaterThanOrEqual(0);
    expect(result).not.toHaveProperty('humanDecision');
    expect(result.advocateCase).not.toHaveProperty('humanDecision');
    expect(result.dissentCase).not.toHaveProperty('humanDecision');
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
    });
  });
});
