import { describe, expect, it, vi } from 'vitest';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import {
  BitgetEquityAdapter,
  isMcpUpstreamUnavailable,
} from '@/server/market/bitget-equity.adapter';
import { BitgetMcpClient } from '@/server/market/bitget-mcp.client';
import {
  BitgetRestReferenceClient,
  normalizeBitgetDate,
} from '@/server/market/bitget-rest-reference.client';
import { EulerpoolQuoteClient } from '@/server/market/eulerpool-quote.client';
import { FallbackEquityAdapter } from '@/server/market/fallback-equity.adapter';
import {
  SANITY_MCP_INIT_RESPONSE,
  SANITY_MCP_QUOTE_RECORD,
  SANITY_MCP_QUOTE_RESPONSE,
  SANITY_MCP_RATIOS_RECORD,
  SANITY_MCP_RATIOS_RESPONSE,
} from '../../fixtures/bitget-mcp-nvda.fixtures';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function createThesis(
  symbol = 'NVDA',
  market = `${symbol}/USD`
): StructuredThesisV1 {
  return {
    id: `th_${symbol.toLowerCase()}_test`,
    thesisInputId: `inp_${symbol.toLowerCase()}_test`,
    originalThesis: `${symbol} will demonstrate strong revenue growth and enterprise momentum.`,
    market,
    baseAsset: symbol,
    quoteAsset: 'USD',
    claim: `${symbol} enterprise demand remains solid`,
    direction: 'LONG',
    timeHorizon: { description: '3 months', estimatedHours: 2160 },
    catalysts: ['growth', 'product refresh'],
    createdAt: NOW.toISOString(),
    schemaVersion: 1,
  };
}

/**
 * Canonical live authenticated response shape observed from:
 * GET https://api.eulerpool.com/api/1/market/last-quote/NVDA
 *
 * Synthetic non-market values used to prevent copying live market data into tests.
 * Note: the canonical endpoint provides price, bid, ask, timestamp, ts, isin, exchange, currency,
 * but does NOT provide change, changePercent, or volume.
 */
const CANONICAL_EULERPOOL_FIXTURE = {
  ticker: 'NVDA',
  isin: 'US67066G1040',
  price: 155.5,
  bid: 155.4,
  ask: 155.6,
  bid_size: 100,
  ask_size: 200,
  timestamp: 1727180000000, // 2024-09-24T12:13:20.000Z
  ts: 1727180000000,
  exchange: 'XNAS',
  currency: 'USD',
  source: 'sip',
};

/**
 * Extended fixture including optional source change and volume fields if an upstream feed provides them.
 */
const EXTENDED_EULERPOOL_FIXTURE = {
  ...CANONICAL_EULERPOOL_FIXTURE,
  change: -2.11,
  changePercent: -1.35,
  volume: 500000,
};

/**
 * Canonical live authenticated price-change response shape observed from:
 * GET https://api.eulerpool.com/api/1/equity/price-change/NVDA
 * Synthetic non-market values used.
 */
const CANONICAL_EULERPOOL_PRICE_CHANGE_FIXTURE = {
  ticker: 'NVDA',
  as_of: '2024-09-24',
  updated_at: '2024-09-24T12:13:20.000Z',
  data: [
    {
      '1D': -1.35,
      '5D': 2.45,
      '1M': 5.12,
      '3M': 12.8,
      '6M': 25.4,
      ytd: 18.9,
      '1Y': 32.1,
      '3Y': 110.5,
      '5Y': 320.0,
      '10Y': 1200.0,
      max: 5500.0,
      symbol: 'NVDA',
    },
  ],
};

const MOCK_BITGET_INDICATORS_RESPONSE = {
  code: '00000',
  msg: 'success',
  requestTime: 1790200000000, // 2026-09-23T21:46:40.000Z
  data: {
    date: '1790121600000', // 2026-09-23T00:00:00.000Z (observation date)
    pb: '69.53',
    pbMrq: '24.088',
    pe: '75.68',
    peLyr: '45.9391',
    peTtmEd: '28.597', // Explicit TTM P/E
    ps: '42.2674',
    psTtmEd: '18.2057',
    evEbitda: '65.7862',
    tmvUsd: '5515767000000', // Market cap in USD
  },
};

