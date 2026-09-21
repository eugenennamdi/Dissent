import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { loadEnvConfig } from '@next/env';
import type { ArgumentV1 } from '@/core/contracts/argument';
import { ArgumentV1Schema } from '@/core/contracts/argument';
import {
  assertArgumentEvidenceGrounding,
  assertEvidenceLedgerIntegrity,
} from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import { assertAdvocateDissenterDistinct } from '@/server/ai/argument-validation';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import { evidenceCatalog } from '@/server/ai/grounding';
import type {
  ModelCallMetadata,
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from '@/server/ai/structured-model.port';
import { FIXED_AT } from '../server/ai/fixtures';
import { makeArgumentModelComparisonFixture } from './argument-model-comparison.fixture';

loadEnvConfig(process.cwd());

const runComparison = process.env.RUN_ARGUMENT_MODEL_COMPARISON === '1';
const AVAILABLE_COMPARISON_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;
type ComparisonModel = (typeof AVAILABLE_COMPARISON_MODELS)[number];
const selectedComparisonModel = process.env.ARGUMENT_MODEL_COMPARISON_MODEL;
if (
  selectedComparisonModel !== undefined &&
  !AVAILABLE_COMPARISON_MODELS.includes(selectedComparisonModel as ComparisonModel)
) {
  throw DissentError.configurationError(
    'ARGUMENT_MODEL_COMPARISON_MODEL must select a supported comparison model.',
    { configuredModel: selectedComparisonModel }
  );
}
const COMPARISON_MODELS: readonly ComparisonModel[] = selectedComparisonModel
  ? [selectedComparisonModel as ComparisonModel]
  : AVAILABLE_COMPARISON_MODELS;
const MAX_EXPERIMENT_PROVIDER_CALLS = COMPARISON_MODELS.length * 4;

type ValidationResult = 'PASSED' | 'FAILED' | 'NOT_REACHED';

interface SafeFailure {
  code: string;
  validationCategory?: unknown;
  invariantCode?: unknown;
  issuePath?: unknown;
  safeExplanation?: unknown;
}

interface ProviderAttemptRecord {
  sequence: number;
  operation: 'buildAdvocateCase' | 'buildDissentCase';
  attempt: 1 | 2;
  requestedModel: string;
  actualModel?: string;
  configuredOutputTokenBudget: number;
  providerSchemaValidation: ValidationResult;
  argumentMaterialization: ValidationResult;
  evidenceGrounding: ValidationResult;
  latencyMs?: number;
  usage?: ModelCallMetadata['usage'];
  recoveryKind?: ModelCallMetadata['recoveryKind'];
  failure?: SafeFailure;
}

class ExperimentProviderCallBudget {
  private used = 0;

  reserve(): number {
    if (this.used >= MAX_EXPERIMENT_PROVIDER_CALLS) {
      throw DissentError.configurationError(
        'Argument comparison provider-call ceiling reached before another request could start.',
        {
          experiment: 'argument-model-comparison',
          providerCallCeiling: MAX_EXPERIMENT_PROVIDER_CALLS,
          providerCallsUsed: this.used,
        }
      );
    }
    this.used += 1;
    return this.used;
  }

  count(): number {
    return this.used;
  }
}

function safeFailure(error: unknown): SafeFailure {
  const details = error instanceof DissentError ? error.details : undefined;
  return {
    code: error instanceof DissentError ? error.code : 'UNEXPECTED_ERROR',
    validationCategory: details?.validationCategory,
    invariantCode: details?.invariantCode,
    issuePath: details?.issuePath,
    safeExplanation: details?.safeExplanation,
  };
}

function instrumentComparisonModel(input: {
  delegate: StructuredModelPort;
  requestedModel: string;
  budget: ExperimentProviderCallBudget;
  attempts: ProviderAttemptRecord[];
}): StructuredModelPort {
  return {
    async generateStructured<TSchema extends z.ZodTypeAny>(
      request: StructuredModelRequest<TSchema>
    ): Promise<StructuredModelResult<z.infer<TSchema>>> {
      const sequence = input.budget.reserve();
      const record: ProviderAttemptRecord = {
        sequence,
        operation: request.operation as ProviderAttemptRecord['operation'],
        attempt: request.attempt ?? 1,
        requestedModel: input.requestedModel,
        configuredOutputTokenBudget: request.maxOutputTokens,
        providerSchemaValidation: 'NOT_REACHED',
        argumentMaterialization: 'NOT_REACHED',
        evidenceGrounding: 'NOT_REACHED',
      };
      input.attempts.push(record);
      try {
        const result = await input.delegate.generateStructured(request);
        record.actualModel = result.metadata.model;
        record.providerSchemaValidation = 'PASSED';
        record.latencyMs = result.metadata.latencyMs;
        record.usage = result.metadata.usage;
        return result;
      } catch (error) {
        const details = error instanceof DissentError ? error.details : undefined;
        record.actualModel =
          typeof details?.actualModel === 'string' ? details.actualModel : undefined;
        record.providerSchemaValidation =
          error instanceof DissentError &&
          error.code === 'MODEL_OUTPUT_INVALID' &&
          details?.validationCategory === 'APPLICATION_SCHEMA_VALIDATION'
            ? 'FAILED'
            : 'NOT_REACHED';
        record.usage =
          details?.usage && typeof details.usage === 'object'
            ? (details.usage as ModelCallMetadata['usage'])
            : undefined;
        record.failure = safeFailure(error);
        throw error;
      }
    },
  };
}

interface OperationComparisonResult {
  operation: 'buildAdvocateCase' | 'buildDissentCase';
  requestedModel: string;
  actualModel?: string;
  providerSchemaValidation: ValidationResult;
  argumentMaterialization: ValidationResult;
  evidenceGrounding: ValidationResult;
  latencyMs?: number;
  usage?: ModelCallMetadata['usage'];
  attempt?: number;
  recoveryKind?: ModelCallMetadata['recoveryKind'];
  recoveryAttempts: number;
  attempts: ProviderAttemptRecord[];
  failure?: SafeFailure;
}

async function runArgumentOperation(input: {
  analyst: DeepSeekAnalystAdapter;
  requestedModel: string;
  operation: OperationComparisonResult['operation'];
  providerAttempts: ProviderAttemptRecord[];
  invoke: () => Promise<ArgumentV1>;
}): Promise<{ result: OperationComparisonResult; argument?: ArgumentV1 }> {
  const recordStart = input.analyst.getModelCallRecords().length;
  const attemptStart = input.providerAttempts.length;
  try {
    const argument = ArgumentV1Schema.parse(await input.invoke());
    const metadata = input.analyst.getModelCallRecords().slice(recordStart).at(-1);
    const attempts = input.providerAttempts.slice(attemptStart);
    const finalAttempt = attempts.at(-1);
    if (finalAttempt) {
      finalAttempt.argumentMaterialization = 'PASSED';
      finalAttempt.evidenceGrounding = 'PASSED';
      finalAttempt.recoveryKind = metadata?.recoveryKind;
    }
    return {
      argument,
      result: {
        operation: input.operation,
        requestedModel: input.requestedModel,
        actualModel: metadata?.model,
        providerSchemaValidation: 'PASSED',
        argumentMaterialization: 'PASSED',
        evidenceGrounding: 'PASSED',
        latencyMs: metadata?.latencyMs,
        usage: metadata?.usage,
        attempt: metadata?.attempt,
        recoveryKind: metadata?.recoveryKind,
        recoveryAttempts: attempts.filter((attempt) => attempt.attempt > 1).length,
        attempts,
      },
    };
  } catch (error) {
    const metadata = input.analyst.getModelCallRecords().slice(recordStart).at(-1);
    const details = error instanceof DissentError ? error.details : undefined;
    const attempts = input.providerAttempts.slice(attemptStart);
    const finalAttempt = attempts.at(-1);
    if (finalAttempt?.providerSchemaValidation === 'PASSED') {
      finalAttempt.argumentMaterialization = 'FAILED';
      finalAttempt.evidenceGrounding = 'NOT_REACHED';
      finalAttempt.failure = safeFailure(error);
    }
    if (finalAttempt && finalAttempt.attempt > 1) {
      finalAttempt.recoveryKind =
        metadata?.recoveryKind ??
        (attempts[0]?.failure?.code === 'OUTPUT_TRUNCATED'
          ? 'TRUNCATION'
          : 'STRUCTURAL');
    }
    return {
      result: {
        operation: input.operation,
        requestedModel: input.requestedModel,
        actualModel:
          metadata?.model ??
          (typeof details?.actualModel === 'string' ? details.actualModel : undefined),
        providerSchemaValidation:
          finalAttempt?.providerSchemaValidation ?? 'NOT_REACHED',
        argumentMaterialization: 'FAILED',
        evidenceGrounding: 'NOT_REACHED',
        latencyMs: metadata?.latencyMs,
        usage: metadata?.usage,
        attempt:
          metadata?.attempt ??
          (typeof details?.attempt === 'number' ? details.attempt : undefined),
        recoveryKind: metadata?.recoveryKind,
        recoveryAttempts: attempts.filter((attempt) => attempt.attempt > 1).length,
        attempts,
        failure: safeFailure(error),
      },
    };
  }
}

async function captureModelFacingContract(input: {
  operation: OperationComparisonResult['operation'];
  fixture: ReturnType<typeof makeArgumentModelComparisonFixture>;
}): Promise<string> {
  let captured: StructuredModelRequest<z.ZodTypeAny> | undefined;
  const captureOnlyModel: StructuredModelPort = {
    async generateStructured<TSchema extends z.ZodTypeAny>(
      request: StructuredModelRequest<TSchema>
    ): Promise<StructuredModelResult<z.infer<TSchema>>> {
      captured = request;
      throw DissentError.configurationError('Comparison contract captured without provider I/O.');
    },
  };
  const analyst = new DeepSeekAnalystAdapter({
    model: captureOnlyModel,
    now: () => new Date(FIXED_AT),
  });
  try {
    if (input.operation === 'buildAdvocateCase') {
      await analyst.buildAdvocateCase(
        input.fixture.thesis,
        input.fixture.ledger,
        input.fixture.assumptions
      );
    } else {
      await analyst.buildDissentCase(
        input.fixture.thesis,
        input.fixture.ledger,
        input.fixture.assumptions
      );
    }
  } catch (error) {
    if (!(error instanceof DissentError) || !captured) throw error;
  }
  if (!captured) throw new Error(`Failed to capture ${input.operation} contract.`);
  return JSON.stringify({
    operation: captured.operation,
    schemaName: captured.schemaName,
    jsonSchema: captured.jsonSchema,
    systemPrompt: captured.systemPrompt,
    userPayload: captured.userPayload,
    maxOutputTokens: captured.maxOutputTokens,
    reasoningEffort: captured.reasoningEffort,
  });
}

describe('argument model comparison fixture', () => {
  it('is deterministic, integral, historical, and preserves measurement distinctions', () => {
    const first = makeArgumentModelComparisonFixture();
    const second = makeArgumentModelComparisonFixture();

    expect(second).toEqual(first);
    expect(() => assertEvidenceLedgerIntegrity(first.ledger)).not.toThrow();
    expect(first.ledger.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ev_return_spread',
          unit: 'percentage points',
          observation: expect.objectContaining({ type: 'RETURN_SPREAD' }),
          derivedFromEvidenceIds: ['ev_return', 'ev_btc_return'],
        }),
        expect.objectContaining({
          id: 'ev_relative_return',
          unit: '%',
          observation: expect.objectContaining({ type: 'RELATIVE_RETURN' }),
          derivedFromEvidenceIds: ['ev_return', 'ev_btc_return'],
        }),
        expect.objectContaining({
          id: 'ev_eth_funding',
          observation: expect.objectContaining({
            type: 'FUNDING_RATE',
            instrumentType: 'PERPETUAL_FUTURES',
          }),
        }),
        expect.objectContaining({
          id: 'ev_eth_open_interest',
          observation: expect.objectContaining({ type: 'OPEN_INTEREST' }),
          metadata: expect.objectContaining({
            unitLimitation: expect.stringContaining('non-economic'),
          }),
        }),
      ])
    );
    expect(
      first.ledger.items.every((item) =>
        item.provenance.endpointOrLocator.startsWith('fixture://')
      )
    ).toBe(true);
    expect(first.ledger.items.every((item) => item.thesisId === first.thesis.id)).toBe(
      true
    );
    expect(first.assumptions.every((item) => item.thesisId === first.thesis.id)).toBe(
      true
    );
    expect(evidenceCatalog(first.ledger)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimId: 'ev_return_spread',
          supportedMeasurement: 'RETURN_SPREAD',
          unit: 'percentage points',
        }),
        expect.objectContaining({
          claimId: 'ev_relative_return',
          supportedMeasurement: 'RELATIVE_RETURN',
          unit: '%',
        }),
        expect.objectContaining({
          claimId: 'ev_eth_funding',
          supportedMeasurement: 'FUNDING_RATE',
          measurementLimitations: expect.arrayContaining([
            expect.stringContaining('directional positioning'),
          ]),
        }),
        expect.objectContaining({
          claimId: 'ev_eth_open_interest',
          supportedMeasurement: 'OPEN_INTEREST',
          measurementLimitations: expect.arrayContaining([
            expect.stringContaining('fixture unit is intentionally non-economic'),
          ]),
        }),
      ])
    );
  });

  it('enforces the experiment-wide provider-call ceiling before an excess call', () => {
    const budget = new ExperimentProviderCallBudget();
    for (let call = 0; call < MAX_EXPERIMENT_PROVIDER_CALLS; call += 1) {
      expect(budget.reserve()).toBe(call + 1);
    }
    expect(() => budget.reserve()).toThrow(/provider-call ceiling reached/i);
    expect(budget.count()).toBe(MAX_EXPERIMENT_PROVIDER_CALLS);
  });
});

