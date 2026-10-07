import { describe, expect, it } from 'vitest';
import { runBitgetToolProbe } from '@/server/diag/bitget-tool-probe';
import { GET } from '@/app/api/diag/bitget-tools/route';
import {
  SANITY_MCP_INIT_RESPONSE,
  SANITY_MCP_QUOTE_RESPONSE,
} from '../../fixtures/bitget-mcp-nvda.fixtures';

function okInitResponse() {
  return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': 'diag-test-session-123',
    },
  });
}

function okNotificationResponse() {
  return new Response('', {
    status: 202,
    headers: {
      'mcp-session-id': 'diag-test-session-123',
    },
  });
}

describe('BitgetToolProbe diagnostic runner', () => {
  it('detects DIRECT_TOOLS and invokes direct tools/call with safe reporting', async () => {
    const directToolsListResponse = {
      jsonrpc: '2.0',
      id: 200,
      result: {
        tools: [
          {
            name: 'equity_price_quote',
            description: 'Get real-time equity price quote',
            inputSchema: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Stock ticker' },
              },
              required: ['symbol'],
            },
          },
          {
            name: 'equity_fundamental_ratios',
            description: 'Get fundamental equity ratios',
            inputSchema: {
              type: 'object',
              properties: {
                symbol: { type: 'string', description: 'Stock ticker' },
              },
              required: ['symbol'],
            },
          },
        ],
      },
    };

    const mockFetch = (async (_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        return okInitResponse();
      }
      if (bodyJson.method === 'notifications/initialized') {
        return okNotificationResponse();
      }
      if (bodyJson.method === 'tools/list') {
        return new Response(JSON.stringify(directToolsListResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': 'diag-test-session-123',
          },
        });
      }
      if (bodyJson.method === 'tools/call') {
        // Return valid tool result
        return new Response(JSON.stringify(SANITY_MCP_QUOTE_RESPONSE), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': 'diag-test-session-123',
          },
        });
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const report = await runBitgetToolProbe(mockFetch);

    expect(report.lifecycle.initialized).toBe(true);
    expect(report.lifecycle.negotiatedProtocolVersion).toBe('2025-03-26');
    expect(report.lifecycle.hasSessionId).toBe(true);
    // Crucial check: session ID string must NOT be logged in report
    expect(JSON.stringify(report)).not.toContain('diag-test-session-123');

    expect(report.toolDiscovery.totalToolsCount).toBe(2);
    expect(report.toolDiscovery.targetToolPresence.equity_price_quote).toBe(true);
    expect(report.toolDiscovery.targetToolPresence.equity_fundamental_ratios).toBe(true);
    expect(report.toolDiscovery.targetToolPresence.do_query).toBe(false);

    expect(report.callContractAnalysis.detectedCategory).toBe('DIRECT_TOOLS');
    expect(report.testCalls.length).toBe(2);

    const quoteCall = report.testCalls.find((c) => c.toolName === 'equity_price_quote');
    expect(quoteCall).toBeDefined();
    expect(quoteCall?.argumentsShape).toEqual({ symbol: 'string(val=NVDA)' });
    expect(quoteCall?.httpStatus).toBe(200);
    expect(quoteCall?.hasJsonRpcError).toBe(false);
    expect(quoteCall?.hasStructuredContent).toBe(true);
    expect(quoteCall?.resultsNonEmpty).toBe(true);
    expect(quoteCall?.topLevelFieldNames).toContain('structuredContent');
    // Ensure raw prices/values are NOT present in the test call report
    expect(JSON.stringify(quoteCall)).not.toContain('120.5');
  });

  it('detects DO_QUERY dispatcher and performs field comparison', async () => {
    const doQueryListResponse = {
      jsonrpc: '2.0',
      id: 200,
      result: {
        tools: [
          {
            name: 'do_query',
            description: 'Legacy Bitget query dispatcher',
            inputSchema: {
              type: 'object',
              properties: {
                entry_id: { type: 'string' },
                params: { type: 'object' },
                optional_flag: { type: 'boolean' },
              },
              required: ['entry_id', 'params'],
            },
          },
        ],
      },
    };

    const mockFetch = (async (_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') return okInitResponse();
      if (bodyJson.method === 'notifications/initialized') return okNotificationResponse();
      if (bodyJson.method === 'tools/list') {
        return new Response(JSON.stringify(doQueryListResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (bodyJson.method === 'tools/call') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: bodyJson.id,
            result: {
              status_code: 503,
              success: false,
              msg: 'tool unavailable',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const report = await runBitgetToolProbe(mockFetch);

    expect(report.callContractAnalysis.detectedCategory).toBe('DO_QUERY');
    const comparison = report.callContractAnalysis.doQueryComparison;
    expect(comparison).toBeDefined();
    expect(comparison?.isExposed).toBe(true);
    expect(comparison?.missingFromSchema).toEqual([]);
    expect(comparison?.extraInSchema).toEqual(['optional_flag']);
    expect(comparison?.serverProperties).toContain('entry_id');
    expect(comparison?.serverProperties).toContain('params');

    expect(report.testCalls.length).toBe(1);
    const testCall = report.testCalls[0];
    expect(testCall?.toolName).toBe('do_query');
    expect(testCall?.toolStatusCode).toBe(503);
    expect(testCall?.toolSuccess).toBe(false);
  });

  it('paginates tools/list when nextCursor is returned', async () => {
    let listCallCount = 0;
    const mockFetch = (async (_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') return okInitResponse();
      if (bodyJson.method === 'notifications/initialized') return okNotificationResponse();
      if (bodyJson.method === 'tools/list') {
        listCallCount++;
        if (listCallCount === 1) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: bodyJson.id,
              result: {
                tools: [{ name: 'tool_page_1', inputSchema: {} }],
                nextCursor: 'cursor_page_2',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: bodyJson.id,
            result: {
              tools: [{ name: 'tool_page_2', inputSchema: {} }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const report = await runBitgetToolProbe(mockFetch);
    expect(listCallCount).toBe(2);
    expect(report.toolDiscovery.pagesFetched).toBe(2);
    expect(report.toolDiscovery.totalToolsCount).toBe(2);
    expect(report.toolDiscovery.tools.map((t) => t.name)).toEqual([
      'tool_page_1',
      'tool_page_2',
    ]);
  });
});

describe('GET /api/diag/bitget-tools route handler', () => {
  it('blocks execution with HTTP 403 when VERCEL_ENV is production', async () => {
    const originalEnv = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      const response = await GET();
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('disabled in production');
    } finally {
      process.env.VERCEL_ENV = originalEnv;
    }
  });
});
