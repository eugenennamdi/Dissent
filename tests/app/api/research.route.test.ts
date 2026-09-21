import { describe, expect, it, vi } from 'vitest';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import { assertEvidenceLedgerIntegrity, assertGeneratedBriefInvariants } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import {
  ApiFailureResponseV1Schema,
  MAX_API_REQUEST_BYTES,
  ResearchSuccessResponseV1Schema,
  type ResearchSubmissionV1,
} from '@/lib/api/contracts';
import { handleResearchPost } from '@/server/application/research-route';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import { executeResearchSubmission } from '@/server/application/research.service';
import type { MarketDeskPort } from '@/server/market/market-desk.port';
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
} from '../../server/ai/fixtures';

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/research', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body,
  });
}

function marketDesk(): MarketDeskPort {
  return {
    async gatherMarketObservations(thesis) {
      return { ledger: makeEvidenceLedger(thesis.id), gaps: [], complete: true };
    },
  };
}

function mockedResearchExecutor() {
  const model = new QueueModel([
    extractionOutput,
    argumentSelectionPlanFromRequest,
    argumentSelectionPlanFromRequest,
    assumptionAssessmentDraftFromRequest,
    stressResearchDraftFromRequest,
    synthesisDraftFromRequest,
  ]);
  let tick = 0;
  return (submission: ResearchSubmissionV1) =>
    executeResearchSubmission(submission, {
      model,
      marketDesk: marketDesk(),
      now: () => new Date(FIXED_AT),
      timer: () => (tick += 10),
      inputIdFactory: () => 'inp_api_test',
    });
}

describe('POST /api/research', () => {
  it('accepts a bounded browser submission and returns a validated completed brief', async () => {
    const response = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText })),
      { enabled: true, execute: mockedResearchExecutor() }
    );
    const body = ResearchSuccessResponseV1Schema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.brief.originalThesis).toBe(thesisInput.rawText);
    expect(body.brief.structuredThesis.originalThesis).toBe(thesisInput.rawText);
    expect(body.brief.humanDecision).toBeNull();
    expect(body.advocateCase.stance).toBe('ADVOCATE');
    expect(body.brief.theDissent.stance).toBe('DISSENTER');
    expect(body.persistence).toEqual({
      strategy: 'BROWSER_LOCAL',
      serverStored: false,
      crossDeviceRecovery: false,
    });
    expect(() => DissentBriefV1Schema.parse(body.brief)).not.toThrow();
    expect(() => assertEvidenceLedgerIntegrity(body.brief.evidenceLedger)).not.toThrow();
    expect(() => assertGeneratedBriefInvariants(body.brief)).not.toThrow();
  });

  it('rejects malformed, structurally invalid, and oversized requests before execution', async () => {
    const execute = vi.fn();
    const malformed = await handleResearchPost(request('{not-json'), {
      enabled: true,
      execute,
    });
    expect(malformed.status).toBe(400);
    expect(ApiFailureResponseV1Schema.parse(await malformed.json()).error.code).toBe(
      'INVALID_INPUT'
    );

    const unknownField = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText, model: 'user-controlled' })),
      { enabled: true, execute }
    );
    expect(unknownField.status).toBe(400);

    const oversized = await handleResearchPost(request('x'.repeat(MAX_API_REQUEST_BYTES + 1)), {
      enabled: true,
      execute,
    });
    expect(oversized.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });

  it('enforces the supported market restriction through the real application service', async () => {
    const response = await handleResearchPost(
      request(JSON.stringify({ thesis: 'SOL will outperform USDT this week' })),
      {
        enabled: true,
        execute: (submission) =>
          executeResearchSubmission(submission, {
            model: new QueueModel([]),
            marketDesk: marketDesk(),
            now: () => new Date(FIXED_AT),
            inputIdFactory: () => 'inp_unsupported',
          }),
      }
    );
    const body = ApiFailureResponseV1Schema.parse(await response.json());
    expect(response.status).toBe(422);
    expect(body.error.code).toBe('UNSUPPORTED_MARKET');
  });

  it('returns safe typed failures for research and malformed model artifacts', async () => {
    const providerFailure = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText })),
      {
        enabled: true,
        execute: async () => {
          throw DissentError.evidenceUnavailable('secret provider locator', {
            credential: 'must-not-leak',
          });
        },
      }
    );
    const providerBody = ApiFailureResponseV1Schema.parse(await providerFailure.json());
    expect(providerFailure.status).toBe(503);
    expect(providerBody.error.code).toBe('EVIDENCE_UNAVAILABLE');
    expect(JSON.stringify(providerBody)).not.toContain('must-not-leak');
    expect(JSON.stringify(providerBody)).not.toContain('secret provider locator');

    const invalidModel = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText })),
      {
        enabled: true,
        execute: (submission) =>
          executeResearchSubmission(submission, {
            model: new QueueModel([{ ...extractionOutput, assumptions: [] }]),
            marketDesk: marketDesk(),
            now: () => new Date(FIXED_AT),
            inputIdFactory: () => 'inp_invalid_model',
          }),
      }
    );
    const invalidModelBody = ApiFailureResponseV1Schema.parse(await invalidModel.json());
    expect(invalidModel.status).toBe(502);
    expect(invalidModelBody.error.code).toBe('MODEL_OUTPUT_INVALID');
  });

  it('fails safely when disabled or when provider credentials are missing', async () => {
    const disabled = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText })),
      { enabled: false }
    );
    expect(disabled.status).toBe(503);
    expect(ApiFailureResponseV1Schema.parse(await disabled.json()).error.code).toBe(
      'CONFIGURATION_ERROR'
    );

    const missingCredentials = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText })),
      {
        enabled: true,
        execute: (submission) =>
          executeResearchSubmission(submission, {
            model: new DeepSeekResponsesClient({ apiKey: '' }),
            marketDesk: marketDesk(),
            now: () => new Date(FIXED_AT),
            inputIdFactory: () => 'inp_no_credentials',
          }),
      }
    );
    const body = ApiFailureResponseV1Schema.parse(await missingCredentials.json());
    expect(missingCredentials.status).toBe(503);
    expect(body.error).toEqual({
      code: 'CONFIGURATION_ERROR',
      message: 'Research service is not configured.',
      retryable: false,
    });
  });

  it('rejects cross-site browser requests', async () => {
    const response = await handleResearchPost(
      request(JSON.stringify({ thesis: thesisInput.rawText }), {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      }),
      { enabled: true, execute: vi.fn() }
    );
    expect(response.status).toBe(403);
    expect(ApiFailureResponseV1Schema.parse(await response.json()).error.code).toBe(
      'INVALID_INPUT'
    );
  });
});
