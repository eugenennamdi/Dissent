import { z } from 'zod';
import { DissentError } from '@/core/errors/domain-errors';
import type {
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from './structured-model.port';

const DEEPSEEK_RESPONSES_URL = 'https://api.deepseek.com/responses';
const DEFAULT_MODEL = 'deepseek-flash';
const SUPPORTED_MODELS = new Set(['deepseek-flash', 'deepseek-v4-pro']);
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PROMPT_CHARACTERS = 120_000;

const DeepSeekResponseSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    status: z.enum(['in_progress', 'completed', 'incomplete', 'failed']),
    error: z.unknown().nullable().optional(),
    incomplete_details: z.unknown().nullable().optional(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        input_tokens_details: z
          .object({ cached_tokens: z.number().int().nonnegative().default(0) })
          .default({ cached_tokens: 0 }),
        output_tokens: z.number().int().nonnegative(),
        output_tokens_details: z
          .object({ reasoning_tokens: z.number().int().nonnegative().default(0) })
          .default({ reasoning_tokens: 0 }),
        total_tokens: z.number().int().nonnegative(),
      })
      .optional(),
    output: z.array(
      z
        .object({
          type: z.string(),
          content: z
            .array(
              z
                .object({
                  type: z.string(),
                  text: z.string().optional(),
                })
                .passthrough()
            )
            .optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

export interface DeepSeekResponsesClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class DeepSeekResponsesClient implements StructuredModelPort {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: DeepSeekResponsesClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
    this.model = options.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredModelRequest<TSchema>
  ): Promise<StructuredModelResult<z.infer<TSchema>>> {
    if (!this.apiKey?.trim()) {
      throw DissentError.configurationError(
        'DEEPSEEK_API_KEY is required for the DeepSeek semantic analyst.',
        { environmentVariable: 'DEEPSEEK_API_KEY' }
      );
    }
    if (!SUPPORTED_MODELS.has(this.model)) {
      throw DissentError.configurationError(
        `DEEPSEEK_MODEL must be one of: ${[...SUPPORTED_MODELS].join(', ')}.`,
        { environmentVariable: 'DEEPSEEK_MODEL', configuredModel: this.model }
      );
    }
    if (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1) {
      throw DissentError.invalidInput('maxOutputTokens must be a positive integer.');
    }

    const userText = JSON.stringify(request.userPayload);
    const reasoningEffort = request.reasoningEffort ?? 'low';
    if (request.systemPrompt.length + userText.length > MAX_PROMPT_CHARACTERS) {
      throw DissentError.invalidInput('AI request exceeds the bounded prompt size.', {
        maxCharacters: MAX_PROMPT_CHARACTERS,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = this.now();
    let response: Response;
    try {
      response = await this.fetchImpl(DEEPSEEK_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          instructions: request.systemPrompt,
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: userText }],
            },
          ],
          reasoning: { effort: reasoningEffort },
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              schema: request.jsonSchema,
            },
          },
          max_output_tokens: request.maxOutputTokens,
        }),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw DissentError.timeout(request.operation, this.timeoutMs);
      }
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        'Provider DeepSeek failed: Network request failed',
        {
          cause,
          retryable: true,
          details: { operation: request.operation, kind: 'network_failure' },
        }
      );
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = this.now() - startedAt;
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 1_000);
      throw new DissentError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : 'EXTERNAL_PROVIDER_ERROR',
        `Provider DeepSeek failed with HTTP ${response.status}.`,
        {
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
          details: {
            operation: request.operation,
            statusCode: response.status,
            requestId,
            response: responseText,
          },
        }
      );
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (cause) {
      throw DissentError.modelOutputInvalid(request.operation, 'Response was not valid JSON.', {
        requestId,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const parsedResponse = DeepSeekResponseSchema.safeParse(raw);
    if (!parsedResponse.success) {
      throw DissentError.modelOutputInvalid(
        request.operation,
        'Response envelope did not match the DeepSeek Responses schema.',
        { requestId, issues: parsedResponse.error.issues }
      );
    }
    const usage = parsedResponse.data.usage
      ? {
          inputTokens: parsedResponse.data.usage.input_tokens,
          cachedInputTokens: parsedResponse.data.usage.input_tokens_details.cached_tokens,
          outputTokens: parsedResponse.data.usage.output_tokens,
          reasoningTokens:
            parsedResponse.data.usage.output_tokens_details.reasoning_tokens,
          totalTokens: parsedResponse.data.usage.total_tokens,
        }
      : undefined;
    const incompleteReason =
      parsedResponse.data.incomplete_details &&
      typeof parsedResponse.data.incomplete_details === 'object' &&
      'reason' in parsedResponse.data.incomplete_details
        ? String(parsedResponse.data.incomplete_details.reason)
        : undefined;
    if (
      parsedResponse.data.status === 'incomplete' &&
      incompleteReason === 'max_output_tokens'
    ) {
      const details = {
        provider: 'DeepSeek',
        operation: request.operation,
        requestedModel: this.model,
        actualModel: parsedResponse.data.model,
        responseStatus: parsedResponse.data.status,
        incompleteReason,
        configuredOutputTokenBudget: request.maxOutputTokens,
        configuredReasoningEffort: reasoningEffort,
        usage,
        requestId,
      };
      console.warn('DISSENT_AI_OUTPUT_TRUNCATED', details);
      throw DissentError.outputTruncated(request.operation, details);
    }
    if (parsedResponse.data.status !== 'completed') {
      throw DissentError.modelOutputInvalid(
        request.operation,
        `Response status was ${parsedResponse.data.status}.`,
        {
          operation: request.operation,
          requestedModel: this.model,
          actualModel: parsedResponse.data.model,
          responseStatus: parsedResponse.data.status,
          incompleteReason,
          configuredOutputTokenBudget: request.maxOutputTokens,
          configuredReasoningEffort: reasoningEffort,
          usage,
          requestId,
        }
      );
    }

    const content = parsedResponse.data.output.flatMap((item) => item.content ?? []);
    const outputText = content.find((item) => item.type === 'output_text')?.text;
    if (!outputText) {
      throw DissentError.modelOutputInvalid(request.operation, 'Response contained no output_text.', {
        requestId,
        requestedModel: this.model,
        actualModel: parsedResponse.data.model,
        configuredOutputTokenBudget: request.maxOutputTokens,
        configuredReasoningEffort: reasoningEffort,
        usage,
      });
    }

    let modelValue: unknown;
    try {
      modelValue = JSON.parse(outputText);
    } catch (cause) {
      throw DissentError.modelOutputInvalid(request.operation, 'output_text was not valid JSON.', {
        requestId,
        requestedModel: this.model,
        actualModel: parsedResponse.data.model,
        configuredOutputTokenBudget: request.maxOutputTokens,
        configuredReasoningEffort: reasoningEffort,
        usage,
        structuredOutputCharacters: outputText.length,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const validated = request.schema.safeParse(modelValue);
    if (!validated.success) {
      const issues = validated.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map(String).join('.'),
        ...(issue.code === 'invalid_type'
          ? { expected: issue.expected, received: issue.received }
          : {}),
      }));
      const failedAssessmentIndex = validated.error.issues.find(
        (issue) => issue.path[0] === 'assumptionAssessments' && typeof issue.path[1] === 'number'
      )?.path[1];
      const failedAssumptionId =
        typeof failedAssessmentIndex === 'number' &&
        modelValue !== null &&
        typeof modelValue === 'object' &&
        'assumptionAssessments' in modelValue &&
        Array.isArray(modelValue.assumptionAssessments)
          ? modelValue.assumptionAssessments[failedAssessmentIndex]?.assumptionId
          : undefined;
      const safeAssumptionId =
        typeof failedAssumptionId === 'string' &&
        /^asm_[A-Za-z0-9_-]{1,100}$/.test(failedAssumptionId)
          ? failedAssumptionId
          : undefined;
      const issuePath = issues[0]?.path;
      const argumentStance =
        request.operation === 'buildAdvocateCase'
          ? 'ADVOCATE'
          : request.operation === 'buildDissentCase'
            ? 'DISSENTER'
            : undefined;
      const argumentPointMatch = issuePath
        ? /(?:^|\.)points(?:\.|\[)(\d+)/.exec(issuePath)
        : null;
      const argumentPointIndex = argumentPointMatch
        ? Number(argumentPointMatch[1])
        : undefined;
      const invariantCode = argumentStance
        ? 'ARGUMENT_OUTPUT_SCHEMA_VALID'
        : 'MODEL_OUTPUT_APPLICATION_SCHEMA_VALID';
      const safeExplanation = argumentStance
        ? 'The argument response did not match the required application schema.'
        : 'The structured response did not match the required application schema.';
      console.warn('DISSENT_AI_OUTPUT_INVALID', {
        provider: 'DeepSeek',
        operation: request.operation,
        requestedModel: this.model,
        actualModel: parsedResponse.data.model,
        validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
        invariantCode,
        issuePath,
        safeExplanation,
        argumentStance,
        argumentPointIndex,
        assumptionId: safeAssumptionId,
        issues,
        attempt: request.attempt ?? 1,
        requestId,
      });
      throw DissentError.modelOutputInvalid(
        request.operation,
        'Structured output did not match its application schema.',
        {
          requestId,
          requestedModel: this.model,
          actualModel: parsedResponse.data.model,
          configuredOutputTokenBudget: request.maxOutputTokens,
          configuredReasoningEffort: reasoningEffort,
          usage,
          structuredOutputCharacters: outputText.length,
          validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
          invariantCode,
          issuePath,
          safeExplanation,
          argumentStance,
          argumentPointIndex,
          assumptionId: safeAssumptionId,
          issues,
          attempt: request.attempt ?? 1,
        }
      );
    }

    return {
      data: validated.data,
      metadata: {
        provider: 'DeepSeek',
        requestedModel: this.model,
        model: parsedResponse.data.model,
        latencyMs,
        requestId,
        configuredOutputTokenBudget: request.maxOutputTokens,
        configuredReasoningEffort: reasoningEffort,
        usage,
      },
    };
  }
}
