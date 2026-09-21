import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ArgumentDraftOutputSchema,
  createArgumentDraftJsonSchema,
  createStressResearchJsonSchema,
  StressResearchDraftOutputSchema,
} from '@/server/ai/ai-output.schemas';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';

const OutputSchema = z.object({ value: z.string() }).strict();
const request = {
  operation: 'testOperation',
  schemaName: 'test_output',
  schema: OutputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['value'],
    properties: { value: { type: 'string' } },
  },
  systemPrompt: 'Return a bounded value.',
  userPayload: { input: 'untrusted' },
  maxOutputTokens: 100,
};

function deepSeekResponse(text: string, status = 'completed'): Response {
  return new Response(
    JSON.stringify({
      id: 'resp_test',
      object: 'response',
      created_at: 1_789_812_000,
      model: 'deepseek-flash',
      status,
      error: null,
      incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text }],
        },
      ],
      usage: {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: status === 'incomplete' ? 100 : 10,
        output_tokens_details: { reasoning_tokens: status === 'incomplete' ? 90 : 2 },
        total_tokens: status === 'incomplete' ? 120 : 30,
      },
    }),
    { status: 200, headers: { 'x-request-id': 'req_test' } }
  );
}

describe('DeepSeekResponsesClient', () => {
  it('fails clearly when credentials are absent', async () => {
    const client = new DeepSeekResponsesClient({ apiKey: '' });
    await expect(client.generateStructured(request)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      retryable: false,
    });
  });

  it('uses DeepSeek instructions and documented structured output without tools', async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return deepSeekResponse('{"value":"ok"}');
    });
    const client = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      model: 'deepseek-flash',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: (() => {
        let value = 100;
        return () => (value += 5);
      })(),
    });

    const result = await client.generateStructured(request);

    expect(result.data).toEqual({ value: 'ok' });
    expect(result.metadata).toMatchObject({
      provider: 'DeepSeek',
      model: 'deepseek-flash',
      latencyMs: 5,
      requestId: 'req_test',
      configuredOutputTokenBudget: 100,
      configuredReasoningEffort: 'low',
      usage: {
        inputTokens: 20,
        cachedInputTokens: 0,
        outputTokens: 10,
        reasoningTokens: 2,
        totalTokens: 30,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBe('https://api.deepseek.com/responses');
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('tools');
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      instructions: 'Return a bounded value.',
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'test_output',
          schema: request.jsonSchema,
        },
      },
      max_output_tokens: 100,
    });
    expect(JSON.stringify(body)).not.toContain('"role":"system"');
    expect((body.text as { format: Record<string, unknown> }).format).not.toHaveProperty(
      'strict'
    );
  });

  it.each([
    ['raw JSON', '{"value":"raw"}', 'raw'],
    ['a json-labeled fence', '```json\n{"value":"labeled"}\n```', 'labeled'],
    ['an unlabeled fence', '```\n{"value":"unlabeled"}\n```', 'unlabeled'],
  ])('accepts %s as one structured JSON document', async (_case, outputText, value) => {
    const client = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () => deepSeekResponse(outputText)) as unknown as typeof fetch,
    });

    await expect(client.generateStructured(request)).resolves.toMatchObject({
      data: { value },
    });
  });

  it.each([
    ['an incomplete fence', '```json\n{"value":"incomplete"}'],
    [
      'surrounding prose',
      'Here is the result:\n```json\n{"value":"surrounded"}\n```',
    ],
    [
      'multiple fenced blocks',
      '```json\n{"value":"first"}\n```\n```json\n{"value":"second"}\n```',
    ],
    ['invalid fenced JSON', '```json\n{"value":}\n```'],
  ])('rejects %s', async (_case, outputText) => {
    const client = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () => deepSeekResponse(outputText)) as unknown as typeof fetch,
    });

    await expect(client.generateStructured(request)).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
    });
  });

  it('still applies the application schema after unwrapping a complete fence', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const outputText = '```json\n{"other":"field"}\n```';
    const client = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () => deepSeekResponse(outputText)) as unknown as typeof fetch,
    });

    await expect(client.generateStructured(request)).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode: 'MODEL_OUTPUT_APPLICATION_SCHEMA_VALID',
        issuePath: 'value',
        structuredOutputCharacters: outputText.length,
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'DISSENT_AI_OUTPUT_INVALID',
      expect.objectContaining({
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode: 'MODEL_OUTPUT_APPLICATION_SCHEMA_VALID',
        issuePath: 'value',
      })
    );
    warning.mockRestore();
  });

  it('maps malformed model output and incomplete responses to typed failures', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const malformed = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () => deepSeekResponse('{not-json')) as unknown as typeof fetch,
    });
    await expect(malformed.generateStructured(request)).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
    });

    const invalidShape = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () => deepSeekResponse('{"other":"field"}')) as unknown as typeof fetch,
    });
    await expect(invalidShape.generateStructured(request)).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        actualModel: 'deepseek-flash',
        configuredOutputTokenBudget: 100,
        configuredReasoningEffort: 'low',
        structuredOutputCharacters: 17,
      },
    });

    const incomplete = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () =>
        deepSeekResponse('{"value":"unused"}', 'incomplete')) as unknown as typeof fetch,
    });
    await expect(incomplete.generateStructured(request)).rejects.toMatchObject({
      code: 'OUTPUT_TRUNCATED',
      retryable: true,
      details: {
        provider: 'DeepSeek',
        operation: 'testOperation',
        requestedModel: 'deepseek-flash',
        actualModel: 'deepseek-flash',
        responseStatus: 'incomplete',
        incompleteReason: 'max_output_tokens',
        configuredOutputTokenBudget: 100,
        configuredReasoningEffort: 'low',
        usage: { outputTokens: 100, reasoningTokens: 90 },
      },
    });
    expect(warning).toHaveBeenCalledWith('DISSENT_AI_OUTPUT_TRUNCATED', {
      provider: 'DeepSeek',
      operation: 'testOperation',
      requestedModel: 'deepseek-flash',
      actualModel: 'deepseek-flash',
      responseStatus: 'incomplete',
      incompleteReason: 'max_output_tokens',
      configuredOutputTokenBudget: 100,
      configuredReasoningEffort: 'low',
      usage: {
        inputTokens: 20,
        cachedInputTokens: 0,
        outputTokens: 100,
        reasoningTokens: 90,
        totalTokens: 120,
      },
      requestId: 'req_test',
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('test-key');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('untrusted');
    warning.mockRestore();
  });

  it('classifies rate limits and authentication failures', async () => {
    const rateLimited = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      fetchImpl: (async () =>
        new Response('{"error":"rate limited"}', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(rateLimited.generateStructured(request)).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
      retryable: true,
      details: { statusCode: 429 },
    });

    const unauthorized = new DeepSeekResponsesClient({
      apiKey: 'bad-key',
      fetchImpl: (async () =>
        new Response('{"error":"unauthorized"}', { status: 401 })) as unknown as typeof fetch,
    });
    await expect(unauthorized.generateStructured(request)).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      retryable: false,
    });
  });

  it('logs safe operation and issue-path diagnostics for invalid stress output', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stressSchema = z.object({
      assumptionAssessments: z.array(
        z.object({
          assumptionId: z.string(),
          primaryChallengingEvidenceId: z.string(),
        })
      ),
    });
    const client = new DeepSeekResponsesClient({
      apiKey: 'secret-test-key',
      fetchImpl: (async () =>
        deepSeekResponse(
          JSON.stringify({ assumptionAssessments: [{ assumptionId: 'asm_safe_1' }] })
        )) as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured({
        ...request,
        operation: 'stressTest',
        schema: stressSchema,
      })
    ).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        assumptionId: 'asm_safe_1',
        issues: [
          {
            code: 'invalid_type',
            path: 'assumptionAssessments.0.primaryChallengingEvidenceId',
            expected: 'string',
            received: 'undefined',
          },
        ],
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'DISSENT_AI_OUTPUT_INVALID',
      expect.objectContaining({
        provider: 'DeepSeek',
        operation: 'stressTest',
        requestedModel: 'deepseek-flash',
        actualModel: 'deepseek-flash',
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        assumptionId: 'asm_safe_1',
        issues: [
          {
            code: 'invalid_type',
            path: 'assumptionAssessments.0.primaryChallengingEvidenceId',
            expected: 'string',
            received: 'undefined',
          },
        ],
        requestId: 'req_test',
      })
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-test-key');
    warning.mockRestore();
  });

  it('preserves argument stance, point path, and attempt for invalid argument output', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const argumentSchema = z
      .object({
        summaryInterpretation: z.string(),
        points: z.array(
          z
            .object({
              title: z.string(),
              interpretation: z.string(),
              evidenceIds: z.array(z.string()),
              targetAssumptionIds: z.array(z.string()),
              weight: z.string(),
            })
            .strict()
        ),
        counterweights: z.array(z.string()),
      })
      .strict();
    const client = new DeepSeekResponsesClient({
      apiKey: 'secret-test-key',
      fetchImpl: (async () =>
        deepSeekResponse(
          JSON.stringify({
            summaryInterpretation: 'Evidence remains limited',
            points: [
              {
                title: 'Persistence limitation',
                evidenceIds: ['ev_safe'],
                targetAssumptionIds: [],
                weight: 'PRIMARY',
              },
            ],
            counterweights: [],
          })
        )) as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured({
        ...request,
        operation: 'buildDissentCase',
        attempt: 2,
        schema: argumentSchema,
      })
    ).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode: 'ARGUMENT_OUTPUT_SCHEMA_VALID',
        issuePath: 'points.0.interpretation',
        argumentStance: 'DISSENTER',
        argumentPointIndex: 0,
        attempt: 2,
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'DISSENT_AI_OUTPUT_INVALID',
      expect.objectContaining({
        operation: 'buildDissentCase',
        invariantCode: 'ARGUMENT_OUTPUT_SCHEMA_VALID',
        issuePath: 'points.0.interpretation',
        argumentStance: 'DISSENTER',
        argumentPointIndex: 0,
        attempt: 2,
      })
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-test-key');
    warning.mockRestore();
  });

  it('reports safe argument array bounds without logging model-authored content', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const point = {
      pointKind: 'EVIDENCE_INTERPRETATION',
      title: 'Private generated point text',
      evidenceClaimIds: ['ev_safe'],
      targetAssumptionIds: ['asm_safe'],
      relation: 'CONTEXT_ONLY',
      qualitativeRationale: 'Private generated rationale text',
      weight: 'CONTEXTUAL',
    } as const;
    const providerSchema = createArgumentDraftJsonSchema(
      ['ev_safe'],
      ['asm_safe'],
      ['lim_safe']
    );
    const client = new DeepSeekResponsesClient({
      apiKey: 'secret-test-key',
      fetchImpl: (async () =>
        deepSeekResponse(
          JSON.stringify({
            summaryRationale: 'Private generated summary text',
            points: Array.from({ length: 6 }, () => ({ ...point })),
          })
        )) as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured({
        ...request,
        operation: 'buildDissentCase',
        schemaName: 'dissent_dissenter_argument_v1',
        schema: ArgumentDraftOutputSchema,
        jsonSchema: providerSchema,
      })
    ).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode: 'ARGUMENT_OUTPUT_SCHEMA_VALID',
        issuePath: 'points',
        argumentStance: 'DISSENTER',
        actualArrayLength: 6,
        permittedMinimum: 1,
        permittedMaximum: 5,
        attempt: 1,
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'DISSENT_AI_OUTPUT_INVALID',
      expect.objectContaining({
        operation: 'buildDissentCase',
        issuePath: 'points',
        argumentStance: 'DISSENTER',
        actualArrayLength: 6,
        permittedMinimum: 1,
        permittedMaximum: 5,
        attempt: 1,
      })
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('Private generated');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-test-key');
    warning.mockRestore();
  });

  it('reports safe scenario array bounds on six scenarios without logging model-authored content', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scenario = {
      name: 'Private scenario name',
      hypotheticalChange: 'Private hypothetical change text',
      affectedAssumptionIds: ['asm_1'],
      relevantEvidenceIds: ['ev_1'],
      relevantArgumentPointIds: ['argp_1'],
      transmissionMechanism: 'Private transmission mechanism text',
      scenarioType: 'MACRO_REGIME_CHANGE',
      plausibility: 'HIGH',
      consequenceForThesis: 'Private consequence text',
      uncertainties: ['Private uncertainty text'],
    } as const;
    const condition = {
      targetAssumptionIds: ['asm_1'],
      relevantEvidenceIds: ['ev_1'],
      statement: 'Private invalidation statement',
      observableEvent: 'Private observable event',
      verificationSourceKind: 'BITGET_MARKET_DATA',
      expectedWindow: 'Private expected window',
    } as const;
    const providerSchema = createStressResearchJsonSchema({
      evidenceIds: ['ev_1'],
      assumptionIds: ['asm_1'],
      argumentPointIds: ['argp_1'],
    });
    const client = new DeepSeekResponsesClient({
      apiKey: 'secret-test-key',
      fetchImpl: (async () =>
        deepSeekResponse(
          JSON.stringify({
            scenarios: Array.from({ length: 6 }, () => ({ ...scenario })),
            invalidationConditions: [condition],
          })
        )) as unknown as typeof fetch,
    });

    await expect(
      client.generateStructured({
        ...request,
        operation: 'generateStressResearch',
        schemaName: 'dissent_stress_research_v1',
        schema: StressResearchDraftOutputSchema,
        jsonSchema: providerSchema,
      })
    ).rejects.toMatchObject({
      code: 'MODEL_OUTPUT_INVALID',
      details: {
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode: 'MODEL_OUTPUT_APPLICATION_SCHEMA_VALID',
        issuePath: 'scenarios',
        actualArrayLength: 6,
        permittedMinimum: 2,
        permittedMaximum: 2,
        attempt: 1,
        issues: [{ code: 'too_big', path: 'scenarios' }],
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'DISSENT_AI_OUTPUT_INVALID',
      expect.objectContaining({
        operation: 'generateStressResearch',
        issuePath: 'scenarios',
        actualArrayLength: 6,
        permittedMinimum: 2,
        permittedMaximum: 2,
        attempt: 1,
      })
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('Private');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-test-key');
    warning.mockRestore();
  });

  it('classifies network failures without leaking the credential', async () => {
    const client = new DeepSeekResponsesClient({
      apiKey: 'secret-test-key',
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });

    const error = await client.generateStructured(request).catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
      retryable: true,
      details: { kind: 'network_failure' },
    });
    expect(JSON.stringify(error)).not.toContain('secret-test-key');
  });

  it('maps aborts to a typed timeout', async () => {
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      })) as typeof fetch;
    const client = new DeepSeekResponsesClient({
      apiKey: 'test-key',
      timeoutMs: 5,
      fetchImpl,
    });

    await expect(client.generateStructured(request)).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    });
  });
});
