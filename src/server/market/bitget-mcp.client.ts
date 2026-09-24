import { DissentError } from '@/core/errors/domain-errors';
import {
  McpResponseEnvelopeSchema,
  McpStructuredContentSchema,
  type McpResponseEnvelope,
} from './bitget-mcp.schemas';

export const BITGET_MCP_ENDPOINT = 'https://agent.bitget.com/mcp';
export const DEFAULT_MCP_TIMEOUT_MS = 8_000;
export const MAX_MCP_RESPONSE_SIZE_BYTES = 1_048_576; // 1 MB limit

export interface BitgetMcpClientConfig {
  endpoint?: string;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetch?: typeof fetch;
}

export interface McpQueryResult<T = unknown> {
  results: T;
  provider?: string;
  sessionId: string | null;
  retrievedAt: string;
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
  private sessionId: string | null = null;
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
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  /**
   * Initializes MCP session with the server.
   */
  async initialize(): Promise<string | null> {
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
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'dissent-equity-desk', version: '1.0.0' },
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP initialize returned HTTP ${res.status}`,
          { statusCode: res.status }
        );
      }

      const sid = res.headers.get('mcp-session-id');
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
      if (envelope.error) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP initialize error: ${envelope.error.message}`,
          { code: envelope.error.code, data: envelope.error.data }
        );
      }

      return this.sessionId;
    } catch (error: unknown) {
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
   * Executes a read-only query using Bitget MCP's `do_query` tool.
   */
  async executeQuery<T = unknown>(
    entryId: string,
    params: Record<string, unknown>
  ): Promise<McpQueryResult<T>> {
    if (!this.sessionId) {
      await this.initialize();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const retrievedAt = new Date().toISOString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
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

      // Update session ID if header is refreshed
      const sid = res.headers.get('mcp-session-id');
      if (sid) {
        this.sessionId = sid;
      }

      if (!res.ok) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP tools/call returned HTTP ${res.status}`,
          { statusCode: res.status, entryId }
        );
      }

      const text = await res.text();
      if (text.length > this.maxResponseSizeBytes) {
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP response size exceeded limit for ${entryId}`,
          { size: text.length, entryId }
        );
      }

      const envelope = this.parseJsonRpcText(text);

      if (envelope.error) {
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
        throw DissentError.externalProviderError(
          'Bitget MCP',
          `Bitget MCP query ${entryId} missing structuredContent`,
          { kind: 'invalid_response', result: envelope.result, entryId }
        );
      }

      if (!struct.success || struct.status_code !== 200) {
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

      return {
        results: struct.data?.results as T,
        provider: struct.data?.provider,
        sessionId: this.sessionId,
        retrievedAt,
      };
    } catch (error: unknown) {
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
    // Handle Server-Sent Events (SSE) data lines
    if (textToParse.includes('data: ')) {
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
      throw DissentError.externalProviderError(
        'Bitget MCP',
        'Failed to parse Bitget MCP JSON-RPC envelope',
        {
          kind: 'invalid_response',
          rawLength: rawText.length,
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }
}