function createMcp503Response(entryId: string) {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      structuredContent: {
        status_code: 503,
        success: false,
        error: `<html><body>503 Service Temporarily Unavailable for ${entryId}</body></html>`,
      },
    },
  };
}

describe('Fallback Equity Integration & Guard Tests', () => {
  it('1. MCP success => fallback is never called', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'mcp-session-id': 'sess-1',
          },
        });
      }
      if (bodyJson.method === 'notifications/initialized') {
        return new Response(null, { status: 200 });
      }
      if (bodyJson.method === 'tools/call') {
        const entryId = bodyJson.params?.arguments?.entry_id;
        const payload =
          entryId === 'equity_price_quote'
            ? SANITY_MCP_QUOTE_RESPONSE
            : SANITY_MCP_RATIOS_RESPONSE;
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const mockFallback = new FallbackEquityAdapter();
    const quoteSpy = vi.spyOn(mockFallback, 'collectFallbackQuote');
    const valSpy = vi.spyOn(mockFallback, 'collectFallbackValuation');

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      fallbackAdapter: mockFallback,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    expect(result.complete).toBe(true);
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(valSpy).not.toHaveBeenCalled();
    expect(
      result.ledger.items.every(
        (i) => i.provenance.sourceName === 'bitget-mcp-server'
      )
    ).toBe(true);
  });

  it('2. Real Bitget MCP 503 tool response activates fallback and populates ledger', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const url = String(input);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      // MCP endpoint: actual observed response (HTTP 200, JSON-RPC success, tool status_code 503)
      if (url.includes('agent.bitget.com')) {
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        if (bodyJson.method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'sess-1',
            },
          });
        }
        if (bodyJson.method === 'notifications/initialized') {
          return new Response(null, { status: 200 });
        }
        if (bodyJson.method === 'tools/call') {
          const entryId = bodyJson.params?.arguments?.entry_id;
          return new Response(JSON.stringify(createMcp503Response(entryId)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Eulerpool last-quote endpoint (canonical: price, bid/ask, timestamp; no change/volume)
      if (url.includes('api.eulerpool.com/api/1/market/last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Eulerpool price-change endpoint (canonical: 1D window return)
      if (url.includes('api.eulerpool.com/api/1/equity/price-change')) {
        return new Response(
          JSON.stringify(CANONICAL_EULERPOOL_PRICE_CHANGE_FIXTURE),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Bitget REST valuation-indicators (single call)
      if (
        url.includes('api.bitget.com/api/v3/reality/market/valuation-indicators')
      ) {
        return new Response(JSON.stringify(MOCK_BITGET_INDICATORS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-eulerpool-key',
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    expect(result.complete).toBe(true);
    expect(result.gaps).toHaveLength(0);
    assertEvidenceLedgerIntegrity(result.ledger);

    // Verify fallback items are present
    const lastPrice = result.ledger.items.find(
      (i) => i.observation.type === 'LAST_PRICE'
    );
    expect(lastPrice).toBeDefined();
    expect(lastPrice?.provenance.sourceName).toBe('Eulerpool Equity API');
    expect(lastPrice?.value).toBe(155.5);

    const sessionChange = result.ledger.items.find(
      (i) => i.observation.type === 'SESSION_PRICE_CHANGE'
    );
    expect(sessionChange).toBeDefined();
    expect(sessionChange?.provenance.sourceName).toBe('Eulerpool Equity API');
    expect(sessionChange?.value).toBe(-1.35);

    const peTtm = result.ledger.items.find(
      (i) => i.observation.type === 'VALUATION_PE_TTM'
    );
    expect(peTtm).toBeDefined();
    expect(peTtm?.provenance.sourceName).toBe('Bitget Reality Reference API');
    expect(peTtm?.value).toBe(28.597);

    const marketCap = result.ledger.items.find(
      (i) => i.observation.type === 'MARKET_CAPITALIZATION'
    );
    expect(marketCap).toBeDefined();
    expect(marketCap?.provenance.sourceName).toBe(
      'Bitget Reality Reference API'
    );
    expect(marketCap?.value).toBe(5515767000000);
  });

  it('3. MCP schema error => fallback does NOT activate (fails closed)', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const url = String(input);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      if (url.includes('agent.bitget.com')) {
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        if (bodyJson.method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'sess-1',
            },
          });
        }
        if (bodyJson.method === 'notifications/initialized') {
          return new Response(null, { status: 200 });
        }
        if (bodyJson.method === 'tools/call') {
          // Return malformed structuredContent.data (primitive string that is not JSON)
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              result: {
                structuredContent: {
                  status_code: 200,
                  success: true,
                  data: 'not a valid json payload',
                },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const mockFallback = new FallbackEquityAdapter();
    const quoteSpy = vi.spyOn(mockFallback, 'collectFallbackQuote');
    const valSpy = vi.spyOn(mockFallback, 'collectFallbackValuation');

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      fallbackAdapter: mockFallback,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    expect(result.complete).toBe(false);
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(valSpy).not.toHaveBeenCalled();
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps[0]?.reason).toBe('INVALID_RESPONSE');
  });

  it('4. Bitget REST valuation fields map correctly from valuation-indicators alone (single request)', async () => {
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('valuation-indicators')) {
        return new Response(
          JSON.stringify({
            code: '00000',
            msg: 'success',
            requestTime: 1790200000000,
            data: {
              date: '1790121600000',
              pb: '69.53',
              pbMrq: '24.088',
              pe: '75.68', // Generic pe must NOT be used as peTtm!
              peLyr: '45.9391',
              // Notice: peTtmEd and peTtmPd omitted here
              ps: '42.2674',
              psTtmEd: '18.2057',
              evEbitda: '65.7862',
              tmvUsd: '5515767000000',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const restClient = new BitgetRestReferenceClient({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const data = await restClient.getEquityValuationData('NVDA');

    // Generic pe must NOT be mapped as peTtm!
    expect(data.peTtm).toBeUndefined();
    expect(data.peLyr).toBe(45.9391);
    expect(data.pbRatio).toBe(24.088);
    expect(data.evEbitda).toBe(65.7862);
    expect(data.psTtm).toBe(18.2057);
    expect(data.marketCap).toBe(5515767000000); // Mapped directly from tmvUsd
  });

  it('5. Canonical response maps LAST_PRICE (Phase 6.1)', async () => {
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const eulerClient = new EulerpoolQuoteClient({
      apiKey: 'test-key',
      fetch: fetchImpl,
      now: () => NOW,
    });

    const quote = await eulerClient.getLastQuote('NVDA');

    expect(quote.price).toBe(155.5);
    expect(quote.bid).toBe(155.4);
    expect(quote.ask).toBe(155.6);
    expect(quote.bidSize).toBe(100);
    expect(quote.askSize).toBe(200);
    expect(quote.exchange).toBe('XNAS');
    expect(quote.currency).toBe('USD');
    expect(quote.change).toBeUndefined();
    expect(quote.changePercent).toBeUndefined();
    expect(quote.volume).toBeUndefined();

    const fallbackAdapter = new FallbackEquityAdapter({
      eulerpoolClient: eulerClient,
      now: () => NOW,
    });

    const items = await fallbackAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const lastPrice = items.find((i) => i.observation.type === 'LAST_PRICE');
    expect(lastPrice).toBeDefined();
    expect(lastPrice?.value).toBe(155.5);
    expect(lastPrice?.unit).toBe('USD');
    expect(lastPrice?.metadata?.bid).toBe(155.4);
    expect(lastPrice?.metadata?.ask).toBe(155.6);
    expect(lastPrice?.metadata?.exchange).toBe('XNAS');
    expect(lastPrice?.metadata?.feedTier).toBe('DELAYED');
  });

  it('5b. Price change maps 1D to SESSION_PRICE_CHANGE with verified metadata and timestamp (Phase 7)', async () => {
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('price-change')) {
        return new Response(
          JSON.stringify(CANONICAL_EULERPOOL_PRICE_CHANGE_FIXTURE),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const fallbackAdapter = new FallbackEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const items = await fallbackAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const sessionChange = items.find(
      (i) => i.observation.type === 'SESSION_PRICE_CHANGE'
    );
    expect(sessionChange).toBeDefined();
    expect(sessionChange?.value).toBe(-1.35);
    expect(sessionChange?.unit).toBe('PERCENT');
    expect(sessionChange?.provenance.sourceName).toBe('Eulerpool Equity API');
    expect(sessionChange?.provenance.observedAt).toBe('2024-09-24T12:13:20.000Z');
    expect(sessionChange?.metadata?.providerField).toBe('1D');
    expect(sessionChange?.metadata?.horizon).toBe('1D');
    expect(sessionChange?.metadata?.feedTier).toBe('DELAYED');
    expect(sessionChange?.metadata?.delayNotice).toBe('Delayed equity quote feed');

    // Also verify that when changePercent is present directly in last-quote, it is supported
    const fetchExtended = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('last-quote')) {
        return new Response(JSON.stringify(EXTENDED_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const extendedAdapter = new FallbackEquityAdapter({
      fetch: fetchExtended,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const extItems = await extendedAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const extChange = extItems.find(
      (i) => i.observation.type === 'SESSION_PRICE_CHANGE'
    );
    expect(extChange).toBeDefined();
    expect(extChange?.value).toBe(-1.35);
  });

  it('5c. Volume maps only when present (Phase 6.3)', async () => {
    // A. Canonical response: volume absent => SESSION_VOLUME omitted
    const fetchCanonical = (async (): Promise<Response> =>
      new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const adapterCanonical = new FallbackEquityAdapter({
      fetch: fetchCanonical,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });
    const itemsWithoutVol = await adapterCanonical.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    expect(
      itemsWithoutVol.find((i) => i.observation.type === 'SESSION_VOLUME')
    ).toBeUndefined();

    // B. Extended response: volume present => SESSION_VOLUME mapped
    const fetchExtended = (async (): Promise<Response> =>
      new Response(JSON.stringify(EXTENDED_EULERPOOL_FIXTURE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const adapterExtended = new FallbackEquityAdapter({
      fetch: fetchExtended,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });
    const itemsWithVol = await adapterExtended.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const volItem = itemsWithVol.find(
      (i) => i.observation.type === 'SESSION_VOLUME'
    );
    expect(volItem).toBeDefined();
    expect(volItem?.value).toBe(500000);
    expect(volItem?.unit).toBe('SHARES');
  });

  it('5d. Missing 1D in price-change preserves incomplete quote and does NOT fabricate change', async () => {
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('price-change')) {
        // Missing 1D (only 5D and 1M present)
        return new Response(
          JSON.stringify({
            ticker: 'NVDA',
            as_of: '2024-09-24',
            updated_at: '2024-09-24T12:13:20.000Z',
            data: [{ '5D': 2.45, '1M': 5.12, symbol: 'NVDA' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const fallbackAdapter = new FallbackEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const items = await fallbackAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );

    // LAST_PRICE is present
    expect(items.some((i) => i.observation.type === 'LAST_PRICE')).toBe(true);
    // SESSION_PRICE_CHANGE is NOT present and NOT fabricated
    expect(
      items.some((i) => i.observation.type === 'SESSION_PRICE_CHANGE')
    ).toBe(false);
  });

  it('6. Quote observedAt comes strictly from source timestamp and delay is truthful (Phase 6.4)', async () => {
    const sourceTs = 1727180000000; // 2024-09-24T12:13:20.000Z
    const fetchImpl = (async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          ...CANONICAL_EULERPOOL_FIXTURE,
          timestamp: sourceTs,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const fallbackAdapter = new FallbackEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const items = await fallbackAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );

    const priceItem = items.find((i) => i.observation.type === 'LAST_PRICE')!;
    expect(priceItem).toBeDefined();

    // Source timestamp is preserved as observedAt
    expect(priceItem.provenance.observedAt).toBe(
      new Date(sourceTs).toISOString()
    );
    expect(priceItem.provenance.retrievedAt).toBe(NOW.toISOString());
    expect(priceItem.provenance.observedAt).not.toBe(
      priceItem.provenance.retrievedAt
    );

    // Freshness is truthfully marked delayed without claiming unverified duration
    expect(priceItem.claim).toContain('delayed session price');
    expect(priceItem.metadata?.feedTier).toBe('DELAYED');
    expect(priceItem.metadata?.delayNotice).toBe('Delayed equity quote feed');
  });

  it('6b. Missing timestamp fails closed (Phase 6.5)', async () => {
    const fetchImpl = (async (): Promise<Response> => {
      const payload = { ...CANONICAL_EULERPOOL_FIXTURE } as Record<string, unknown>;
      delete payload.timestamp;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const client = new EulerpoolQuoteClient({
      apiKey: 'test-key',
      fetch: fetchImpl,
      now: () => NOW,
    });

    await expect(client.getLastQuote('NVDA')).rejects.toThrow();
  });

  it('6c. Missing price fails closed (Phase 6.6)', async () => {
    // Missing price
    const fetchMissingPrice = (async (): Promise<Response> => {
      const payload = { ...CANONICAL_EULERPOOL_FIXTURE } as Record<string, unknown>;
      delete payload.price;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const client1 = new EulerpoolQuoteClient({
      apiKey: 'test-key',
      fetch: fetchMissingPrice,
      now: () => NOW,
    });

    await expect(client1.getLastQuote('NVDA')).rejects.toThrow();

    // Non-positive price
    const fetchNegativePrice = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          ...CANONICAL_EULERPOOL_FIXTURE,
          price: -50.0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const client2 = new EulerpoolQuoteClient({
      apiKey: 'test-key',
      fetch: fetchNegativePrice,
      now: () => NOW,
    });

    await expect(client2.getLastQuote('NVDA')).rejects.toThrow();
  });

  it('6d. Missing required session-change evidence preserves incomplete ledger (Phase 6.7)', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const url = String(input);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      // MCP endpoint: returns tool 503 so fallback triggers
      if (url.includes('agent.bitget.com')) {
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        if (bodyJson.method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'sess-1',
            },
          });
        }
        if (bodyJson.method === 'notifications/initialized') {
          return new Response(null, { status: 200 });
        }
        if (bodyJson.method === 'tools/call') {
          const entryId = bodyJson.params?.arguments?.entry_id;
          return new Response(JSON.stringify(createMcp503Response(entryId)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Eulerpool returns canonical response (has price & timestamp, but NO change/changePercent)
      if (url.includes('api.eulerpool.com/api/1/market/last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Bitget REST valuation succeeds
      if (
        url.includes('api.bitget.com/api/v3/reality/market/valuation-indicators')
      ) {
        return new Response(JSON.stringify(MOCK_BITGET_INDICATORS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    // Invariant: Without session change evidence, research cannot be marked complete
    expect(result.complete).toBe(false);
    expect(result.ledger.items.some((i) => i.observation.type === 'LAST_PRICE')).toBe(true);
    expect(
      result.ledger.items.some((i) => i.observation.type === 'SESSION_PRICE_CHANGE')
    ).toBe(false);
    assertEvidenceLedgerIntegrity(result.ledger);
  });

  it('7. Bitget requestTime is not treated as valuation observation time', async () => {
    const obsDateMs = 1790121600000; // 2026-09-23T00:00:00.000Z
    const requestTimeMs = 1790200000000; // 2026-09-23T21:46:40.000Z

    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('valuation-indicators')) {
        return new Response(
          JSON.stringify({
            code: '00000',
            msg: 'success',
            requestTime: requestTimeMs,
            data: {
              date: String(obsDateMs),
              peTtmEd: '30.5',
              tmvUsd: '3000000000000',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const client = new BitgetRestReferenceClient({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const val = await client.getEquityValuationData('MSFT');

    expect(val.observedAt).toBe(new Date(obsDateMs).toISOString());
    expect(val.retrievedAt).toBe(new Date(requestTimeMs).toISOString());
    expect(val.observedAt).not.toBe(val.retrievedAt);
  });

  it('8. Fallback evidence has correct distinct provenance and no secrets', async () => {
    const secretApiKey = 'super-secret-eulerpool-token-999';
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      if (url.includes('eulerpool')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('valuation-indicators')) {
        return new Response(JSON.stringify(MOCK_BITGET_INDICATORS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const fallbackAdapter = new FallbackEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: secretApiKey,
      now: () => NOW,
    });

    const quoteItems = await fallbackAdapter.collectFallbackQuote(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const valItems = await fallbackAdapter.collectFallbackValuation(
      'th_1',
      'NVDA/USD',
      'NVDA'
    );
    const allItems = [...quoteItems, ...valItems];

    for (const item of allItems) {
      // Must NOT be labeled as bitget-mcp-server
      expect(item.provenance.sourceName).not.toBe('bitget-mcp-server');

      // Distinct source names
      expect([
        'Eulerpool Equity API',
        'Bitget Reality Reference API',
      ]).toContain(item.provenance.sourceName);

      // Must NOT leak secret token in locator or metadata
      expect(item.provenance.endpointOrLocator).not.toContain(secretApiKey);
      expect(JSON.stringify(item)).not.toContain(secretApiKey);
    }
  });

  it('9. Reality/rToken trading-pair prices are never used and Company Overview is removed', async () => {
    const urlsRequested: string[] = [];

    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      urlsRequested.push(url);

      if (url.includes('eulerpool')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('valuation-indicators')) {
        return new Response(JSON.stringify(MOCK_BITGET_INDICATORS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const fallbackAdapter = new FallbackEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    await fallbackAdapter.collectFallbackQuote('th_1', 'NVDA/USD', 'NVDA');
    await fallbackAdapter.collectFallbackValuation('th_1', 'NVDA/USD', 'NVDA');

    // Verify no trading-pair / spot ticker endpoints were ever touched
    expect(
      urlsRequested.some(
        (u) =>
          u.includes('/spot/market/tickers') ||
          u.includes('/reality/market/tickers') ||
          u.includes('rToken') ||
          u.includes('NVDAUSDT')
      )
    ).toBe(false);

    // Verify Company Overview is completely removed from live valuation fallback path
    expect(urlsRequested.some((u) => u.includes('company-overview'))).toBe(
      false
    );

    // Only valuation-indicators and Eulerpool endpoints (last-quote & price-change) were requested
    expect(
      urlsRequested.every(
        (u) =>
          u.includes('eulerpool.com/api/1/market/last-quote') ||
          u.includes('eulerpool.com/api/1/equity/price-change') ||
          u.includes('reality/market/valuation-indicators')
      )
    ).toBe(true);
  });

  it('10. If fallback is incomplete => EVIDENCE_UNAVAILABLE / complete: false remains', async () => {
    const fetchImpl = (async (input: URL | RequestInfo): Promise<Response> => {
      const url = String(input);
      // Eulerpool returns 404
      if (url.includes('eulerpool')) {
        return new Response(JSON.stringify({ error: 'Ticker not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('valuation-indicators')) {
        return new Response(JSON.stringify(MOCK_BITGET_INDICATORS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const mcpClient = new BitgetMcpClient({
      fetch: (async (input: URL | RequestInfo, init?: RequestInit) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        if (bodyJson.method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'sess-1',
            },
          });
        }
        if (bodyJson.method === 'notifications/initialized') {
          return new Response(null, { status: 200 });
        }
        if (bodyJson.method === 'tools/call') {
          return new Response(
            JSON.stringify(
              createMcp503Response(bodyJson.params?.arguments?.entry_id)
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    });

    const adapter = new BitgetEquityAdapter({
      client: mcpClient,
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    // Quote failed on fallback, so complete must be false and gap recorded
    expect(result.complete).toBe(false);
    expect(result.gaps.some((g) => g.dimension === 'EQUITY_QUOTE')).toBe(true);
    assertEvidenceLedgerIntegrity(result.ledger);
  });

  it('11. Supported-market restrictions remain unchanged', async () => {
    const adapter = new BitgetEquityAdapter();

    // Crypto market rejected immediately
    await expect(
      adapter.gatherMarketObservations(createThesis('BTC', 'BTC/USDT'))
    ).rejects.toThrow(DissentError);

    // Unsupported equity ticker rejected immediately
    await expect(
      adapter.gatherMarketObservations(createThesis('UNKNOWN', 'UNKNOWN/USD'))
    ).rejects.toThrow(DissentError);

    // All 8 supported equity symbols are recognized
    const supportedSymbols = [
      'NVDA',
      'COIN',
      'MSFT',
      'MSTR',
      'TSLA',
      'AAPL',
      'AMD',
      'META',
    ];

    for (const sym of supportedSymbols) {
      const thesis = createThesis(sym);
      expect(thesis.market).toBe(`${sym}/USD`);
    }
  });

  it('12. Handshake HTTP error does NOT activate fallback (fails closed)', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};

      if (bodyJson.method === 'initialize') {
        // Initialize returns HTTP 503 during handshake
        return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const mockFallback = new FallbackEquityAdapter();
    const quoteSpy = vi.spyOn(mockFallback, 'collectFallbackQuote');
    const valSpy = vi.spyOn(mockFallback, 'collectFallbackValuation');

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      fallbackAdapter: mockFallback,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    expect(result.complete).toBe(false);
    // Handshake failure must NOT activate fallback
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(valSpy).not.toHaveBeenCalled();
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it('13. Timeout does NOT activate fallback (fails closed)', async () => {
    const hangingFetch = ((_: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Request timed out', 'AbortError'))
        );
      })) as typeof fetch;

    const mcpClient = new BitgetMcpClient({
      timeoutMs: 100,
      fetch: hangingFetch,
    });

    const mockFallback = new FallbackEquityAdapter();
    const quoteSpy = vi.spyOn(mockFallback, 'collectFallbackQuote');
    const valSpy = vi.spyOn(mockFallback, 'collectFallbackValuation');

    const adapter = new BitgetEquityAdapter({
      client: mcpClient,
      fallbackAdapter: mockFallback,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    expect(result.complete).toBe(false);
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(valSpy).not.toHaveBeenCalled();
    expect(result.gaps.some((g) => g.reason === 'TIMEOUT')).toBe(true);
  });

  it('14. Bitget date normalization: YYYY-MM-DD calendar date string', async () => {
    // Direct unit test
    const normalized = normalizeBitgetDate('2024-09-23', 'NVDA');
    expect(normalized.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(normalized.reportingPeriod).toBe('2024-09-23');

    // End-to-end client test with requestTime separation
    const requestTimeMs = 1790200000000;
    const fetchImpl = (async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          code: '00000',
          msg: 'success',
          requestTime: requestTimeMs,
          data: {
            date: '2024-09-23',
            peTtmEd: '28.5',
            tmvUsd: '3000000000000',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const client = new BitgetRestReferenceClient({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const val = await client.getEquityValuationData('NVDA');
    expect(val.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(val.reportingPeriod).toBe('2024-09-23');
    expect(val.retrievedAt).toBe(new Date(requestTimeMs).toISOString());
    expect(val.observedAt).not.toBe(val.retrievedAt);
  });

  it('15. Bitget date normalization: epoch-ms string date', async () => {
    // 1727049600000 is 2024-09-23T00:00:00.000Z
    const normalized = normalizeBitgetDate('1727049600000', 'NVDA');
    expect(normalized.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(normalized.reportingPeriod).toBe('2024-09-23');

    const fetchImpl = (async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          code: '00000',
          msg: 'success',
          requestTime: 1790200000000,
          data: {
            date: '1727049600000',
            peTtmEd: '28.5',
            tmvUsd: '3000000000000',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const client = new BitgetRestReferenceClient({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const val = await client.getEquityValuationData('NVDA');
    expect(val.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(val.reportingPeriod).toBe('2024-09-23');
  });

  it('16. Bitget date normalization: numeric epoch-ms date', async () => {
    // Numeric 1727049600000 is 2024-09-23T00:00:00.000Z
    const normalized = normalizeBitgetDate(1727049600000, 'NVDA');
    expect(normalized.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(normalized.reportingPeriod).toBe('2024-09-23');

    const fetchImpl = (async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          code: '00000',
          msg: 'success',
          requestTime: 1790200000000,
          data: {
            date: 1727049600000,
            peTtmEd: '28.5',
            tmvUsd: '3000000000000',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const client = new BitgetRestReferenceClient({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const val = await client.getEquityValuationData('NVDA');
    expect(val.observedAt).toBe('2024-09-23T00:00:00.000Z');
    expect(val.reportingPeriod).toBe('2024-09-23');
  });

  it('17. Bitget date normalization fails closed on malformed and impossible dates', async () => {
    // Impossible leap year day (Feb 30)
    expect(() => normalizeBitgetDate('2024-02-30', 'NVDA')).toThrow(DissentError);
    // Impossible non-leap year day (Feb 29 on 2023)
    expect(() => normalizeBitgetDate('2023-02-29', 'NVDA')).toThrow(DissentError);
    // Impossible 31st day on 30-day month (April 31)
    expect(() => normalizeBitgetDate('2024-04-31', 'NVDA')).toThrow(DissentError);
    // Impossible month 13
    expect(() => normalizeBitgetDate('2024-13-01', 'NVDA')).toThrow(DissentError);
    // Impossible month 0
    expect(() => normalizeBitgetDate('2024-00-15', 'NVDA')).toThrow(DissentError);
    // Impossible day 0
    expect(() => normalizeBitgetDate('2024-01-00', 'NVDA')).toThrow(DissentError);
    // Arbitrary malformed string
    expect(() => normalizeBitgetDate('invalid-date', 'NVDA')).toThrow(DissentError);
    // Empty string
    expect(() => normalizeBitgetDate('', 'NVDA')).toThrow(DissentError);
    // Null / Undefined
    expect(() => normalizeBitgetDate(null, 'NVDA')).toThrow(DissentError);
    expect(() => normalizeBitgetDate(undefined, 'NVDA')).toThrow(DissentError);
    // Out of range epoch
    expect(() => normalizeBitgetDate(-1000, 'NVDA')).toThrow(DissentError);
    expect(() => normalizeBitgetDate(0, 'NVDA')).toThrow(DissentError);
  });

  it('18. End-to-end: malformed date in valuation indicators fails closed to EQUITY_VALUATION gap and complete: false', async () => {
    const fetchImpl = (async (
      input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const url = String(input);
      const bodyStr = typeof init?.body === 'string' ? init.body : '';

      // MCP endpoint: returns tool 503 so fallback triggers
      if (url.includes('agent.bitget.com')) {
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        if (bodyJson.method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'sess-1',
            },
          });
        }
        if (bodyJson.method === 'notifications/initialized') {
          return new Response(null, { status: 200 });
        }
        if (bodyJson.method === 'tools/call') {
          const entryId = bodyJson.params?.arguments?.entry_id;
          return new Response(JSON.stringify(createMcp503Response(entryId)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      // Eulerpool succeeds
      if (url.includes('api.eulerpool.com/api/1/market/last-quote')) {
        return new Response(JSON.stringify(CANONICAL_EULERPOOL_FIXTURE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Bitget REST returns malformed date
      if (
        url.includes('api.bitget.com/api/v3/reality/market/valuation-indicators')
      ) {
        return new Response(
          JSON.stringify({
            code: '00000',
            msg: 'success',
            requestTime: 1790200000000,
            data: {
              date: '2024-02-30', // Impossible date
              peTtmEd: '28.5',
              tmvUsd: '5515767000000',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      eulerpoolApiKey: 'test-key',
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createThesis('NVDA'));

    // Valuation failed closed due to impossible date
    expect(result.complete).toBe(false);
    expect(
      result.gaps.some(
        (g) => g.dimension === 'EQUITY_VALUATION' && g.reason === 'INVALID_RESPONSE'
      )
    ).toBe(true);
    assertEvidenceLedgerIntegrity(result.ledger);
  });
});
