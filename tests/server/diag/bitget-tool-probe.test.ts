import { describe, expect, it } from 'vitest';
import { runBitgetToolProbe } from '@/server/diag/bitget-tool-probe';
import { GET } from '@/app/api/diag/bitget-tools/route';
import { SANITY_MCP_INIT_RESPONSE } from '../../fixtures/bitget-mcp-nvda.fixtures';

function okInitResponse() {
  return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'mcp-session-id': 'diag-test-session-456',
    },
  });
}

function okNotificationResponse() {
  return new Response('', {
    status: 202,
    headers: {
      'mcp-session-id': 'diag-test-session-456',
    },
  });
}

describe('Extended BitgetToolProbe diagnostic runner', () => {
  it('runs all 5 phases: guide discovery, parameter comparison, control query, and retest', async () => {
    const mockToolsList = {
      jsonrpc: '2.0',
      id: 100,
      result: {
        tools: [
          {
            name: 'guide',
            description: 'List available data categories or entries',
            inputSchema: { type: 'object' },
          },
          {
            name: 'do_query',
            description: 'Execute catalog entry by id',
            inputSchema: {
              type: 'object',
              properties: {
                entry_id: { type: 'string' },
                params: { type: 'object' },
              },
              required: ['entry_id'],
            },
          },
        ],
      },
    };

    const mockCategories = [
      { key: 'crypto', name: '加密货币', entry_count: 39 },
      { key: 'equity', name: '美股', entry_count: 22 },
    ];

    const mockEquityEntries = [
      {
        id: 'equity_price_quote',
        subcategory: '行情',
        title: '股票基本信息 / 实时报价',
        summary: '获取美股的实时报价与基本信息',
        data_tier: 'free',
        params_summary: [{ name: 'symbol', required: true, type: 'string' }],
      },
      {
        id: 'equity_fundamental_ratios',
        subcategory: '基本面（含财报）',
        title: '估值指标',
        summary: '获取公司估值比率指标',
        data_tier: 'free',
        params_summary: [
          { name: 'symbol', required: true, type: 'string' },
          { name: 'limit', required: false, type: 'integer' },
        ],
      },
      {
        id: 'equity_profile',
        subcategory: '基本面（含财报）',
        title: '公司基本信息',
        summary: '获取公司基本信息',
        data_tier: 'free',
        params_summary: [{ name: 'symbol', required: true, type: 'string' }],
      },
    ];

    const mockFetch = (async (_: URL | RequestInfo, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') return okInitResponse();
      if (bodyJson.method === 'notifications/initialized') return okNotificationResponse();
      if (bodyJson.method === 'tools/list') {
        return new Response(JSON.stringify(mockToolsList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (bodyJson.method === 'tools/call') {
        const toolName = bodyJson.params?.name;
        const args = bodyJson.params?.arguments || {};

        if (toolName === 'guide') {
          if (!args.category && !args.keyword) {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: bodyJson.id,
                result: {
                  structuredContent: { categories: mockCategories },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (args.keyword) {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: bodyJson.id,
                result: {
                  structuredContent: { entries: [] },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (args.category === 'equity') {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: bodyJson.id,
                result: {
                  structuredContent: { entries: mockEquityEntries },
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }

        if (toolName === 'do_query') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: bodyJson.id,
              result: {
                structuredContent: {
                  status_code: 503,
                  success: false,
                  data: '<html><head><title>503 Service Temporarily Unavailable</title></head><body><h1>503</h1></body></html>',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const report = await runBitgetToolProbe(mockFetch);

    // Lifecycle
    expect(report.lifecycle.initialized).toBe(true);
    expect(report.lifecycle.negotiatedProtocolVersion).toBe('2025-03-26');
    expect(report.lifecycle.hasSessionId).toBe(true);
    expect(JSON.stringify(report)).not.toContain('diag-test-session-456');

    // Phase 1: Guide Discovery
    expect(report.phase1GuideDiscovery.topLevelCategories.length).toBe(2);
    expect(report.phase1GuideDiscovery.totalEquityEntriesCount).toBe(3);
    expect(report.phase1GuideDiscovery.equitySubcategoriesFound).toContain('行情');
    expect(report.phase1GuideDiscovery.equitySubcategoriesFound).toContain('基本面（含财报）');

    // Phase 2: Catalog Entries
    expect(report.phase2CatalogEntries.equityPriceQuoteExists).toBe(true);
    expect(report.phase2CatalogEntries.equityFundamentalRatiosExists).toBe(true);
    expect(report.phase2CatalogEntries.requiredParamsChanged).toBe(false);
    expect(report.phase2CatalogEntries.targetEntries.length).toBe(2);

    // Phase 3: Parameter Comparison
    const quoteComparison = report.phase3ParameterComparison.equityPriceQuote;
    expect(quoteComparison.isCompatible).toBe(true);
    expect(quoteComparison.missing).toEqual([]);
    expect(quoteComparison.extra).toEqual([]);

    const ratiosComparison = report.phase3ParameterComparison.equityFundamentalRatios;
    expect(ratiosComparison.isCompatible).toBe(true);
    expect(ratiosComparison.missing).toEqual([]);
    expect(ratiosComparison.extra).toEqual([]);

    // Phase 4: Control Query
    expect(report.phase4ControlQuery.entryId).toBe('equity_profile');
    expect(report.phase4ControlQuery.toolStatusCode).toBe(503);
    expect(report.phase4ControlQuery.toolSuccess).toBe(false);
    expect(report.phase4ControlQuery.isHtmlError).toBe(true);

    // Phase 5: Retests
    expect(report.phase5Retest.equityPriceQuote.toolStatusCode).toBe(503);
    expect(report.phase5Retest.equityPriceQuote.isHtmlError).toBe(true);
    expect(report.phase5Retest.equityFundamentalRatios.toolStatusCode).toBe(503);
    expect(report.phase5Retest.equityFundamentalRatios.isHtmlError).toBe(true);

    // Conclusion
    expect(report.conclusion.classification).toBe('BACKEND_SERVICE_OUTAGE');
    expect(report.conclusion.clientContractStatus).toContain('VERIFIED_CORRECT');
    expect(report.conclusion.entryCatalogStatus).toContain('ENTRIES_EXIST');
    expect(report.conclusion.backendServiceStatus).toContain('SERVICE_UNAVAILABLE (503)');
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