describe.skipIf(!runComparison)('Live isolated argument model comparison', () => {
  it('compares both fixed-role arguments under identical validation requirements', async () => {
    expect(process.env.DEEPSEEK_API_KEY).toBeTruthy();
    const fixture = makeArgumentModelComparisonFixture();
    const fixtureSnapshot = JSON.stringify(fixture);
    const contractSignatures = new Map<string, string>();
    for (const requestedModel of COMPARISON_MODELS) {
      for (const operation of [
        'buildAdvocateCase',
        'buildDissentCase',
      ] as const) {
        contractSignatures.set(
          `${requestedModel}:${operation}`,
          await captureModelFacingContract({ operation, fixture })
        );
      }
    }
    for (const operation of [
      'buildAdvocateCase',
      'buildDissentCase',
    ] as const) {
      expect(
        new Set(
          COMPARISON_MODELS.map((model) =>
            contractSignatures.get(`${model}:${operation}`)
          )
        ).size
      ).toBe(1);
    }

    const providerCallBudget = new ExperimentProviderCallBudget();
    const providerAttempts: ProviderAttemptRecord[] = [];
    const comparisonResults: Array<{
      requestedModel: string;
      operations: OperationComparisonResult[];
      crossArgumentValidation: 'PASSED' | 'FAILED' | 'NOT_REACHED';
      crossArgumentFailure?: OperationComparisonResult['failure'];
    }> = [];

    for (const requestedModel of COMPARISON_MODELS) {
      const analyst = new DeepSeekAnalystAdapter({
        model: instrumentComparisonModel({
          delegate: new DeepSeekResponsesClient({ model: requestedModel }),
          requestedModel,
          budget: providerCallBudget,
          attempts: providerAttempts,
        }),
        now: () => new Date(FIXED_AT),
      });
      const advocate = await runArgumentOperation({
        analyst,
        requestedModel,
        operation: 'buildAdvocateCase',
        providerAttempts,
        invoke: () =>
          analyst.buildAdvocateCase(
            fixture.thesis,
            fixture.ledger,
            fixture.assumptions
          ),
      });
      const dissent = await runArgumentOperation({
        analyst,
        requestedModel,
        operation: 'buildDissentCase',
        providerAttempts,
        invoke: () =>
          analyst.buildDissentCase(
            fixture.thesis,
            fixture.ledger,
            fixture.assumptions
          ),
      });

      let crossArgumentValidation: 'PASSED' | 'FAILED' | 'NOT_REACHED' =
        'NOT_REACHED';
      let crossArgumentFailure: OperationComparisonResult['failure'];
      if (advocate.argument && dissent.argument) {
        try {
          assertArgumentEvidenceGrounding(advocate.argument, fixture.ledger);
          assertArgumentEvidenceGrounding(dissent.argument, fixture.ledger);
          assertAdvocateDissenterDistinct(
            advocate.argument,
            dissent.argument,
            analyst.getModelCallRecords()
          );
          crossArgumentValidation = 'PASSED';
        } catch (error) {
          crossArgumentValidation = 'FAILED';
          crossArgumentFailure = {
            code: error instanceof DissentError ? error.code : 'UNEXPECTED_ERROR',
            validationCategory:
              error instanceof DissentError
                ? error.details?.validationCategory
                : undefined,
            invariantCode:
              error instanceof DissentError ? error.details?.invariantCode : undefined,
            issuePath:
              error instanceof DissentError ? error.details?.issuePath : undefined,
            safeExplanation:
              error instanceof DissentError ? error.details?.safeExplanation : undefined,
          };
        }
      }
      comparisonResults.push({
        requestedModel,
        operations: [advocate.result, dissent.result],
        crossArgumentValidation,
        ...(crossArgumentFailure ? { crossArgumentFailure } : {}),
      });
    }

    expect(JSON.stringify(fixture)).toBe(fixtureSnapshot);
    expect(providerCallBudget.count()).toBeLessThanOrEqual(
      MAX_EXPERIMENT_PROVIDER_CALLS
    );
    console.log(
      'ARGUMENT_MODEL_COMPARISON_RESULT',
      JSON.stringify(
        {
          fixtureUnchanged: JSON.stringify(fixture) === fixtureSnapshot,
          modelFacingContractsIdentical: true,
          selectedModels: COMPARISON_MODELS,
          providerCallCeiling: MAX_EXPERIMENT_PROVIDER_CALLS,
          providerCallsUsed: providerCallBudget.count(),
          providerAttempts,
          comparisonResults,
        },
        null,
        2
      )
    );
    expect(
      comparisonResults.every(
        (modelResult) =>
          modelResult.operations.every(
            (operation) =>
              operation.providerSchemaValidation === 'PASSED' &&
              operation.argumentMaterialization === 'PASSED' &&
              operation.evidenceGrounding === 'PASSED'
          ) && modelResult.crossArgumentValidation === 'PASSED'
      )
    ).toBe(true);
  }, 300_000);
});
