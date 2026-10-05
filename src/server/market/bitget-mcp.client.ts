import { DissentError } from '@/core/errors/domain-errors';
import {
  McpResponseEnvelopeSchema,
  McpStructuredContentSchema,
  McpStructuredDataPayloadSchema,
  type McpResponseEnvelope,
  type McpStructuredDataPayload,
} from './bitget-mcp.schemas';

export const BITGET_MCP_ENDPOINT = 'https://agent.bitget.com/mcp';
export const DEFAULT_MCP_TIMEOUT_MS = 8_000;
export const MAX_MCP_RESPONSE_SIZE_BYTES = 1_048_576; // 1 MB limit
// ponytail: single retry only — bounded, not exponential. Upgrade to jittered exponential if Bitget MCP becomes flaky at scale.
export const DEFAULT_MCP_MAX_RETRIES = 1;
export const DEFAULT_MCP_RETRY_DELAY_MS = 500;
// ponytail: 30s cooldown prevents hammering a dead upstream across multiple query dimensions within one adapter call.
export const INIT_FAILURE_COOLDOWN_MS = 30_000;
export const DEFAULT_MCP_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-03-26'] as const;
export type SupportedMcpProtocolVersion =
  (typeof SUPPORTED_MCP_PROTOCOL_VERSIONS)[number];

/**
 * Structured diagnostic logger for MCP boundaries.
 * Emits safe metadata only (no secrets, prompts, thesis text, session IDs, market values, or raw bodies).
 */
export function logMcpDiag(event: string, data: Record<string, unknown>): void {
  console.log(`[DISSENT_MCP_DIAG] ${event}: ${JSON.stringify(data)}`);
}

/**
 * Sanitizes provider-originated error strings to prevent leaking payload fragments,
 * multiline injections, or unbounded content into diagnostics.
 * Bounded to max 200 characters, strips control characters and newlines.
 */
