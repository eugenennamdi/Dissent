import { describe, expect, it, vi } from 'vitest';
import { DissentError } from '@/core/errors/domain-errors';
import {
  BitgetMcpClient,
  INIT_FAILURE_COOLDOWN_MS,
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
});
