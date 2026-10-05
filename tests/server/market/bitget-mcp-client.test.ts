import { describe, expect, it, vi } from 'vitest';
import { DissentError } from '@/core/errors/domain-errors';
import {
  BitgetMcpClient,
  DEFAULT_MCP_PROTOCOL_VERSION,
  INIT_FAILURE_COOLDOWN_MS,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  sanitizeProviderError,
} from '@/server/market/bitget-mcp.client';
import {
  SANITY_MCP_INIT_RESPONSE,
  SANITY_MCP_QUOTE_RESPONSE,
} from '../../fixtures/bitget-mcp-nvda.fixtures';

function okInitResponse() {
  return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': 'test-session',
    },
  });
}

function okQueryResponse() {
  return new Response(JSON.stringify(SANITY_MCP_QUOTE_RESPONSE), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': 'test-session',
    },
  });
}

describe('BitgetMcpClient retry and cooldown behavior', () => {
  it('TEST 1 — transient initialization timeout recovers on genuine retry', async () => {
    let initCallCount = 0;
    const recoveringInitFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        initCallCount++;
        if (initCallCount === 1) {
          // First initialize attempt: transient timeout
          return new Promise<Response>((_, reject) => {
            reject(new DOMException('Timed out', 'AbortError'));
          });
        }
        // Second initialize attempt: recovers
        return Promise.resolve(okInitResponse());
      }

      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: recoveringInitFetch,
      timeoutMs: 150,
      retryDelayMs: 0,
    });

    const result = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });

    // Genuine retry must have occurred
    expect(initCallCount).toBe(2);
    expect(result.results).toBeDefined();
    expect(client.getSessionId()).toBe('test-session');
    // Cooldown must not be set
    expect((client as any).initFailedAt).toBeNull();
  });

  it('TEST 2 — sustained initialization outage preserves actual timeout and sets cooldown after exhaustion', async () => {
    let currentTime = 1_000_000;
    let initCallCount = 0;
    const deadInitFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        initCallCount++;
        return new Promise<Response>((_, reject) => {
          reject(new DOMException('Timed out', 'AbortError'));
        });
      }

      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: deadInitFetch,
      timeoutMs: 150,
      retryDelayMs: 0,
      now: () => currentTime,
    });

    const err = await client
      .executeQuery('equity_price_quote', { symbol: 'NVDA' })
      .catch((e: unknown) => e);

    // Both bounded attempts must have executed
    expect(initCallCount).toBe(2);
    // Preserves the real upstream TIMEOUT error, NOT artificial EXTERNAL_PROVIDER_ERROR
    expect(err).toBeInstanceOf(DissentError);
    expect((err as DissentError).code).toBe('TIMEOUT');
    expect((err as DissentError).message).toContain('Bitget MCP initialize');
    // Cooldown recorded only after retries were exhausted
    expect((client as any).initFailedAt).toBe(currentTime);
  });

  it('TEST 3 — next separate query during cooldown fast-fails without retrying', async () => {
    let currentTime = 1_000_000;
    let initCallCount = 0;
    const deadInitFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        initCallCount++;
        return new Promise<Response>((_, reject) => {
          reject(new DOMException('Timed out', 'AbortError'));
        });
      }

      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: deadInitFetch,
      timeoutMs: 150,
      retryDelayMs: 0,
      now: () => currentTime,
    });

    // Query 1 exhausts retries and enters cooldown
    await expect(
      client.executeQuery('equity_price_quote', { symbol: 'NVDA' })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(initCallCount).toBe(2);

    // Query 2 starts while cooldown is active (5ms later)
    currentTime += 5;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const query2Err = await client
      .executeQuery('equity_fundamental_ratios', { symbol: 'NVDA' })
      .catch((e: unknown) => e);

    // Verify fast-fail semantics deterministically:
    // 1. Performs ZERO initialize calls
    expect(initCallCount).toBe(2);
    // 2. Performs ZERO retry sleeps (and zero timers created)
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();

    // 3. Immediately throws the non-retryable cooldown error
    expect(query2Err).toBeInstanceOf(DissentError);
    expect((query2Err as DissentError).code).toBe('EXTERNAL_PROVIDER_ERROR');
    expect((query2Err as DissentError).retryable).toBe(false);
    expect((query2Err as DissentError).message).toContain(
      'Bitget MCP initialization failed recently, skipping redundant retry'
    );
  });

  it('TEST 4 — cooldown expires and recovery clears cooldown state', async () => {
    let currentTime = 1_000_000;
    let initCallCount = 0;
    let upstreamHealthy = false;

    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        initCallCount++;
        if (!upstreamHealthy) {
          return new Promise<Response>((_, reject) => {
            reject(new DOMException('Timed out', 'AbortError'));
          });
        }
        return Promise.resolve(okInitResponse());
      }

      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: mockFetch,
      timeoutMs: 150,
      retryDelayMs: 0,
      now: () => currentTime,
    });

    // First query fails and sets cooldown
    await expect(
      client.executeQuery('equity_price_quote', { symbol: 'NVDA' })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(initCallCount).toBe(2);
    expect((client as any).initFailedAt).toBe(currentTime);

    // Upstream recovers and time advances past cooldown window
    upstreamHealthy = true;
    currentTime += INIT_FAILURE_COOLDOWN_MS + 1;

    // Second query should attempt initialize again and succeed
    const result = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });
    expect(initCallCount).toBe(3);
    expect(result.results).toBeDefined();
    // Cooldown state must be cleared
    expect((client as any).initFailedAt).toBeNull();

    // Subsequent query uses existing session without new initialize
    await client.executeQuery('equity_fundamental_ratios', { symbol: 'NVDA' });
    expect(initCallCount).toBe(3);
  });

  it('TEST 5 — existing successful MCP behavior remains unchanged', async () => {
    let initCount = 0;
    let queryCount = 0;

    const healthyFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        initCount++;
        return Promise.resolve(okInitResponse());
      }

      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      queryCount++;
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: healthyFetch,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });

    // Happy path: single initialize and single query
    const res = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });
    expect(res.results).toBeDefined();
    expect(initCount).toBe(1);
    expect(queryCount).toBe(1);

    // Transient query timeout (session exists): retries once then succeeds
    let flakiness = 1;
    const flakyQueryFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        return Promise.resolve(okInitResponse());
      }

      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      if (flakiness-- > 0) {
        return new Promise<Response>((_, reject) => {
          reject(new DOMException('Timed out', 'AbortError'));
        });
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const flakyClient = new BitgetMcpClient({
      fetch: flakyQueryFetch,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });

    const flakyRes = await flakyClient.executeQuery('equity_price_quote', { symbol: 'NVDA' });
    expect(flakyRes.results).toBeDefined();

    // Non-retryable error does not retry
    let nonRetryCount = 0;
    const nonRetryableFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        return Promise.resolve(okInitResponse());
      }

      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }

      nonRetryCount++;
      throw DissentError.invalidInput('Invalid query argument');
    }) as typeof fetch;

    const badClient = new BitgetMcpClient({
      fetch: nonRetryableFetch,
      timeoutMs: 1000,
      retryDelayMs: 0,
    });

    await expect(
      badClient.executeQuery('equity_price_quote', { symbol: 'NVDA' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(nonRetryCount).toBe(1);
  });

  it('TEST A — successful lifecycle is exactly initialize -> notifications/initialized -> tools/call and offers 2025-03-26', async () => {
    let capturedOfferedVersion: string | undefined;
    const sequence: string[] = [];
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      sequence.push(bodyJson.method);
      if (bodyJson.method === 'initialize') {
        capturedOfferedVersion = bodyJson.params?.protocolVersion;
        return Promise.resolve(okInitResponse());
      }
      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000 });
    const res = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });

    expect(res.results).toBeDefined();
    expect(sequence).toEqual(['initialize', 'notifications/initialized', 'tools/call']);
    expect(capturedOfferedVersion).toBe('2025-03-26');
    expect(capturedOfferedVersion).toBe(DEFAULT_MCP_PROTOCOL_VERSION);
    expect(client.getOfferedProtocolVersion()).toBe('2025-03-26');
    expect(client.isInitialized()).toBe(true);
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-03-26');
  });

  it('TEST B — tools/call cannot occur before initialized notification succeeds', async () => {
    let toolsCallCount = 0;
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') return Promise.resolve(okInitResponse());
      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response('Handshake rejected', { status: 400 }));
      }
      if (bodyJson.method === 'tools/call') {
        toolsCallCount++;
        return Promise.resolve(okQueryResponse());
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000, retryDelayMs: 0 });
    await expect(client.executeQuery('equity_price_quote', { symbol: 'NVDA' })).rejects.toThrow();
    expect(toolsCallCount).toBe(0);
    expect(client.isInitialized()).toBe(false);
  });

  it('TEST C — notification receives session ID header', async () => {
    let capturedNotificationHeaders: Record<string, string> = {};
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') {
        return Promise.resolve(
          new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'session-xyz-789',
            },
          })
        );
      }
      if (bodyJson.method === 'notifications/initialized') {
        capturedNotificationHeaders = (init?.headers as Record<string, string>) ?? {};
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000 });
    await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });

    const sessionHeader =
      capturedNotificationHeaders['MCP-Session-Id'] ||
      capturedNotificationHeaders['mcp-session-id'];
    expect(sessionHeader).toBe('session-xyz-789');
  });

  it('TEST D — notification and tools/call receive negotiated MCP-Protocol-Version header', async () => {
    let notificationProto: string | undefined;
    let toolCallProto: string | undefined;

    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      const headers = (init?.headers as Record<string, string>) ?? {};
      const proto =
        headers['MCP-Protocol-Version'] || headers['mcp-protocol-version'];

      if (bodyJson.method === 'initialize') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2025-03-26',
                capabilities: {},
              },
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': 'session-v2025',
              },
            }
          )
        );
      }
      if (bodyJson.method === 'notifications/initialized') {
        notificationProto = proto;
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (bodyJson.method === 'tools/call') {
        toolCallProto = proto;
        return Promise.resolve(okQueryResponse());
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000 });
    await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });

    expect(notificationProto).toBe('2025-03-26');
    expect(toolCallProto).toBe('2025-03-26');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-03-26');
  });

  it('TEST E — HTTP 202 / empty-body success for initialized notification is accepted', async () => {
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') return Promise.resolve(okInitResponse());
      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response('', { status: 202 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000 });
    const res = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });
    expect(res.results).toBeDefined();
    expect(client.isInitialized()).toBe(true);
  });

  it('TEST F — initialized notification failure resets session and lifecycle state', async () => {
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') return Promise.resolve(okInitResponse());
      if (bodyJson.method === 'notifications/initialized') {
        return Promise.resolve(new Response('Internal server error', { status: 500 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000, retryDelayMs: 0 });
    await expect(client.initialize()).rejects.toThrow();

    expect(client.getSessionId()).toBeNull();
    expect(client.getNegotiatedProtocolVersion()).toBeNull();
    expect(client.isInitialized()).toBe(false);
  });

  it('TEST G — retry after handshake failure performs a fresh complete initialization sequence', async () => {
    const sequence: string[] = [];
    let notificationAttempts = 0;

    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      sequence.push(bodyJson.method);

      if (bodyJson.method === 'initialize') return Promise.resolve(okInitResponse());
      if (bodyJson.method === 'notifications/initialized') {
        notificationAttempts++;
        if (notificationAttempts === 1) {
          return Promise.resolve(new Response('Handshake timeout/error', { status: 500 }));
        }
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000, retryDelayMs: 0 });
    const res = await client.executeQuery('equity_price_quote', { symbol: 'NVDA' });

    expect(res.results).toBeDefined();
    expect(sequence).toEqual([
      'initialize',
      'notifications/initialized',
      'initialize',
      'notifications/initialized',
      'tools/call',
    ]);
  });

  it('TEST H — no session IDs, provider payloads, or secrets leak into diagnostics', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    try {
      const longError =
        'Provider crash details:\n' +
        'SECRET_KEY_123 '.repeat(20) +
        '\nraw payload details';
      const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
        const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
        if (bodyJson.method === 'initialize') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: {
                  code: -32603,
                  message: longError,
                },
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'mcp-session-id': 'ultra-secret-session-token-999',
                },
              }
            )
          );
        }
        return Promise.resolve(okQueryResponse());
      }) as typeof fetch;

      const client = new BitgetMcpClient({
        fetch: mockFetch,
        timeoutMs: 1000,
        retryDelayMs: 0,
      });

      await expect(client.initialize()).rejects.toThrow();

      const diagLogs = logs.filter((l) => l.startsWith('[DISSENT_MCP_DIAG]'));
      expect(diagLogs.length).toBeGreaterThan(0);

      for (const log of diagLogs) {
        expect(log).not.toContain('ultra-secret-session-token-999');
        expect(log).not.toContain('\n');
        expect(log).not.toContain('\r');
      }

      const initLog = diagLogs.find((l) => l.includes('initialize_response'));
      expect(initLog).toBeDefined();
      const match = initLog!.match(/\[DISSENT_MCP_DIAG\] initialize_response: (.*)/);
      expect(match).toBeDefined();
      const jsonText = match?.[1] ?? '{}';
      const parsed = JSON.parse(jsonText);
      expect(parsed.jsonRpcErrorMessage.length).toBeLessThanOrEqual(200);
      expect(parsed.jsonRpcErrorMessage.endsWith('...')).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('TEST I — unsupported server protocol version fails handshake before notifications/initialized and clears session state', async () => {
    let notificationsSent = 0;
    let toolsCalled = 0;
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: '2024-11-05', // Unsupported counter-offer
                capabilities: {},
              },
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': 'unsupported-session-id',
              },
            }
          )
        );
      }
      if (bodyJson.method === 'notifications/initialized') {
        notificationsSent++;
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (bodyJson.method === 'tools/call') {
        toolsCalled++;
        return Promise.resolve(okQueryResponse());
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000, retryDelayMs: 0 });
    const err = await client
      .executeQuery('equity_price_quote', { symbol: 'NVDA' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DissentError);
    expect((err as DissentError).code).toBe('EXTERNAL_PROVIDER_ERROR');
    expect((err as DissentError).message).toContain('Unsupported Bitget MCP protocol version: 2024-11-05');
    // Notification and tools/call must never be issued
    expect(notificationsSent).toBe(0);
    expect(toolsCalled).toBe(0);
    // Session and lifecycle state cleared
    expect(client.isInitialized()).toBe(false);
    expect(client.getSessionId()).toBeNull();
    expect(client.getNegotiatedProtocolVersion()).toBeNull();
  });

  it('TEST J — missing or non-string server protocol version fails handshake before notifications/initialized and clears state', async () => {
    let notificationsSent = 0;
    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                // protocolVersion omitted
                capabilities: {},
              },
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': 'missing-proto-session',
              },
            }
          )
        );
      }
      if (bodyJson.method === 'notifications/initialized') {
        notificationsSent++;
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({ fetch: mockFetch, timeoutMs: 1000, retryDelayMs: 0 });
    await expect(client.initialize()).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
      message: expect.stringContaining('Unsupported Bitget MCP protocol version: missing'),
    });

    expect(notificationsSent).toBe(0);
    expect(client.isInitialized()).toBe(false);
    expect(client.getSessionId()).toBeNull();
    expect(client.getNegotiatedProtocolVersion()).toBeNull();
  });

  it('TEST K — sustained unsupported protocol version exhausts retries and sets cooldown', async () => {
    let initAttempts = 0;
    let notificationsSent = 0;
    const currentTime = 500_000;

    const mockFetch = ((_: URL | RequestInfo, init?: RequestInit) => {
      const bodyJson = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (bodyJson.method === 'initialize') {
        initAttempts++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: 'unsupported-future-version',
                capabilities: {},
              },
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'mcp-session-id': 'future-session',
              },
            }
          )
        );
      }
      if (bodyJson.method === 'notifications/initialized') {
        notificationsSent++;
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(okQueryResponse());
    }) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: mockFetch,
      timeoutMs: 1000,
      retryDelayMs: 0,
      now: () => currentTime,
    });

    const firstErr = await client
      .executeQuery('equity_price_quote', { symbol: 'NVDA' })
      .catch((e: unknown) => e);

    expect(firstErr).toBeInstanceOf(DissentError);
    expect((firstErr as DissentError).code).toBe('EXTERNAL_PROVIDER_ERROR');
    // Both bounded attempts ran
    expect(initAttempts).toBe(2);
    expect(notificationsSent).toBe(0);
    expect(client.isInitialized()).toBe(false);

    // Cooldown is now active: immediately following query fast-fails without any fetch
    let fetchDuringCooldown = 0;
    const cooldownFetch = (() => {
      fetchDuringCooldown++;
      return Promise.resolve(new Response(null, { status: 500 }));
    }) as typeof fetch;
    (client as any).fetchImpl = cooldownFetch;

    const secondErr = await client
      .executeQuery('equity_fundamental_ratios', { symbol: 'NVDA' })
      .catch((e: unknown) => e);

    expect(secondErr).toBeInstanceOf(DissentError);
    expect((secondErr as DissentError).code).toBe('EXTERNAL_PROVIDER_ERROR');
    expect((secondErr as DissentError).message).toContain('failed recently, skipping redundant retry');
    expect(fetchDuringCooldown).toBe(0);
  });
});
