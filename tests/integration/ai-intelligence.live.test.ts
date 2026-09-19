import { describe, expect, it } from 'vitest';
import { ArgumentV1Schema } from '@/core/contracts/argument';
import { AssumptionV1Schema } from '@/core/contracts/assumption';
import { EvidenceLedgerV1Schema } from '@/core/contracts/evidence';
import {
  StructuredThesisV1Schema,
  type ThesisInputV1,
} from '@/core/contracts/thesis';
import { assertArgumentEvidenceGrounding } from '@/core/domain/invariants';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';

const runLive = process.env.RUN_AI_LIVE === '1';

describe.skipIf(!runLive)('DeepSeek + Bitget live intelligence integration', () => {
  it('structures the canonical thesis and creates two evidence-bound cases', async () => {
    const submittedAt = new Date().toISOString();
    const input: ThesisInputV1 = {
      id: `inp_live_ai_${Date.now()}`,
      rawText:
        'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.',
      submittedAt,
      schemaVersion: 1,
    };
    const ai = new DeepSeekAnalystAdapter({ model: new DeepSeekResponsesClient() });
    const loop = new IntelligenceLoop({
      ai,
      marketDesk: new BitgetMarketAdapter(),
      marketQuery: { lookbackHours: 48, includeFutures: true },
    });

    const result = await loop.run(input);

    expect(result.structuredThesis.originalThesis).toBe(input.rawText);
    expect(result.structuredThesis).toMatchObject({
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      direction: 'RELATIVE_LONG',
    });
    expect(() => StructuredThesisV1Schema.parse(result.structuredThesis)).not.toThrow();
    expect(() => result.assumptions.map((item) => AssumptionV1Schema.parse(item))).not.toThrow();
    expect(() => EvidenceLedgerV1Schema.parse(result.evidenceLedger)).not.toThrow();
    expect(() => ArgumentV1Schema.parse(result.advocateCase)).not.toThrow();
    expect(() => ArgumentV1Schema.parse(result.dissentCase)).not.toThrow();
    expect(
      result.evidenceLedger.items.every(
        (item) =>
          item.provenance.sourceName === 'Bitget V3 Market API' ||
          item.provenance.sourceName === 'Dissent Deterministic Analytics'
      )
    ).toBe(true);
    expect(result.advocateCase.stance).toBe('ADVOCATE');
    expect(result.dissentCase.stance).toBe('DISSENTER');
    expect(result).not.toHaveProperty('humanDecision');
    expect(result.advocateCase).not.toHaveProperty('humanDecision');
    expect(result.dissentCase).not.toHaveProperty('humanDecision');
    expect(() =>
      assertArgumentEvidenceGrounding(result.advocateCase, result.evidenceLedger)
    ).not.toThrow();
    expect(() =>
      assertArgumentEvidenceGrounding(result.dissentCase, result.evidenceLedger)
    ).not.toThrow();
    expect(result.modelCalls).toHaveLength(3);
    expect(result.modelCalls.every((call) => call.provider === 'DeepSeek')).toBe(true);
    expect(result.modelCalls.every((call) => call.model.length > 0 && call.latencyMs >= 0)).toBe(
      true
    );
    for (const argument of [result.advocateCase, result.dissentCase]) {
      for (const point of argument.points) {
        expect(point.reasoning).toContain('Evidence:');
        expect(point.reasoning).toContain('Interpretation:');
        for (const evidenceId of point.evidenceIds) {
          const evidence = result.evidenceLedger.items.find((item) => item.id === evidenceId);
          expect(evidence).toBeDefined();
          expect(point.reasoning).toContain(`[${evidenceId}] ${evidence?.claim}`);
        }
      }
      const limitations = argument.risksOrCounterweightsConsidered.join(' ');
      expect(limitations).toContain('macro observations');
      expect(limitations).toContain('news-wire observations');
      expect(limitations).toContain('sentiment observations');
      expect(limitations).toContain('positioning coverage');
    }

    console.log(
      'AI_LIVE_PROOF',
      JSON.stringify(
        {
          market: result.structuredThesis.market,
          originalPreserved: result.structuredThesis.originalThesis === input.rawText,
          assumptions: result.assumptions.map((item) => ({
            id: item.id,
            type: item.type,
            category: item.category,
          })),
          evidenceCount: result.evidenceLedger.items.length,
          researchGaps: [],
          advocate: {
            summary: result.advocateCase.summary,
            points: result.advocateCase.points.map((point) => ({
              title: point.title,
              interpretation: point.reasoning.split('\nInterpretation: ')[1],
              evidenceIds: point.evidenceIds,
              weight: point.weight,
            })),
            limitations: result.advocateCase.risksOrCounterweightsConsidered,
          },
          dissenter: {
            summary: result.dissentCase.summary,
            points: result.dissentCase.points.map((point) => ({
              title: point.title,
              interpretation: point.reasoning.split('\nInterpretation: ')[1],
              evidenceIds: point.evidenceIds,
              weight: point.weight,
            })),
            limitations: result.dissentCase.risksOrCounterweightsConsidered,
          },
          modelCalls: result.modelCalls,
          timingsMs: result.timingsMs,
        },
        null,
        2
      )
    );
  }, 120_000);
});
