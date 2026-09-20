import { describe, expect, it } from 'vitest';
import { ArgumentV1Schema } from '@/core/contracts/argument';
import { AssumptionV1Schema } from '@/core/contracts/assumption';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import { EvidenceLedgerV1Schema } from '@/core/contracts/evidence';
import {
  InvalidationConditionV1Schema,
  StressScenarioV1Schema,
} from '@/core/contracts/stress-scenario';
import {
  StructuredThesisV1Schema,
  type ThesisInputV1,
} from '@/core/contracts/thesis';
import {
  assertArgumentEvidenceGrounding,
  assertGeneratedBriefInvariants,
} from '@/core/domain/invariants';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';

const runLive = process.env.RUN_AI_LIVE === '1';

describe.skipIf(!runLive)('DeepSeek + Bitget live intelligence integration', () => {
  it('produces a complete validated Dissent Brief from real DeepSeek and Bitget', async () => {
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
    expect(() => result.stressScenarios.map((item) => StressScenarioV1Schema.parse(item))).not.toThrow();
    expect(() =>
      result.invalidationConditions.map((item) => InvalidationConditionV1Schema.parse(item))
    ).not.toThrow();
    expect(() => DissentBriefV1Schema.parse(result.brief)).not.toThrow();
    expect(() => assertGeneratedBriefInvariants(result.brief)).not.toThrow();
    expect(
      result.evidenceLedger.items.every(
        (item) =>
          item.provenance.sourceName === 'Bitget V3 Market API' ||
          item.provenance.sourceName === 'Dissent Deterministic Analytics'
      )
    ).toBe(true);
    expect(result.advocateCase.stance).toBe('ADVOCATE');
    expect(result.dissentCase.stance).toBe('DISSENTER');
    expect(result.advocateCase.summary).not.toBe(result.dissentCase.summary);
    expect(result.assumptions.every((item) => item.status !== 'UNTESTED')).toBe(true);
    expect(result.assumptions.some((item) => item.type === 'EXPLICIT')).toBe(true);
    expect(result.assumptions.some((item) => item.type === 'INFERRED')).toBe(true);
    expect(result.stressScenarios.length).toBeGreaterThanOrEqual(2);
    expect(result.stressScenarios.length).toBeLessThanOrEqual(3);
    expect(
      result.stressScenarios.every(
        (scenario) =>
          scenario.description.startsWith('Hypothetical scenario:') &&
          scenario.affectedAssumptionIds.length > 0 &&
          scenario.relevantEvidenceIds.length > 0 &&
          scenario.uncertainties.length > 0
      )
    ).toBe(true);
    expect(result.invalidationConditions.length).toBeGreaterThan(0);
    expect(
      result.invalidationConditions.every(
        (condition) =>
          condition.type === 'QUALITATIVE' &&
          condition.targetAssumptionIds.length > 0 &&
          (condition.relevantEvidenceIds.length > 0 ||
            condition.verificationSource.includes('future primary source')) &&
          condition.urgency === 'THESIS_REVIEW'
      )
    ).toBe(true);
    expect(
      result.evidenceLedger.items.some((item) => item.observation.type === 'RELATIVE_RETURN')
    ).toBe(true);
    expect(
      result.evidenceLedger.items.some((item) => item.observation.type === 'RETURN_SPREAD')
    ).toBe(true);
    expect(result.brief.originalThesis).toBe(input.rawText);
    expect(result.brief.humanDecision).toBeNull();
    expect(result.brief.unknowns.join(' ')).toContain('macro');
    expect(result.brief.unknowns.join(' ')).toContain('news-wire');
    expect(result.brief.unknowns.join(' ')).toContain('sentiment');
    expect(result).not.toHaveProperty('humanDecision');
    expect(result.advocateCase).not.toHaveProperty('humanDecision');
    expect(result.dissentCase).not.toHaveProperty('humanDecision');
    expect(() =>
      assertArgumentEvidenceGrounding(result.advocateCase, result.evidenceLedger)
    ).not.toThrow();
    expect(() =>
      assertArgumentEvidenceGrounding(result.dissentCase, result.evidenceLedger)
    ).not.toThrow();
    expect(result.modelCalls).toHaveLength(6);
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
    const referencedAssumptions = new Set(result.assumptions.map((item) => item.id));
    const referencedEvidence = new Set(result.evidenceLedger.items.map((item) => item.id));
    for (const scenario of result.stressScenarios) {
      expect(scenario.affectedAssumptionIds.every((id) => referencedAssumptions.has(id))).toBe(
        true
      );
      expect(scenario.relevantEvidenceIds.every((id) => referencedEvidence.has(id))).toBe(true);
    }
    for (const condition of result.invalidationConditions) {
      expect(condition.targetAssumptionIds.every((id) => referencedAssumptions.has(id))).toBe(
        true
      );
      expect(condition.relevantEvidenceIds.every((id) => referencedEvidence.has(id))).toBe(true);
    }
    const numericPattern = /(?:[$€£¥]|\b\d+(?:[.,]\d+)?\b|%)/;
    const modelAuthoredFinalText = [
      ...result.stressScenarios.flatMap((item) => [
        item.name,
        item.description,
        item.transmissionMechanism,
        item.consequenceForThesis,
        ...item.uncertainties,
      ]),
      ...result.invalidationConditions.flatMap((item) => [
        item.statement,
        ...(item.type === 'QUALITATIVE'
          ? [item.observableEvent, item.expectedWindow ?? '']
          : []),
      ]),
      ...result.brief.contradictions.flatMap((item) => [item.statement, item.explanation]),
      ...result.brief.unknowns,
    ];
    expect(modelAuthoredFinalText.some((value) => numericPattern.test(value))).toBe(false);

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
            status: item.status,
            supportingEvidenceIds: item.supportingEvidenceIds,
            opposingEvidenceIds: item.opposingEvidenceIds,
          })),
          evidenceCount: result.evidenceLedger.items.length,
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
          scenarios: result.stressScenarios.map((item) => ({
            name: item.name,
            description: item.description,
            affectedAssumptionIds: item.affectedAssumptionIds,
            relevantEvidenceIds: item.relevantEvidenceIds,
            scenarioType: item.scenarioType,
            plausibility: item.plausibility,
            consequenceForThesis: item.consequenceForThesis,
            uncertainties: item.uncertainties,
          })),
          invalidationConditions: result.invalidationConditions,
          contradictions: result.brief.contradictions,
          researchGaps: result.brief.unknowns,
          humanDecision: result.brief.humanDecision,
          finalValidationPassed: true,
          modelCalls: result.modelCalls,
          timingsMs: result.timingsMs,
        },
        null,
        2
      )
    );
  }, 120_000);
});
