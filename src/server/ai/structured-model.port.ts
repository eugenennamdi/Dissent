import type { z } from 'zod';

export interface StructuredModelRequest<TSchema extends z.ZodTypeAny> {
  operation: string;
  attempt?: 1 | 2;
  schemaName: string;
  schema: TSchema;
  jsonSchema: Record<string, unknown>;
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  maxOutputTokens: number;
  reasoningEffort?: 'none' | 'low' | 'high' | 'max';
}

export interface ModelCallMetadata {
  operation?: string;
  attempt?: 1 | 2;
  recoveryKind?: 'TRUNCATION' | 'STRUCTURAL';
  provider: 'DeepSeek';
  requestedModel?: string;
  model: string;
  latencyMs: number;
  requestId?: string;
  configuredOutputTokenBudget: number;
  configuredReasoningEffort: 'none' | 'low' | 'high' | 'max';
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
}

export interface StructuredModelResult<T> {
  data: T;
  metadata: ModelCallMetadata;
}

/** Server-only semantic model boundary. No tools or arbitrary hosts are exposed. */
export interface StructuredModelPort {
  generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredModelRequest<TSchema>
  ): Promise<StructuredModelResult<z.infer<TSchema>>>;
}
