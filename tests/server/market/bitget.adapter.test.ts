import { describe, expect, it } from 'vitest';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import {
  BitgetCandlesDataSchema,
  BitgetTickerSchema,
} from '@/server/market/bitget.schemas';

const NOW = new Date('2026-09-19T12:30:00.000Z');
const REQUEST_TIME = NOW.getTime();
const TEN = String(Date.parse('2026-09-19T10:00:00.000Z'));
const ELEVEN = String(Date.parse('2026-09-19T11:00:00.000Z'));
const TICKER_TIME = String(Date.parse('2026-09-19T12:29:30.000Z'));

const thesis: StructuredThesisV1 = {
  id: 'th_eth_btc',
  thesisInputId: 'inp_eth_btc',
  originalThesis:
    'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.',
  market: 'ETH/BTC',
  baseAsset: 'ETH',
  quoteAsset: 'BTC',
  claim: 'ETH will outperform BTC over 48 hours',
  direction: 'RELATIVE_LONG',
  timeHorizon: { description: '48 hours', estimatedHours: 48 },
  catalysts: ['risk appetite', 'ETH momentum'],
  createdAt: NOW.toISOString(),
  schemaVersion: 1,
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ticker(symbol: string, category: 'SPOT' | 'USDT-FUTURES') {
  const isEth = symbol === 'ETHUSDT';
  return {
    symbol,
    category,
    ts: TICKER_TIME,
    lastPrice: isEth ? '210.0000' : '102.00',
    openPrice24h: isEth ? '200' : '100',
    highPrice24h: isEth ? '212' : '103',
    lowPrice24h: isEth ? '198' : '99',
    ask1Price: isEth ? '210.1' : '102.1',
    bid1Price: isEth ? '209.9' : '101.9',
    bid1Size: '1.25',
    ask1Size: '1.5',
    price24hPcnt: isEth ? '0.05' : '0.02',
    turnover24h: '1000000.25',
    volume24h: isEth ? '5000.5' : '1000.25',
    ...(category === 'USDT-FUTURES'
      ? { fundingRate: isEth ? '0.0001' : '-0.00005', openInterest: '1234.5678' }
      : {}),
  };
}

interface MockOptions {
  malformedSpotTicker?: boolean;
  failEthFutures?: boolean;
  insufficientEthCandles?: boolean;
  staleSpotTicker?: boolean;
}

function createMockFetch(options: MockOptions = {}): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const symbol = url.searchParams.get('symbol') ?? '';
    const category = url.searchParams.get('category');
    if (url.pathname === '/api/v3/market/instruments') {
      const baseCoin = symbol.replace('USDT', '');
      return json({
        code: '00000',
        msg: 'success',
        requestTime: REQUEST_TIME,
        data: [{ symbol, category: 'SPOT', baseCoin, quoteCoin: 'USDT', status: 'online' }],
      });
    }
    if (url.pathname === '/api/v3/market/tickers') {
      if (options.failEthFutures && symbol === 'ETHUSDT' && category === 'USDT-FUTURES') {
        return json({ message: 'unavailable' }, 503);
      }
      if (options.malformedSpotTicker && category === 'SPOT') {
        return json({ code: '00000', msg: 'success', requestTime: REQUEST_TIME, data: [{}] });
      }
      const tickerPayload = ticker(symbol, category as 'SPOT' | 'USDT-FUTURES');
      if (options.staleSpotTicker && category === 'SPOT') {
        tickerPayload.ts = String(Date.parse('2026-09-19T12:20:00.000Z'));
      }
      return json({
        code: '00000',
        msg: 'success',
        requestTime: REQUEST_TIME,
        data: [tickerPayload],
      });
    }
    if (url.pathname === '/api/v3/market/candles') {
      const isEth = symbol === 'ETHUSDT';
      const rows = isEth
        ? [
            [TEN, '200', '204', '199', '203', '10', '2000'],
            [ELEVEN, '203', '211', '202', '210', '12', '2400'],
          ]
        : [
            [TEN, '100', '102', '99', '101', '20', '2000'],
            [ELEVEN, '101', '103', '100', '102', '22', '2200'],
          ];
      return json({
        code: '00000',
        msg: 'success',
        requestTime: REQUEST_TIME,
        data: options.insufficientEthCandles && isEth ? rows.slice(1) : rows,
      });
    }
    return json({}, 404);
  }) as typeof fetch;
}

function adapter(fetchImpl = createMockFetch()): BitgetMarketAdapter {
  return new BitgetMarketAdapter({ fetch: fetchImpl, now: () => NOW, timeoutMs: 100 });
}

