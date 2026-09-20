import { describe, expect, it } from 'vitest';
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
import type { ModelCallMetadata } from '@/server/ai/structured-model.port';
import { FIXED_AT } from '../server/ai/fixtures';
import { makeArgumentModelComparisonFixture } from './argument-model-comparison.fixture';

loadEnvConfig(process.cwd());

const runComparison = process.env.RUN_ARGUMENT_MODEL_COMPARISON === '1';
const COMPARISON_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

interface OperationComparisonResult {
  operation: 'buildAdvocateCase' | 'buildDissentCase';
  requestedModel: string;
  actualModel?: string;
  providerSchemaValidation: 'PASSED' | 'FAILED';
  argumentMaterialization: 'PASSED' | 'FAILED';
  evidenceGrounding: 'PASSED' | 'FAILED';
  latencyMs?: number;
  usage?: ModelCallMetadata['usage'];
  attempt?: number;
  recoveryKind?: ModelCallMetadata['recoveryKind'];
  failure?: {
    code: string;
    validationCategory?: unknown;
    invariantCode?: unknown;
    issuePath?: unknown;
    safeExplanation?: unknown;
  };
}

async function runArgumentOperation(input: {
  analyst: DeepSeekAnalystAdapter;
  requestedModel: string;
  operation: OperationComparisonResult['operation'];
  invoke: () => Promise<ArgumentV1>;
}): Promise<{ result: OperationComparisonResult; argument?: ArgumentV1 }> {
  const recordStart = input.analyst.getModelCallRecords().length;
  try {
    const argument = ArgumentV1Schema.parse(await input.invoke());
    const metadata = input.analyst.getModelCallRecords().slice(recordStart).at(-1);
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
      },
    };
  } catch (error) {
    const metadata = input.analyst.getModelCallRecords().slice(recordStart).at(-1);
    const details = error instanceof DissentError ? error.details : undefined;
    return {
      result: {
        operation: input.operation,
        requestedModel: input.requestedModel,
        actualModel:
          metadata?.model ??
          (typeof details?.actualModel === 'string' ? details.actualModel : undefined),
        providerSchemaValidation: metadata ? 'PASSED' : 'FAILED',
        argumentMaterialization: 'FAILED',
        evidenceGrounding: 'FAILED',
        latencyMs: metadata?.latencyMs,
        usage: metadata?.usage,
        attempt:
          metadata?.attempt ??
          (typeof details?.attempt === 'number' ? details.attempt : undefined),
        recoveryKind: metadata?.recoveryKind,
        failure: {
          code: error instanceof DissentError ? error.code : 'UNEXPECTED_ERROR',
          validationCategory: details?.validationCategory,
          invariantCode: details?.invariantCode,
          issuePath: details?.issuePath,
          safeExplanation: details?.safeExplanation,
        },
      },
    };
  }
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
});

describe.skipIf(!runComparison)('Live isolated argument model comparison', () => {
  it('compares both fixed-role arguments under identical validation requirements', async () => {
    const fixture = makeArgumentModelComparisonFixture();
    const fixtureSnapshot = JSON.stringify(fixture);
    const comparisonResults: Array<{
      requestedModel: string;
      operations: OperationComparisonResult[];
      crossArgumentValidation: 'PASSED' | 'FAILED' | 'NOT_REACHED';
      crossArgumentFailure?: OperationComparisonResult['failure'];
    }> = [];

    for (const requestedModel of COMPARISON_MODELS) {
      const analyst = new DeepSeekAnalystAdapter({
        model: new DeepSeekResponsesClient({ model: requestedModel }),
        now: () => new Date(FIXED_AT),
      });
      const advocate = await runArgumentOperation({
        analyst,
        requestedModel,
        operation: 'buildAdvocateCase',
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
    console.log(
      'ARGUMENT_MODEL_COMPARISON_RESULT',
      JSON.stringify(comparisonResults, null, 2)
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
