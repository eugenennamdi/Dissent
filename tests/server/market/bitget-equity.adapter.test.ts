import { describe, expect, it } from 'vitest';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import { BitgetEquityAdapter } from '@/server/market/bitget-equity.adapter';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import { BitgetMcpClient } from '@/server/market/bitget-mcp.client';
import {
  SANITY_MCP_INIT_RESPONSE,
  SANITY_MCP_JSONRPC_ERROR_RESPONSE,
  SANITY_MCP_PARTIAL_RATIOS_RESPONSE,
  SANITY_MCP_QUOTE_RECORD,
  SANITY_MCP_QUOTE_RESPONSE,
  SANITY_MCP_RATIOS_RECORD,
  SANITY_MCP_RATIOS_RESPONSE,
  SANITY_MCP_TOOL_ERROR_RESPONSE,
} from '../../fixtures/bitget-mcp-nvda.fixtures';
import {
  MULTI_EQUITY_FIXTURES,
  createMultiEquityMcpResponse,
} from '../../fixtures/bitget-mcp-multi-equity.fixtures';

const NOW = new Date('2026-09-24T12:00:00.000Z');

function createNvdaThesis(
  direction: 'LONG' | 'SHORT' = 'LONG',
  market = 'NVDA/USD'
): StructuredThesisV1 {
  return {
    id: 'th_nvda_test',
    thesisInputId: 'inp_nvda_test',
    originalThesis:
      'NVDA will outperform expectations heading into the data-center refresh cycle despite elevated valuation multiples.',
    market,
    baseAsset: market.split('/')[0] || 'NVDA',
    quoteAsset: market.split('/')[1] || 'USD',
    claim: 'NVDA will expand market share with high margin retention',
    direction,
    timeHorizon: { description: '3 months', estimatedHours: 2160 },
    catalysts: ['data-center demand', 'supply expansion'],
    createdAt: NOW.toISOString(),
    schemaVersion: 1,
  };
}

