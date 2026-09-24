import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { loadEnvConfig } from '@next/env';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import { DissentError } from '@/core/errors/domain-errors';
import {
  assertArgumentEvidenceGrounding,
  assertGeneratedBriefInvariants,
} from '@/core/domain/invariants';
import {
  ApiFailureResponseV1Schema,
  ResearchSuccessResponseV1Schema,
} from '@/lib/api/contracts';
import { assertAdvocateDissenterDistinct } from '@/server/ai/argument-validation';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import type {
  ModelCallMetadata,
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from '@/server/ai/structured-model.port';
import { handleResearchPost } from '@/server/application/research-route';
import { executeResearchSubmission } from '@/server/application/research.service';
import {
  wasRecoveryInvoked,
  type AttemptedModelCall,
} from './live-test-telemetry';

loadEnvConfig(process.cwd());

const runLive = process.env.RUN_APP_API_LIVE === '1';
const ETH_BTC_LIVE_THESIS =
  'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.';
const SOL_BTC_LIVE_THESIS =
  'I think SOL will outperform BTC over the next 48 hours because risk appetite is improving and SOL momentum is strengthening.';
const SOL_USDT_LIVE_THESIS =
  "I think SOL's USDT-denominated market price will rise over the next 48 hours because network activity and risk appetite are strengthening.";
const liveResearchMarket = process.env.LIVE_RESEARCH_MARKET ?? 'ETH/BTC';

describe.skipIf(!runLive)('Live application API', () => {
  it('runs the real pipeline and leaves the human decision unset', async () => {
    const thesis =
      liveResearchMarket === 'SOL/BTC'
        ? SOL_BTC_LIVE_THESIS
        : liveResearchMarket === 'SOL/USDT'
          ? SOL_USDT_LIVE_THESIS
          : ETH_BTC_LIVE_THESIS;
    const completedModelCalls: ModelCallMetadata[] = [];
    const attemptedModelCalls: AttemptedModelCall[] = [];
    const deepSeek = new DeepSeekResponsesClient();
    const instrumentedModel: StructuredModelPort = {
      async generateStructured<TSchema extends z.ZodTypeAny>(
        request: StructuredModelRequest<TSchema>
      ): Promise<StructuredModelResult<z.infer<TSchema>>> {
        attemptedModelCalls.push({
          operation: request.operation,
          attempt: request.attempt ?? 1,
          configuredOutputTokenBudget: request.maxOutputTokens,
        });
        const result = await deepSeek.generateStructured(request);
        completedModelCalls.push({
          ...result.metadata,
          operation: request.operation,
          attempt: request.attempt ?? 1,
        });
        return result;
      },
    };
    const apiStartedAt = Date.now();
    let internalFailure:
      | {
          code: string;
          operation?: unknown;
          validationCategory?: unknown;
          invariantCode?: unknown;
          issuePath?: unknown;
          argumentStance?: unknown;
          argumentPointIndex?: unknown;
          evidenceId?: unknown;
          evidenceIds?: unknown;
          assumptionId?: unknown;
          safeExplanation?: unknown;
          attempt?: unknown;
        }
      | undefined;
    const researchResponse = await handleResearchPost(
      new Request('http://localhost/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ thesis }),
      }),
      {
        enabled: true,
        execute: async (submission) => {
          try {
            return await executeResearchSubmission(submission, {
              model: instrumentedModel,
            });
          } catch (error) {
            if (error instanceof DissentError) {
              internalFailure = {
                code: error.code,
                operation: error.details?.operation,
                validationCategory: error.details?.validationCategory,
                invariantCode: error.details?.invariantCode,
                issuePath: error.details?.issuePath,
                argumentStance: error.details?.argumentStance,
                argumentPointIndex: error.details?.argumentPointIndex,
                evidenceId: error.details?.evidenceId,
                evidenceIds: error.details?.evidenceIds,
                assumptionId: error.details?.assumptionId,
                safeExplanation: error.details?.safeExplanation,
                attempt: error.details?.attempt,
              };
              console.error(
                'APPLICATION_API_LIVE_INTERNAL_FAILURE',
                JSON.stringify(internalFailure)
              );
            }
            throw error;
          }
        },
      }
    );
    const apiWallClockMs = Date.now() - apiStartedAt;
    const researchPayload: unknown = await researchResponse.json();
    if (!researchResponse.ok) {
      const failure = ApiFailureResponseV1Schema.parse(researchPayload);
      const failureProof = {
        apiWallClockMs,
        publicFailure: failure,
        internalFailure,
        attemptedModelCalls,
        completedModelCalls,
        recoveryInvoked: wasRecoveryInvoked(
          attemptedModelCalls,
          completedModelCalls
        ),
      };
      console.error(
        'APPLICATION_API_LIVE_FAILURE',
        JSON.stringify(failureProof)
      );
      throw new Error(`Application research failed: ${JSON.stringify(failureProof)}`);
    }
    const research = ResearchSuccessResponseV1Schema.parse(researchPayload);

    expect(researchResponse.status).toBe(200);
    expect(research.state).toBe('COMPLETED');
    expect(research.brief.originalThesis).toBe(thesis);
    expect(research.brief.humanDecision).toBeNull();
    expect(research.advocateCase.stance).toBe('ADVOCATE');
    expect(research.brief.theDissent.stance).toBe('DISSENTER');
    expect(research.brief.assumptions.length).toBeGreaterThan(0);
    expect(research.brief.stressScenarios.length).toBeGreaterThanOrEqual(2);
    expect(research.brief.invalidationConditions.length).toBeGreaterThan(0);
    expect(
      research.brief.evidenceLedger.items.every(
        (item) =>
          item.provenance.sourceName === 'Bitget V3 Market API' ||
          item.provenance.sourceName === 'Dissent Deterministic Analytics'
      )
    ).toBe(true);
    expect(() => DissentBriefV1Schema.parse(research.brief)).not.toThrow();
    expect(() => assertGeneratedBriefInvariants(research.brief)).not.toThrow();
    expect(() =>
      assertArgumentEvidenceGrounding(research.advocateCase, research.brief.evidenceLedger)
    ).not.toThrow();
    expect(() =>
      assertAdvocateDissenterDistinct(research.advocateCase, research.brief.theDissent)
    ).not.toThrow();
    const expectedOperations = [
      'structureThesis',
      'buildAdvocateCase',
      'buildDissentCase',
      'assessAssumptions',
      'generateStressResearch',
      'synthesizeBrief',
    ].sort();
    if (liveResearchMarket !== 'ETH/BTC') {
      expect([...new Set(completedModelCalls.map((call) => call.operation))].sort()).toEqual(
        expectedOperations
      );
    } else {
      expect(completedModelCalls).toHaveLength(6);
      expect(completedModelCalls.map((call) => call.operation).sort()).toEqual(
        expectedOperations
      );
    }

    if (liveResearchMarket === 'SOL/BTC') {
      expect(research.brief.structuredThesis).toMatchObject({
        market: 'SOL/BTC',
        baseAsset: 'SOL',
        quoteAsset: 'BTC',
        direction: 'RELATIVE_LONG',
      });
      const evidence = research.brief.evidenceLedger.items;
      expect(evidence.some((item) => item.observation.market === 'SOL/USDT')).toBe(true);
      expect(evidence.some((item) => item.observation.market === 'BTC/USDT')).toBe(true);
      expect(
        evidence.some(
          (item) => item.observation.market === 'SOL/BTC' && item.nature !== 'DERIVED'
        )
      ).toBe(false);
      const derivedComparison = evidence.filter((item) =>
        ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(item.observation.type)
      );
      expect(derivedComparison.map((item) => item.observation.type).sort()).toEqual([
        'RELATIVE_RETURN',
        'RETURN_SPREAD',
      ]);
      expect(
        derivedComparison.every(
          (item) =>
            item.observation.market === 'SOL/BTC' &&
            item.observation.instrumentType === 'DERIVED_SPOT_PAIR' &&
            item.observation.providerSymbol === 'SOLUSDT:BTCUSDT' &&
            item.nature === 'DERIVED' &&
            item.provenance.sourceType === 'DERIVED_ANALYTICS' &&
            item.derivedFromEvidenceIds.length === 2 &&
            item.derivedFromEvidenceIds.every((sourceId) =>
              evidence.some((source) => source.id === sourceId)
            )
        )
      ).toBe(true);
    }

    if (liveResearchMarket === 'SOL/USDT') {
      expect(research.brief.structuredThesis).toMatchObject({
        market: 'SOL/USDT',
        baseAsset: 'SOL',
        quoteAsset: 'USDT',
        direction: 'LONG',
      });
      const evidence = research.brief.evidenceLedger.items;
      expect(new Set(evidence.map((item) => item.observation.market))).toEqual(
        new Set(['SOL/USDT'])
      );
      expect(new Set(evidence.map((item) => item.observation.providerSymbol))).toEqual(
        new Set(['SOLUSDT'])
      );
      expect(
        evidence.some((item) =>
          ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(item.observation.type)
        )
      ).toBe(false);
      expect(
        evidence.some((item) => item.observation.instrumentType === 'DERIVED_SPOT_PAIR')
      ).toBe(false);
      expect(new Set(evidence.map((item) => item.observation.type))).toEqual(
        new Set([
          'LAST_PRICE',
          'PRICE_CHANGE_24H',
          'BASE_VOLUME_24H',
          'FUNDING_RATE',
          'OPEN_INTEREST',
          'CANDLE_OPEN',
          'CANDLE_CLOSE',
          'INTERVAL_PRICE_CHANGE',
        ])
      );
      expect(research.brief.stressScenarios).toHaveLength(2);
    }

    const thesisHours = research.brief.structuredThesis.timeHorizon.estimatedHours;
    const expectedWindow =
      thesisHours === undefined
        ? 'Within the stated thesis horizon'
        : `Within the stated thesis horizon of ${thesisHours} ${
            thesisHours === 1 ? 'hour' : 'hours'
          }`;
    expect(
      research.brief.invalidationConditions.every(
        (condition) =>
          condition.type === 'QUALITATIVE' && condition.expectedWindow === expectedWindow
      )
    ).toBe(true);

    console.log(
      'APPLICATION_API_LIVE_PROOF',
      JSON.stringify(
        {
          researchStatus: research.state,
          market: research.brief.structuredThesis.market,
          originalPreserved: research.brief.originalThesis === thesis,
          evidenceCount: research.brief.evidenceLedger.items.length,
          advocatePoints: research.advocateCase.points.length,
          dissentPoints: research.brief.theDissent.points.length,
          assumptionCount: research.brief.assumptions.length,
          scenarioCount: research.brief.stressScenarios.length,
          invalidationCount: research.brief.invalidationConditions.length,
          researchGaps: research.brief.unknowns,
          initialHumanDecision: research.brief.humanDecision,
          persistence: research.persistence,
          timingsMs: research.timingsMs,
          apiWallClockMs,
          actualModels: [...new Set(completedModelCalls.map((call) => call.model))],
          modelCalls: completedModelCalls.map((call) => ({
            operation: call.operation,
            model: call.model,
            latencyMs: call.latencyMs,
            usage: call.usage,
          })),
          attemptedModelCalls,
          recoveryInvoked: wasRecoveryInvoked(
            attemptedModelCalls,
            completedModelCalls
          ),
          validationPassed: true,
          structuredThesis: {
            market: research.brief.structuredThesis.market,
            baseAsset: research.brief.structuredThesis.baseAsset,
            quoteAsset: research.brief.structuredThesis.quoteAsset,
            direction: research.brief.structuredThesis.direction,
          },
          evidenceMarkets: [
            ...new Set(
              research.brief.evidenceLedger.items.map((item) => item.observation.market)
            ),
          ],
          evidenceObservationTypes: [
            ...new Set(
              research.brief.evidenceLedger.items.map((item) => item.observation.type)
            ),
          ],
          expectedWindows: research.brief.invalidationConditions.map((condition) =>
            condition.type === 'QUALITATIVE' ? condition.expectedWindow : condition.timeframe
          ),
          derivedComparison: research.brief.evidenceLedger.items
            .filter((item) =>
              ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(item.observation.type)
            )
            .map((item) => ({
              type: item.observation.type,
              market: item.observation.market,
              instrumentType: item.observation.instrumentType,
              providerSymbol: item.observation.providerSymbol,
              value: item.value,
              unit: item.unit,
              sourceType: item.provenance.sourceType,
              sourceCount: item.derivedFromEvidenceIds.length,
            })),
        },
        null,
        2
      )
    );
  }, 150_000);
});
