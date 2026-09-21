import { loadEnvConfig } from '@next/env';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { AssumptionV1Schema } from '@/core/contracts/assumption';
import {
  InvalidationConditionV1Schema,
  StressScenarioV1Schema,
} from '@/core/contracts/stress-scenario';
import { DissentError } from '@/core/errors/domain-errors';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import type {
  ModelCallMetadata,
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from '@/server/ai/structured-model.port';
import {
  FIXED_AT,
  makeArgument,
  makeAssumptions,
  makeEvidenceLedger,
  makeStructuredThesis,
} from '../server/ai/fixtures';

loadEnvConfig(process.cwd());

const runLive = process.env.RUN_STRESS_TESTER_ACCEPTANCE === '1';
const MAX_PROVIDER_CALLS = 3;
const ALLOWED_OPERATIONS = new Set([
  'assessAssumptions',
  'generateStressResearch',
]);

interface AttemptRecord {
  operation: string;
  attempt: 1 | 2;
  configuredOutputTokenBudget: number;
  completed: boolean;
  actualModel?: string;
  latencyMs?: number;
  usage?: ModelCallMetadata['usage'];
}

function safeFailure(error: unknown) {
  return error instanceof DissentError
    ? {
        code: error.code,
        operation: error.details?.operation,
        validationCategory: error.details?.validationCategory,
        invariantCode: error.details?.invariantCode,
        issuePath: error.details?.issuePath,
        safeExplanation: error.details?.safeExplanation,
        attempt: error.details?.attempt,
      }
    : { code: 'UNEXPECTED_ERROR' };
}

describe.skipIf(!runLive)('Live isolated Stress Tester acceptance', () => {
  it('runs only assumption assessment and stress research against fixed validated artifacts', async () => {
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    expect(process.env.DEEPSEEK_MODEL ?? 'deepseek-flash').toBe('deepseek-flash');

    const fixture = {
      thesis: makeStructuredThesis(),
      assumptions: makeAssumptions(),
      ledger: makeEvidenceLedger(),
      advocateCase: makeArgument('ADVOCATE'),
      dissentCase: makeArgument('DISSENTER'),
    };
    const fixtureSnapshot = JSON.stringify(fixture);
    const attempts: AttemptRecord[] = [];
    const delegate = new DeepSeekResponsesClient({ model: 'deepseek-flash' });
    const instrumentedModel: StructuredModelPort = {
      async generateStructured<TSchema extends z.ZodTypeAny>(
        request: StructuredModelRequest<TSchema>
      ): Promise<StructuredModelResult<z.infer<TSchema>>> {
        if (!ALLOWED_OPERATIONS.has(request.operation)) {
          throw DissentError.configurationError(
            'The isolated Stress Tester invoked an unauthorized operation.',
            { operation: request.operation }
          );
        }
        if (attempts.length >= MAX_PROVIDER_CALLS) {
          throw DissentError.configurationError(
            'The isolated Stress Tester provider-call ceiling was reached.',
            {
              providerCallCeiling: MAX_PROVIDER_CALLS,
              providerCallsUsed: attempts.length,
            }
          );
        }
        const record: AttemptRecord = {
          operation: request.operation,
          attempt: request.attempt ?? 1,
          configuredOutputTokenBudget: request.maxOutputTokens,
          completed: false,
        };
        attempts.push(record);
        const result = await delegate.generateStructured(request);
        record.completed = true;
        record.actualModel = result.metadata.model;
        record.latencyMs = result.metadata.latencyMs;
        record.usage = result.metadata.usage;
        return result;
      },
    };
    const analyst = new DeepSeekAnalystAdapter({
      model: instrumentedModel,
      now: () => new Date(FIXED_AT),
    });

    let result: Awaited<ReturnType<typeof analyst.stressTest>>;
    try {
      result = await analyst.stressTest(
        fixture.thesis,
        fixture.assumptions,
        fixture.ledger,
        fixture.advocateCase,
        fixture.dissentCase
      );
    } catch (error) {
      console.error(
        'ISOLATED_STRESS_TESTER_FAILURE',
        JSON.stringify({
          failure: safeFailure(error),
          attempts,
          modelCalls: analyst.getModelCallRecords(),
        })
      );
      throw error;
    }

    expect(JSON.stringify(fixture)).toBe(fixtureSnapshot);
    expect(attempts.length).toBeLessThanOrEqual(MAX_PROVIDER_CALLS);
    expect(attempts[0]?.operation).toBe('assessAssumptions');
    expect(
      attempts.some((attempt) => attempt.operation === 'generateStressResearch')
    ).toBe(true);
    expect(attempts.every((attempt) => ALLOWED_OPERATIONS.has(attempt.operation))).toBe(
      true
    );
    expect(
      result.testedAssumptions.map((assumption) => AssumptionV1Schema.parse(assumption))
    ).toHaveLength(fixture.assumptions.length);
    expect(result.testedAssumptions.every((item) => item.status !== 'UNTESTED')).toBe(
      true
    );
    expect(
      result.stressScenarios.map((scenario) => StressScenarioV1Schema.parse(scenario))
    ).toHaveLength(2);
    expect(
      result.invalidationConditions.map((condition) =>
        InvalidationConditionV1Schema.parse(condition)
      ).length
    ).toBeGreaterThan(0);
    expect(new Set(result.stressScenarios.map((scenario) => scenario.name)).size).toBe(2);
    expect(
      new Set(
        result.stressScenarios.map(
          (scenario) =>
            `${scenario.scenarioType}:${[...scenario.affectedAssumptionIds].sort().join(',')}`
        )
      ).size
    ).toBe(2);

    console.log(
      'ISOLATED_STRESS_TESTER_PROOF',
      JSON.stringify(
        {
          requestedModel: 'deepseek-flash',
          providerCallCeiling: MAX_PROVIDER_CALLS,
          providerCallsUsed: attempts.length,
          attempts,
          modelCalls: analyst.getModelCallRecords(),
          testedAssumptionCount: result.testedAssumptions.length,
          scenarioCount: result.stressScenarios.length,
          invalidationCount: result.invalidationConditions.length,
          fixtureUnchanged: JSON.stringify(fixture) === fixtureSnapshot,
          validationPassed: true,
        },
        null,
        2
      )
    );
  }, 150_000);
});
