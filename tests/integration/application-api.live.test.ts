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
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import type {
  ModelCallMetadata,
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from '@/server/ai/structured-model.port';
import { handleResearchPost } from '@/server/application/research-route';
import { executeResearchSubmission } from '@/server/application/research.service';

loadEnvConfig(process.cwd());

const runLive = process.env.RUN_APP_API_LIVE === '1';

describe.skipIf(!runLive)('Live application API', () => {
  it('runs the real pipeline and leaves the human decision unset', async () => {
    const thesis =
      'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.';
    const completedModelCalls: ModelCallMetadata[] = [];
    const attemptedModelCalls: Array<{
      operation: string;
      configuredOutputTokenBudget: number;
    }> = [];
    const deepSeek = new DeepSeekResponsesClient();
    const instrumentedModel: StructuredModelPort = {
      async generateStructured<TSchema extends z.ZodTypeAny>(
        request: StructuredModelRequest<TSchema>
      ): Promise<StructuredModelResult<z.infer<TSchema>>> {
        attemptedModelCalls.push({
          operation: request.operation,
          configuredOutputTokenBudget: request.maxOutputTokens,
        });
        const result = await deepSeek.generateStructured(request);
        completedModelCalls.push({ ...result.metadata, operation: request.operation });
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
        recoveryInvoked:
          attemptedModelCalls.length !== completedModelCalls.length ||
          new Set(attemptedModelCalls.map((call) => call.operation)).size !==
            attemptedModelCalls.length,
      };
      console.error(
        'APPLICATION_API_LIVE_FAILURE',
        JSON.stringify(failureProof)
      );
      throw new Error(`Application research failed: ${JSON.stringify(failureProof)}`);
    }
    const research = ResearchSuccessResponseV1Schema.parse(researchPayload);

    expect(researchResponse.status).toBe(200);
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
    expect(completedModelCalls).toHaveLength(6);
    expect(completedModelCalls.map((call) => call.operation).sort()).toEqual(
      [
        'structureThesis',
        'buildAdvocateCase',
        'buildDissentCase',
        'assessAssumptions',
        'generateStressResearch',
        'synthesizeBrief',
      ].sort()
    );

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
          recoveryInvoked:
            attemptedModelCalls.length !== completedModelCalls.length ||
            new Set(attemptedModelCalls.map((call) => call.operation)).size !==
              attemptedModelCalls.length,
          validationPassed: true,
        },
        null,
        2
      )
    );
  }, 150_000);
});