function mockMcpFetch(responses: {
  quote?: unknown;
  ratios?: unknown;
  quoteStatus?: number;
  ratiosStatus?: number;
  initStatus?: number;
  sseFormat?: boolean;
}) {
  return (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
    const method = bodyJson.method;

    if (method === 'initialize') {
      const payload = SANITY_MCP_INIT_RESPONSE;
      return new Response(JSON.stringify(payload), {
        status: responses.initStatus ?? 200,
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': 'test-session-12345',
        },
      });
    }

    if (method === 'tools/call') {
      const entryId = bodyJson.params?.arguments?.entry_id;
      let payload: unknown;
      let status = 200;

      if (entryId === 'equity_price_quote') {
        payload = responses.quote ?? SANITY_MCP_QUOTE_RESPONSE;
        status = responses.quoteStatus ?? 200;
      } else if (entryId === 'equity_fundamental_ratios') {
        payload = responses.ratios ?? SANITY_MCP_RATIOS_RESPONSE;
        status = responses.ratiosStatus ?? 200;
      } else {
        payload = { jsonrpc: '2.0', id: bodyJson.id, error: { code: -32601, message: 'Not found' } };
      }

      const bodyText = responses.sseFormat
        ? `event: message\ndata: ${JSON.stringify(payload)}\n\n`
        : JSON.stringify(payload);

      return new Response(bodyText, {
        status,
        headers: {
          'Content-Type': responses.sseFormat ? 'text/event-stream' : 'application/json',
          'mcp-session-id': 'test-session-12345',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown' }), { status: 404 });
  }) as typeof fetch;
}

describe('Bitget Equity MCP Adapter (Offline Unit Tests)', () => {
  it('successfully gathers verified NVDA/USD equity observations into a complete ledger', async () => {
    const fetchImpl = mockMcpFetch({});
    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('LONG'));

    expect(result.complete).toBe(true);
    expect(result.gaps).toHaveLength(0);

    const ledger = result.ledger;
    expect(() => assertEvidenceLedgerIntegrity(ledger)).not.toThrow();
    expect(ledger.items.length).toBeGreaterThanOrEqual(6);

    // Verify LAST_PRICE
    const lastPriceItem = ledger.items.find((i) => i.observation.type === 'LAST_PRICE');
    expect(lastPriceItem).toBeDefined();
    expect(lastPriceItem?.value).toBe(SANITY_MCP_QUOTE_RECORD.last_price);
    expect(lastPriceItem?.unit).toBe('USD');
    expect(lastPriceItem?.observation.instrumentType).toBe('EQUITY_CASH');
    expect(lastPriceItem?.observation.market).toBe('NVDA/USD');
    expect(lastPriceItem?.provenance.observedAt).toBeNull();
    expect(lastPriceItem?.provenance.freshnessMode).toBe('UNKNOWN_OBSERVATION_TIME');

    // Verify derived SESSION_PRICE_CHANGE
    const priceChangeItem = ledger.items.find(
      (i) => i.observation.type === 'SESSION_PRICE_CHANGE'
    );
    expect(priceChangeItem).toBeDefined();
    // Fractional -0.009392514871741068 * 100 -> -0.93925
    expect(priceChangeItem?.value).toBeCloseTo(-0.93925, 4);
    expect(priceChangeItem?.unit).toBe('PERCENT');
    expect(priceChangeItem?.provenance.observedAt).toBeNull();
    expect(priceChangeItem?.provenance.freshnessMode).toBe('UNKNOWN_OBSERVATION_TIME');
    expect(priceChangeItem?.metadata?.formula).toBe(
      '((last_price - prev_close) / prev_close) * 100'
    );

    // Verify SESSION_VOLUME
    const volumeItem = ledger.items.find((i) => i.observation.type === 'SESSION_VOLUME');
    expect(volumeItem).toBeDefined();
    expect(volumeItem?.value).toBe(SANITY_MCP_QUOTE_RECORD.volume);
    expect(volumeItem?.unit).toBe('SHARES');

    // Verify MARKET_CAPITALIZATION
    const capItem = ledger.items.find((i) => i.observation.type === 'MARKET_CAPITALIZATION');
    expect(capItem).toBeDefined();
    expect(capItem?.value).toBe(SANITY_MCP_QUOTE_RECORD.total_market_cap);
    expect(capItem?.unit).toBe('USD');
    expect(capItem?.category).toBe('VALUATION_METRIC');

    // Verify VALUATION_PE_TTM
    const peTtmItem = ledger.items.find((i) => i.observation.type === 'VALUATION_PE_TTM');
    expect(peTtmItem).toBeDefined();
    expect(peTtmItem?.value).toBe(SANITY_MCP_RATIOS_RECORD.pe_ttm_ed);
    expect(peTtmItem?.unit).toBe('RATIO');
    expect(peTtmItem?.observation.reportingPeriod).toBe('2026-09-23');
    expect(peTtmItem?.provenance.observedAt).toBe('2026-09-23T00:00:00.000Z');
    expect(peTtmItem?.provenance.freshnessMode).toBe('HISTORICAL_RECORD');

    // Verify VALUATION_PE_LYR
    const peLyrItem = ledger.items.find((i) => i.observation.type === 'VALUATION_PE_LYR');
    expect(peLyrItem).toBeDefined();
    expect(peLyrItem?.value).toBe(SANITY_MCP_RATIOS_RECORD.pe_lyr);

    // Verify VALUATION_EV_EBITDA
    const evItem = ledger.items.find((i) => i.observation.type === 'VALUATION_EV_EBITDA');
    expect(evItem).toBeDefined();
    expect(evItem?.value).toBe(SANITY_MCP_RATIOS_RECORD.ent_multi);

    // Verify VALUATION_PB_RATIO
    const pbItem = ledger.items.find((i) => i.observation.type === 'VALUATION_PB_RATIO');
    expect(pbItem).toBeDefined();
    expect(pbItem?.value).toBe(SANITY_MCP_RATIOS_RECORD.pb_mrq);
  });

  it('handles Server-Sent Events (SSE) data line framing seamlessly', async () => {
    const fetchImpl = mockMcpFetch({ sseFormat: true });
    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('SHORT'));
    expect(result.complete).toBe(true);
    expect(result.ledger.items.length).toBeGreaterThanOrEqual(6);
  });

  it('rejects unsupported instruments and non-equity markets', async () => {
    const adapter = new BitgetEquityAdapter({ now: () => NOW });

    // Crypto market
    await expect(
      adapter.gatherMarketObservations(createNvdaThesis('LONG', 'BTC/USDT'))
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });

    // Unsupported stock
    await expect(
      adapter.gatherMarketObservations(createNvdaThesis('LONG', 'GOOGL/USD'))
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });

    // Relative thesis direction for equity
    const relativeThesis: StructuredThesisV1 = {
      ...createNvdaThesis('LONG'),
      direction: 'RELATIVE_LONG' as any,
    };
    await expect(adapter.gatherMarketObservations(relativeThesis)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('permits optional valuation fields to be absent without failing the ledger', async () => {
    const fetchImpl = mockMcpFetch({
      ratios: SANITY_MCP_PARTIAL_RATIOS_RESPONSE,
    });
    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('LONG'));

    expect(result.complete).toBe(true);
    expect(result.gaps).toHaveLength(0);

    // Present metric
    expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PE_TTM')).toBe(true);
    // Absent metric was omitted cleanly
    expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PE_LYR')).toBe(false);
    expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_EV_EBITDA')).toBe(
      false
    );
  });

  it('records an explicit gap and marks complete: false when valuation query fails', async () => {
    const fetchImpl = mockMcpFetch({
      ratios: SANITY_MCP_TOOL_ERROR_RESPONSE,
    });
    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('LONG'));

    // Quote items were preserved
    expect(result.ledger.items.some((i) => i.observation.type === 'LAST_PRICE')).toBe(true);
    // Complete is false because of the valuation gap
    expect(result.complete).toBe(false);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      market: 'NVDA/USD',
      dimension: 'EQUITY_VALUATION',
      reason: 'PROVIDER_ERROR',
    });
  });

  it('records an explicit gap when quote query fails', async () => {
    const fetchImpl = mockMcpFetch({
      quote: SANITY_MCP_JSONRPC_ERROR_RESPONSE,
    });
    const adapter = new BitgetEquityAdapter({
      fetch: fetchImpl,
      now: () => NOW,
    });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('LONG'));

    expect(result.complete).toBe(false);
    expect(result.gaps.some((g) => g.dimension === 'EQUITY_QUOTE')).toBe(true);
  });

  it('reports timeout error correctly as TIMEOUT gap', async () => {
    const hangingFetch = ((_: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Request timed out', 'AbortError'))
        );
      })) as typeof fetch;

    const client = new BitgetMcpClient({
      fetch: hangingFetch,
      timeoutMs: 150,
    });
    const adapter = new BitgetEquityAdapter({ client, now: () => NOW });

    const result = await adapter.gatherMarketObservations(createNvdaThesis('LONG'));
    expect(result.complete).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps[0]?.reason).toBe('TIMEOUT');
  });

  it('preserves existing crypto adapter regression behavior', async () => {
    // BitgetMarketAdapter rejects NVDA/USD
    const cryptoAdapter = new BitgetMarketAdapter();
    await expect(
      cryptoAdapter.gatherMarketObservations(createNvdaThesis('LONG'))
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_MARKET',
    });
  });

  it('rejects unapproved host for Bitget MCP client', () => {
    expect(
      () =>
        new BitgetMcpClient({
          endpoint: 'https://evil.com/mcp',
        })
    ).toThrow(DissentError);
  });

  describe('Multi-Stock Universe Expansion (8 Symbols)', () => {
    const symbols = ['NVDA', 'COIN', 'MSFT', 'MSTR', 'TSLA', 'AAPL', 'AMD', 'META'] as const;

    function mockMultiStockFetch() {
      return (async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        const method = bodyJson.method;

        if (method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'test-session-multi',
            },
          });
        }

        if (method === 'tools/call') {
          const entryId = bodyJson.params?.arguments?.entry_id as
            | 'equity_price_quote'
            | 'equity_fundamental_ratios';
          const symbol = (bodyJson.params?.arguments?.params?.symbol ??
            bodyJson.params?.arguments?.symbol) as string;
          const payload = createMultiEquityMcpResponse(symbol, entryId);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'test-session-multi',
            },
          });
        }

        return new Response(JSON.stringify({ error: 'unknown' }), { status: 404 });
      }) as typeof fetch;
    }

    it.each(symbols)('gathers complete verified ledger for %s in LONG and SHORT', async (symbol) => {
      const adapter = new BitgetEquityAdapter({
        fetch: mockMultiStockFetch(),
        now: () => NOW,
      });

      for (const direction of ['LONG', 'SHORT'] as const) {
        const thesis: StructuredThesisV1 = {
          id: `th_${symbol.toLowerCase()}_test`,
          thesisInputId: `inp_${symbol.toLowerCase()}_test`,
          originalThesis: `${symbol} test thesis across 90 days.`,
          market: `${symbol}/USD`,
          baseAsset: symbol,
          quoteAsset: 'USD',
          claim: `${symbol} test direction claim`,
          direction,
          timeHorizon: { description: '90 days' },
          catalysts: [],
          createdAt: NOW.toISOString(),
          schemaVersion: 1,
        };

        const result = await adapter.gatherMarketObservations(thesis);
        expect(result.complete).toBe(true);
        expect(result.gaps).toHaveLength(0);
        expect(result.ledger.items.length).toBeGreaterThanOrEqual(4);
        assertEvidenceLedgerIntegrity(result.ledger);

        const priceItem = result.ledger.items.find((i) => i.observation.type === 'LAST_PRICE');
        expect(priceItem).toBeDefined();
        expect(priceItem?.observation.market).toBe(`${symbol}/USD`);
        expect(priceItem?.observation.providerSymbol).toBe(symbol);
        expect(priceItem?.observation.instrumentType).toBe('EQUITY_CASH');
        expect(priceItem?.provenance.sourceName).toBe('bitget-mcp-server');
      }
    });

    it('correctly ingests negative ratios without loss of precision or altered provenance (COIN, MSTR)', async () => {
      const adapter = new BitgetEquityAdapter({
        fetch: mockMultiStockFetch(),
        now: () => NOW,
      });

      // COIN has negative P/E (-52.9242)
      const coinThesis: StructuredThesisV1 = {
        id: 'th_coin_neg',
        thesisInputId: 'inp_coin_neg',
        originalThesis: 'COIN operating recovery thesis despite negative earnings.',
        market: 'COIN/USD',
        baseAsset: 'COIN',
        quoteAsset: 'USD',
        claim: 'COIN will advance',
        direction: 'LONG',
        timeHorizon: { description: '60 days' },
        catalysts: [],
        createdAt: NOW.toISOString(),
        schemaVersion: 1,
      };

      const coinResult = await adapter.gatherMarketObservations(coinThesis);
      const coinPeItem = coinResult.ledger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_TTM'
      );
      expect(coinPeItem).toBeDefined();
      expect(coinPeItem?.value).toBe(-52.9242);
      expect(coinPeItem?.unit).toBe('RATIO');
      expect(coinPeItem?.claim).toContain('-52.9242x');

      // MSTR has negative P/E (-1.9934), negative PE LYR (-14.75), and negative EV/EBITDA (-12.7712)
      const mstrThesis: StructuredThesisV1 = {
        id: 'th_mstr_neg',
        thesisInputId: 'inp_mstr_neg',
        originalThesis: 'MSTR valuation scrutiny thesis.',
        market: 'MSTR/USD',
        baseAsset: 'MSTR',
        quoteAsset: 'USD',
        claim: 'MSTR multiple scrutiny',
        direction: 'SHORT',
        timeHorizon: { description: '60 days' },
        catalysts: [],
        createdAt: NOW.toISOString(),
        schemaVersion: 1,
      };

      const mstrResult = await adapter.gatherMarketObservations(mstrThesis);
      const mstrPeItem = mstrResult.ledger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_TTM'
      );
      const mstrPeLyrItem = mstrResult.ledger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_LYR'
      );
      const mstrEvItem = mstrResult.ledger.items.find(
        (i) => i.observation.type === 'VALUATION_EV_EBITDA'
      );

      expect(mstrPeItem).toBeDefined();
      expect(mstrPeItem?.value).toBe(-1.9934);
      expect(mstrPeLyrItem).toBeDefined();
      expect(mstrPeLyrItem?.value).toBe(-14.75);
      expect(mstrEvItem).toBeDefined();
      expect(mstrEvItem?.value).toBe(-12.7712);
    });

    it('safely handles missing or null ratio fields without failure', async () => {
      const adapter = new BitgetEquityAdapter({
        fetch: mockMultiStockFetch(),
        now: () => NOW,
      });

      // COIN has pe_lyr: null and div_yield_12m: null
      const thesis: StructuredThesisV1 = {
        id: 'th_coin_partial',
        thesisInputId: 'inp_coin_partial',
        originalThesis: 'COIN partial ratio test.',
        market: 'COIN/USD',
        baseAsset: 'COIN',
        quoteAsset: 'USD',
        claim: 'COIN partial test',
        direction: 'LONG',
        timeHorizon: { description: '30 days' },
        catalysts: [],
        createdAt: NOW.toISOString(),
        schemaVersion: 1,
      };

      const result = await adapter.gatherMarketObservations(thesis);
      expect(result.complete).toBe(true);
      // pe_lyr should not be present
      expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PE_LYR')).toBe(false);
      // But pe_ttm, pb, ev_ebitda, ps_ttm should be present
      expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PE_TTM')).toBe(true);
      expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PB_RATIO')).toBe(true);
      expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_EV_EBITDA')).toBe(true);
      expect(result.ledger.items.some((i) => i.observation.type === 'VALUATION_PS_TTM')).toBe(true);
    });

    it('rejects unsupported equity markets and directions', async () => {
      const adapter = new BitgetEquityAdapter({
        fetch: mockMultiStockFetch(),
        now: () => NOW,
      });

      // Unsupported equity symbol
      await expect(
        adapter.gatherMarketObservations({
          id: 'th_unsupported_equity',
          thesisInputId: 'inp_unsupported',
          originalThesis: 'SPY is going up.',
          market: 'SPY/USD',
          baseAsset: 'SPY',
          quoteAsset: 'USD',
          claim: 'SPY up',
          direction: 'LONG',
          timeHorizon: { description: '30 days' },
          catalysts: [],
          createdAt: NOW.toISOString(),
          schemaVersion: 1,
        })
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_MARKET',
      });

      // Relative equity thesis
      await expect(
        adapter.gatherMarketObservations({
          id: 'th_relative_equity',
          thesisInputId: 'inp_relative',
          originalThesis: 'NVDA will outperform MSFT.',
          market: 'NVDA/USD',
          baseAsset: 'NVDA',
          quoteAsset: 'USD',
          claim: 'NVDA relative',
          direction: 'RELATIVE_LONG' as any,
          timeHorizon: { description: '30 days' },
          catalysts: [],
          createdAt: NOW.toISOString(),
          schemaVersion: 1,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it.each(symbols)('verifies crypto adapter rejects %s/USD', async (symbol) => {
      const cryptoAdapter = new BitgetMarketAdapter();
      await expect(
        cryptoAdapter.gatherMarketObservations({
          id: `th_crypto_${symbol.toLowerCase()}`,
          thesisInputId: `inp_crypto_${symbol.toLowerCase()}`,
          originalThesis: `${symbol} test`,
          market: `${symbol}/USD`,
          baseAsset: symbol,
          quoteAsset: 'USD',
          claim: `${symbol} test`,
          direction: 'LONG',
          timeHorizon: { description: '30 days' },
          catalysts: [],
          createdAt: NOW.toISOString(),
          schemaVersion: 1,
        })
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_MARKET',
      });
    });
  });
});