describe('BitgetMarketAdapter', () => {
  it('normalizes realistic V3 responses into an integral evidence ledger', async () => {
    const result = await adapter().gatherMarketObservations(thesis, {
      lookbackHours: 2,
      includeFutures: true,
    });

    expect(result.complete).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.ledger.items.length).toBe(18);
    expect(() => assertEvidenceLedgerIntegrity(result.ledger)).not.toThrow();
    expect(Object.isFrozen(result.ledger)).toBe(true);
    expect(Object.isFrozen(result.ledger.items[0]?.provenance)).toBe(true);
    expect(
      result.ledger.items.find((item) => item.observation.type === 'LAST_PRICE')?.provenance
        .observedAt
    ).toBe('2026-09-19T12:29:30.000Z');
    expect(
      result.ledger.items.find(
        (item) => item.observation.type === 'RETURN_SPREAD'
      )?.value
    ).toBe('3');
    expect(
      result.ledger.items.find(
        (item) => item.observation.type === 'RELATIVE_RETURN'
      )?.value
    ).toBe('2.94117647');
  });

  it('preserves provenance and stable IDs for identical normalized observations', async () => {
    const first = await adapter().gatherMarketObservations(thesis, {
      lookbackHours: 2,
      includeFutures: false,
    });
    const second = await adapter().gatherMarketObservations(thesis, {
      lookbackHours: 2,
      includeFutures: false,
    });
    const shorterWindow = await adapter().gatherMarketObservations(thesis, {
      lookbackHours: 1,
      includeFutures: false,
    });
    expect(first.ledger.items.map((item) => item.id).sort()).toEqual(
      second.ledger.items.map((item) => item.id).sort()
    );
    const derived = first.ledger.items.find(
      (item) => item.observation.type === 'RELATIVE_RETURN'
    );
    expect(derived?.derivedFromEvidenceIds).toHaveLength(2);
    expect(derived?.provenance.sourceType).toBe('DERIVED_ANALYTICS');
    expect(derived?.provenance.rawSnapshot).toMatchObject({
      formula:
        '(((1 + baseAssetPercentChange / 100) / (1 + quoteAssetPercentChange / 100)) - 1) * 100',
    });
    const closeId = first.ledger.items.find(
      (item) =>
        item.observation.market === 'BTC/USDT' && item.observation.type === 'CANDLE_CLOSE'
    )?.id;
    expect(
      shorterWindow.ledger.items.find(
        (item) =>
          item.observation.market === 'BTC/USDT' && item.observation.type === 'CANDLE_CLOSE'
      )?.id
    ).toBe(closeId);
  });

  it('rejects malformed provider schemas and invalid decimal data', () => {
    expect(() => BitgetTickerSchema.parse({ ...ticker('BTCUSDT', 'SPOT'), lastPrice: 'NaN' })).toThrow();
    expect(() => BitgetCandlesDataSchema.parse([[TEN, '1', '2', '0', 'Infinity', '3', '4']])).toThrow();
  });

  it('reports malformed external ticker payloads as invalid partial dimensions', async () => {
    const result = await adapter(
      createMockFetch({ malformedSpotTicker: true })
    ).gatherMarketObservations(thesis, { lookbackHours: 2, includeFutures: false });
    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'SPOT_TICKER', reason: 'INVALID_RESPONSE' }),
      ])
    );
    expect(result.ledger.items.some((item) => item.observation.type === 'LAST_PRICE')).toBe(false);
  });

  it('retains valid observations and reports a partial futures failure', async () => {
    const result = await adapter(createMockFetch({ failEthFutures: true })).gatherMarketObservations(
      thesis,
      { lookbackHours: 2, includeFutures: true }
    );
    expect(result.complete).toBe(false);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({
        market: 'ETH/USDT',
        dimension: 'FUTURES_TICKER',
        reason: 'PROVIDER_ERROR',
      })
    );
    expect(result.ledger.items.some((item) => item.observation.market === 'BTC/USDT')).toBe(true);
  });

  it('reports insufficient history and does not synthesize relative metrics', async () => {
    const result = await adapter(
      createMockFetch({ insufficientEthCandles: true })
    ).gatherMarketObservations(thesis, { lookbackHours: 2, includeFutures: false });
    expect(result.complete).toBe(false);
    expect(result.gaps.map((gap) => gap.dimension)).toEqual(
      expect.arrayContaining(['SPOT_CANDLES', 'RELATIVE_METRICS'])
    );
    expect(
      result.ledger.items.some((item) =>
        ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(item.observation.type)
      )
    ).toBe(false);
  });

  it('excludes stale ticker snapshots and reports the affected dimension', async () => {
    const result = await adapter(
      createMockFetch({ staleSpotTicker: true })
    ).gatherMarketObservations(thesis, { lookbackHours: 2, includeFutures: false });
    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dimension: 'SPOT_TICKER', reason: 'STALE_DATA' }),
      ])
    );
    expect(result.ledger.items.some((item) => item.observation.type === 'LAST_PRICE')).toBe(false);
  });

  it('rejects unsupported and malformed structured market symbols before requests', async () => {
    await expect(
      adapter().gatherMarketObservations({ ...thesis, market: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
    await expect(
      adapter().gatherMarketObservations({ ...thesis, market: 'ETHBTC' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
  });

  it('surfaces mandatory provider failure without exposing response bodies', async () => {
    const failingFetch = (async () => json({ secret: 'do-not-leak' }, 429)) as typeof fetch;
    await expect(adapter(failingFetch).gatherMarketObservations(thesis)).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
      details: expect.objectContaining({ statusCode: 429 }),
    });
  });

  it('surfaces provider-level error envelopes as typed external errors', async () => {
    const providerErrorFetch = (async () =>
      json({ code: '40034', msg: 'parameter error', requestTime: REQUEST_TIME, data: null })) as typeof fetch;
    await expect(adapter(providerErrorFetch).gatherMarketObservations(thesis)).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
      details: expect.objectContaining({ providerCode: '40034' }),
    });
  });

  it('maps bounded request abortion to the typed timeout error', async () => {
    const hangingFetch = ((_: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        );
      })) as typeof fetch;
    await expect(adapter(hangingFetch).gatherMarketObservations(thesis)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('rejects non-approved provider hosts', () => {
    expect(() => new BitgetMarketAdapter({ baseUrl: 'https://example.com' })).toThrow(DissentError);
  });
});