export function sanitizeProviderError(
  raw: unknown,
  maxLength = 200
): string | undefined {
  const str =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : raw !== null && raw !== undefined
          ? String(raw)
          : '';
  if (!str) return undefined;
  const singleLine = str.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
  if (!singleLine) return undefined;
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

export interface BitgetMcpClientConfig {
  endpoint?: string;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetch?: typeof fetch;
  retryDelayMs?: number;
  initCooldownMs?: number;
  now?: () => number;
  offeredProtocolVersion?: string;
  supportedProtocolVersions?: readonly string[];
}

export interface McpQueryResult<T = unknown> {
  results: T;
  provider?: string;
  sessionId: string | null;
  retrievedAt: string;
}

export interface McpNormalizedStructuredData {
  provider?: string;
  results: unknown;
}

/**
 * Normalizes structuredContent.data from Bitget MCP.
 * Handles both object representations and JSON-string representations.
 * Strictly validates that the data payload contains valid results before returning.
 * Fails closed on malformed JSON, primitives, or invalid payload schema.
 */
export function normalizeStructuredData(
  raw: unknown,
  entryId: string,
  maxSizeBytes: number = MAX_MCP_RESPONSE_SIZE_BYTES
): McpNormalizedStructuredData {
  const originalType =
    raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;

  // Case A: raw is already a non-null object (not array)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const validation = McpStructuredDataPayloadSchema.safeParse(raw);
    if (!validation.success) {
      logMcpDiag('structured_data_normalization', {
        entryId,
        originalType: 'object',
        jsonParseSucceeded: true,
        parsedType: 'object',
        downstreamValidationSucceeded: false,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        `Provider Bitget MCP failed: Bitget MCP query ${entryId} structured data object does not satisfy provider payload schema`,
        {
          details: { kind: 'invalid_response', entryId },
          retryable: false,
        }
      );
    }

    logMcpDiag('structured_data_normalization', {
      entryId,
      originalType: 'object',
      jsonParseSucceeded: true,
      parsedType: 'object',
      downstreamValidationSucceeded: true,
    });

    return validation.data;
  }

  // Case B: raw is a string (production Bitget MCP representation)
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const stringLength = trimmed.length;

    if (stringLength === 0 || stringLength > maxSizeBytes) {
      logMcpDiag('structured_data_normalization', {
        entryId,
        originalType: 'string',
        stringLength,
        jsonParseSucceeded: false,
        parsedType: stringLength === 0 ? 'empty' : 'oversized',
        downstreamValidationSucceeded: false,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        `Provider Bitget MCP failed: Bitget MCP query ${entryId} structured data string is ${stringLength === 0 ? 'empty' : 'exceeds size limit'}`,
        {
          details: { kind: 'invalid_response', stringLength, entryId },
          retryable: false,
        }
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmed);
    } catch (err: unknown) {
      logMcpDiag('structured_data_normalization', {
        entryId,
        originalType: 'string',
        stringLength,
        jsonParseSucceeded: false,
        parsedType: 'unparseable',
        downstreamValidationSucceeded: false,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        `Provider Bitget MCP failed: Bitget MCP query ${entryId} structured data string contains malformed JSON`,
        {
          details: {
            kind: 'invalid_response',
            error: err instanceof Error ? err.message : String(err),
            entryId,
          },
          retryable: false,
        }
      );
    }

    const parsedType =
      parsedJson === null
        ? 'null'
        : Array.isArray(parsedJson)
          ? 'array'
          : typeof parsedJson;

    if (parsedType !== 'object') {
      logMcpDiag('structured_data_normalization', {
        entryId,
        originalType: 'string',
        stringLength,
        jsonParseSucceeded: true,
        parsedType,
        downstreamValidationSucceeded: false,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        `Provider Bitget MCP failed: Bitget MCP query ${entryId} structured data parsed to unsupported primitive (${parsedType})`,
        {
          details: { kind: 'invalid_response', parsedType, entryId },
          retryable: false,
        }
      );
    }

    const validation = McpStructuredDataPayloadSchema.safeParse(parsedJson);
    if (!validation.success) {
      logMcpDiag('structured_data_normalization', {
        entryId,
        originalType: 'string',
        stringLength,
        jsonParseSucceeded: true,
        parsedType: 'object',
        downstreamValidationSucceeded: false,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        `Provider Bitget MCP failed: Bitget MCP query ${entryId} structured data does not satisfy provider payload schema`,
        {
          details: { kind: 'invalid_response', entryId },
          retryable: false,
        }
      );
    }

    logMcpDiag('structured_data_normalization', {
      entryId,
      originalType: 'string',
      stringLength,
      jsonParseSucceeded: true,
      parsedType: 'object',
      downstreamValidationSucceeded: true,
    });

    return validation.data;
  }

  // Case C: Missing, null, or unsupported type
  logMcpDiag('structured_data_normalization', {
    entryId,
    originalType,
    jsonParseSucceeded: false,
    parsedType: 'invalid',
    downstreamValidationSucceeded: false,
  });
  throw new DissentError(
    'EXTERNAL_PROVIDER_ERROR',
    `Provider Bitget MCP failed: Bitget MCP query ${entryId} missing or invalid structured data`,
    {
      details: { kind: 'invalid_response', originalType, entryId },
      retryable: false,
    }
  );
}

/**
 * Read-only Bitget MCP JSON-RPC client.
 * Restricts queries to the verified Bitget MCP host and only uses read-only do_query tool calls.
 * Never connects trading tools, accounts, or order endpoints.
 */
export class BitgetMcpClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSizeBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelayMs: number;
  private readonly initCooldownMs: number;
  private readonly now: () => number;
  private readonly offeredProtocolVersion: string;
  private readonly supportedProtocolVersions: readonly string[];
  private sessionId: string | null = null;
  private negotiatedProtocolVersion: string | null = null;
  private initialized = false;
  private initFailedAt: number | null = null;
  private nextId = 1;

  constructor(config: BitgetMcpClientConfig = {}) {
    const endpoint = config.endpoint ?? BITGET_MCP_ENDPOINT;
    if (endpoint !== BITGET_MCP_ENDPOINT) {
      throw DissentError.invalidInput(
        `Bitget MCP endpoint must be approved host ${BITGET_MCP_ENDPOINT}`
      );
    }
    if (
      config.timeoutMs !== undefined &&
      (!Number.isInteger(config.timeoutMs) ||
        config.timeoutMs < 100 ||
        config.timeoutMs > 30_000)
    ) {
      throw DissentError.invalidInput(
        'Bitget MCP timeoutMs must be an integer from 100 to 30000'
      );
    }

    this.endpoint = endpoint;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    this.maxResponseSizeBytes =
      config.maxResponseSizeBytes ?? MAX_MCP_RESPONSE_SIZE_BYTES;
    this.fetchImpl = config.fetch ?? fetch;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_MCP_RETRY_DELAY_MS;
    this.initCooldownMs = config.initCooldownMs ?? INIT_FAILURE_COOLDOWN_MS;
    this.now = config.now ?? Date.now;
    this.offeredProtocolVersion =
      config.offeredProtocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION;
    this.supportedProtocolVersions =
      config.supportedProtocolVersions ?? SUPPORTED_MCP_PROTOCOL_VERSIONS;
  }

  getOfferedProtocolVersion(): string {
    return this.offeredProtocolVersion;
  }

  getSupportedProtocolVersions(): readonly string[] {
    return this.supportedProtocolVersions;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  getNegotiatedProtocolVersion(): string | null {
    return this.negotiatedProtocolVersion;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initializes MCP session with the server.
   */
  async initialize(): Promise<string | null> {
    const t0 = this.now();
    logMcpDiag('initialize_request_start', { operation: 'initialize' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'initialize',
          params: {
            protocolVersion: this.offeredProtocolVersion,
            capabilities: {},
            clientInfo: { name: 'dissent-equity-desk', version: '1.0.0' },
          },
        }),
        signal: controller.signal,
      });

      const durationMs = this.now() - t0;
      const contentType = res.headers.get('content-type') ?? '';
      const hasSessionHeader = res.headers.has('mcp-session-id');

      if (!res.ok) {
        logMcpDiag('initialize_response', {
          operation: 'initialize',
          status: res.status,
          contentType,
          durationMs,
          hasSessionHeader,
          hasResult: false,
          hasJsonRpcError: false,
        });
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP initialize returned HTTP ${res.status}`,
          { statusCode: res.status }
        );
      }

      const sid =
        res.headers.get('mcp-session-id') || res.headers.get('MCP-Session-Id');
      if (sid) {
        this.sessionId = sid;
      }

      const text = await res.text();
      if (text.length > this.maxResponseSizeBytes) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          'Bitget MCP initialize response size exceeded limit',
          { size: text.length }
        );
      }

      const envelope = this.parseJsonRpcText(text);

      logMcpDiag('initialize_response', {
        operation: 'initialize',
        status: res.status,
        contentType,
        durationMs,
        hasSessionHeader,
        hasResult: envelope.result !== undefined,
        hasJsonRpcError: envelope.error !== undefined,
        ...(typeof envelope.result?.protocolVersion === 'string'
          ? { protocolVersion: envelope.result.protocolVersion }
          : {}),
        ...(envelope.error
          ? {
              jsonRpcErrorCode: envelope.error.code,
              jsonRpcErrorMessage: sanitizeProviderError(envelope.error.message),
            }
          : {}),
      });

      if (envelope.error) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP initialize error: ${envelope.error.message}`,
          { code: envelope.error.code, data: envelope.error.data }
        );
      }

      const serverProtocolVersion = envelope.result?.protocolVersion;
      if (
        typeof serverProtocolVersion !== 'string' ||
        !this.supportedProtocolVersions.includes(serverProtocolVersion)
      ) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Unsupported Bitget MCP protocol version: ${serverProtocolVersion ?? 'missing'} (supported: ${this.supportedProtocolVersions.join(', ')})`,
          {
            supportedVersions: this.supportedProtocolVersions,
            negotiatedVersion: serverProtocolVersion,
          }
        );
      }

      // Retain negotiated protocol version
      this.negotiatedProtocolVersion = serverProtocolVersion;

      // Send notifications/initialized before completing handshake
      await this.sendInitializedNotification();

      this.initialized = true;
      this.initFailedAt = null;
      logMcpDiag('initialize_session', {
        operation: 'initialize',
        hasSessionId: this.sessionId !== null,
        protocolVersion: this.negotiatedProtocolVersion,
      });
      return this.sessionId;
    } catch (error: unknown) {
      // Reset all session/handshake state on failure
      this.sessionId = null;
      this.negotiatedProtocolVersion = null;
      this.initialized = false;

      logMcpDiag('initialize_error', {
        operation: 'initialize',
        durationMs: this.now() - t0,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: sanitizeProviderError(
          error instanceof Error ? error.message : String(error)
        ),
        normalizedErrorCode: error instanceof DissentError ? error.code : undefined,
      });
      if (error instanceof DissentError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        throw DissentError.timeout('Bitget MCP initialize', this.timeoutMs);
      }
      throw DissentError.externalProviderError(
        'Bitget MCP',
        'Transport failure connecting to Bitget MCP initialize',
        {
          kind: 'network_failure',
          message: error instanceof Error ? error.message : String(error),
        }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Sends the standard MCP `notifications/initialized` notification.
   * According to the MCP specification (2025-03-26), a client sends this
   * after receiving a successful InitializeResult before making tool calls.
   * Note: In HTTP transport, notifications are sent as a POST with no result expected.
   */
  async sendInitializedNotification(): Promise<void> {
    const t0 = this.now();
    logMcpDiag('initialized_notification_request_start', {
      operation: 'initialized_notification',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }
    if (this.negotiatedProtocolVersion) {
      headers['MCP-Protocol-Version'] = this.negotiatedProtocolVersion;
    }

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        }),
        signal: controller.signal,
      });

      const durationMs = this.now() - t0;
      const contentType = res.headers.get('content-type') ?? '';
      const hasSessionHeader =
        res.headers.has('mcp-session-id') || res.headers.has('MCP-Session-Id');

      const sid =
        res.headers.get('mcp-session-id') || res.headers.get('MCP-Session-Id');
      if (sid) {
        this.sessionId = sid;
      }

      logMcpDiag('initialized_notification_response', {
        operation: 'initialized_notification',
        status: res.status,
        contentType,
        durationMs,
        hasSessionHeader,
      });

      if (!res.ok) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP notifications/initialized returned HTTP ${res.status}`,
          { statusCode: res.status }
        );
      }

      // Check if server returned a body with a JSON-RPC error.
      // Notifications may receive empty responses (200, 202, 204), which are valid acknowledgements.
      const text = await res.text();
      if (text.trim().length > 0) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && parsed.error) {
            const errObj = parsed.error;
            throw DissentError.externalProviderError(
              'Bitget MCP',
              `Bitget MCP notifications/initialized error: ${errObj.message ?? 'Unknown error'}`,
              { code: errObj.code, data: errObj.data }
            );
          }
        } catch (err: unknown) {
          if (err instanceof DissentError) throw err;
          // Non-JSON or empty response on 2xx status is accepted as valid acknowledgement
        }
      }
    } catch (error: unknown) {
      logMcpDiag('initialized_notification_error', {
        operation: 'initialized_notification',
        durationMs: this.now() - t0,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: sanitizeProviderError(
          error instanceof Error ? error.message : String(error)
        ),
        normalizedErrorCode:
          error instanceof DissentError ? error.code : undefined,
      });
      if (error instanceof DissentError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        throw DissentError.timeout(
          'Bitget MCP notifications/initialized',
          this.timeoutMs
        );
      }
      throw DissentError.externalProviderError(
        'Bitget MCP',
        'Transport failure sending Bitget MCP notifications/initialized',
        {
          kind: 'network_failure',
          message: error instanceof Error ? error.message : String(error),
        }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes a read-only query using Bitget MCP's `do_query` tool.
   * Retries once on transient errors (timeout, network failure) since MCP reads are idempotent.
   */
  async executeQuery<T = unknown>(
    entryId: string,
    params: Record<string, unknown>
  ): Promise<McpQueryResult<T>> {
    // Fast-fail before entering retry loop if initialization recently failed during a prior query
    if (
      !this.initialized &&
      this.initFailedAt !== null &&
      this.now() - this.initFailedAt < this.initCooldownMs
    ) {
      const elapsedSinceFailureMs = this.now() - this.initFailedAt;
      logMcpDiag('cooldown_fast_fail', {
        entryId,
        cooldownMs: this.initCooldownMs,
        elapsedSinceFailureMs,
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        'Bitget MCP initialization failed recently, skipping redundant retry',
        {
          details: {
            kind: 'network_failure',
            cooldownMs: this.initCooldownMs,
            entryId,
          },
          retryable: false,
        }
      );
    }

    let lastError: DissentError | undefined;
    for (let attempt = 0; attempt <= DEFAULT_MCP_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logMcpDiag('retry_attempt', {
          operation: 'tool_call',
          entryId,
          attempt,
          delayMs: this.retryDelayMs,
          lastErrorCode: lastError?.code,
          lastErrorMessage: sanitizeProviderError(lastError?.message),
        });
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }
      try {
        return await this.executeQueryAttempt<T>(entryId, params, attempt);
      } catch (error: unknown) {
        if (!(error instanceof DissentError) || !error.retryable) throw error;
        lastError = error;
      }
    }

    // Cooldown is recorded only after all bounded attempts for this query are exhausted without a session
    if (!this.initialized) {
      this.initFailedAt = this.now();
    }

    throw lastError!;
  }

  private async executeQueryAttempt<T>(
    entryId: string,
    params: Record<string, unknown>,
    attempt = 0
  ): Promise<McpQueryResult<T>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const t0 = this.now();
    logMcpDiag('tool_call_request_start', {
      operation: 'tool_call',
      entryId,
      attempt,
      hasSessionId: this.sessionId !== null,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const retrievedAt = new Date().toISOString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }
    if (this.negotiatedProtocolVersion) {
      headers['MCP-Protocol-Version'] = this.negotiatedProtocolVersion;
    }

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'tools/call',
          params: {
            name: 'do_query',
            arguments: {
              entry_id: entryId,
              params,
            },
          },
        }),
        signal: controller.signal,
      });

      const durationMs = this.now() - t0;
      const contentType = res.headers.get('content-type') ?? '';
      const hasSessionHeader =
        res.headers.has('mcp-session-id') || res.headers.has('MCP-Session-Id');

      // Update session ID if header is refreshed
      const sid =
        res.headers.get('mcp-session-id') || res.headers.get('MCP-Session-Id');
      if (sid) {
        this.sessionId = sid;
      }

      if (!res.ok) {
        logMcpDiag('tool_call_response', {
          operation: 'tool_call',
          entryId,
          attempt,
          status: res.status,
          contentType,
          durationMs,
          hasSessionHeader,
          hasResult: false,
          hasJsonRpcError: false,
        });
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP tools/call returned HTTP ${res.status}`,
          { statusCode: res.status, entryId }
        );
      }

      const text = await res.text();
      const isSse = text.includes('data: ');
      if (text.length > this.maxResponseSizeBytes) {
        throw new DissentError(
          'EXTERNAL_PROVIDER_ERROR',
          `Provider Bitget MCP failed: Bitget MCP response size exceeded limit for ${entryId}`,
          {
            details: { kind: 'invalid_response', size: text.length, entryId },
            retryable: false,
          }
        );
      }

      const envelope = this.parseJsonRpcText(text);

      if (envelope.error) {
        logMcpDiag('tool_call_response', {
          operation: 'tool_call',
          entryId,
          attempt,
          status: res.status,
          contentType,
          durationMs,
          hasSessionHeader,
          isSse,
          hasResult: false,
          hasJsonRpcError: true,
          jsonRpcErrorCode: envelope.error.code,
          jsonRpcErrorMessage: sanitizeProviderError(envelope.error.message),
        });
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP query error: ${envelope.error.message}`,
          { code: envelope.error.code, data: envelope.error.data, entryId }
        );
      }

      let struct = envelope.result?.structuredContent;
      if (!struct && envelope.result?.content && envelope.result.content.length > 0) {
        const first = envelope.result.content[0] as Record<string, unknown> | undefined;
        if (first && typeof first.text === 'string') {
          try {
            const parsed = JSON.parse(first.text);
            struct = McpStructuredContentSchema.parse(parsed);
          } catch {
            // retain undefined
          }
        }
      }

      if (!struct) {
        logMcpDiag('parser_validation_failure', {
          stage: 'structured_content',
          entryId,
          error: 'missing structuredContent',
        });
        throw new DissentError(
          'EXTERNAL_PROVIDER_ERROR',
          `Provider Bitget MCP failed: Bitget MCP query ${entryId} missing structuredContent`,
          {
            details: { kind: 'invalid_response', result: envelope.result, entryId },
            retryable: false,
          }
        );
      }

      if (!struct.success || struct.status_code !== 200) {
        logMcpDiag('tool_call_response', {
          operation: 'tool_call',
          entryId,
          attempt,
          status: res.status,
          contentType,
          durationMs,
          hasSessionHeader,
          isSse,
          hasResult: true,
          hasJsonRpcError: false,
          toolStatusCode: struct.status_code,
          toolSuccess: struct.success,
          toolError: sanitizeProviderError(struct.error),
        });
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP query ${entryId} failed with status ${struct.status_code}: ${struct.error ?? 'Unsuccessful'}`,
          {
            statusCode: struct.status_code,
            toolError: struct.error,
            entryId,
          }
        );
      }

      const normalizedData = normalizeStructuredData(
        struct.data,
        entryId,
        this.maxResponseSizeBytes
      );

      const resultCount = Array.isArray(normalizedData.results)
        ? normalizedData.results.length
        : normalizedData.results !== undefined
          ? 1
          : 0;

      logMcpDiag('tool_call_response', {
        operation: 'tool_call',
        entryId,
        attempt,
        status: res.status,
        contentType,
        durationMs,
        hasSessionHeader,
        isSse,
        hasResult: true,
        hasJsonRpcError: false,
        toolStatusCode: struct.status_code,
        toolSuccess: struct.success,
        resultCount,
      });

      return {
        results: normalizedData.results as T,
        provider: normalizedData.provider,
        sessionId: this.sessionId,
        retrievedAt,
      };
    } catch (error: unknown) {
      logMcpDiag('tool_call_error', {
        operation: 'tool_call',
        entryId,
        attempt,
        durationMs: this.now() - t0,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: sanitizeProviderError(
          error instanceof Error ? error.message : String(error)
        ),
        normalizedErrorCode: error instanceof DissentError ? error.code : undefined,
      });
      if (error instanceof DissentError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.includes('aborted'))
      ) {
        throw DissentError.timeout(
          `Bitget MCP query ${entryId}`,
          this.timeoutMs,
          { entryId }
        );
      }
      throw DissentError.externalProviderError(
        'Bitget MCP',
        `Transport failure connecting to Bitget MCP for ${entryId}`,
        {
          kind: 'network_failure',
          message: error instanceof Error ? error.message : String(error),
          entryId,
        }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJsonRpcText(rawText: string): McpResponseEnvelope {
    let textToParse = rawText.trim();
    const isSse = textToParse.includes('data: ');
    // Handle Server-Sent Events (SSE) data lines
    if (isSse) {
      const dataLine = textToParse
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data: '));
      if (dataLine) {
        textToParse = dataLine.slice('data: '.length).trim();
      }
    }

    try {
      const json = JSON.parse(textToParse);
      return McpResponseEnvelopeSchema.parse(json);
    } catch (err: unknown) {
      logMcpDiag('parser_validation_failure', {
        stage: 'json_rpc_envelope',
        rawLength: rawText.length,
        isSse,
        error: sanitizeProviderError(err instanceof Error ? err.message : String(err)),
      });
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        'Provider Bitget MCP failed: Failed to parse Bitget MCP JSON-RPC envelope',
        {
          details: {
            kind: 'invalid_response',
            rawLength: rawText.length,
            error: err instanceof Error ? err.message : String(err),
          },
          retryable: false,
        }
      );
    }
  }
}
