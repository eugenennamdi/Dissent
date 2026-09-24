import { describe, expect, it } from 'vitest';
import type {
  StructuredThesisV1,
  ThesisDirectionV1,
} from '@/core/contracts/thesis';
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

function researchThesis(
  baseAsset: 'BTC' | 'ETH' | 'SOL',
  quoteAsset: 'BTC' | 'ETH' | 'SOL' | 'USDT',
  direction: ThesisDirectionV1
): StructuredThesisV1 {
  return {
    ...thesis,
    id: `th_${baseAsset.toLowerCase()}_${quoteAsset.toLowerCase()}`,
    thesisInputId: `inp_${baseAsset.toLowerCase()}_${quoteAsset.toLowerCase()}`,
    originalThesis: `${baseAsset} thesis against ${quoteAsset}`,
    market: `${baseAsset}/${quoteAsset}`,
    baseAsset,
    quoteAsset,
    claim: `${baseAsset} thesis against ${quoteAsset}`,
    direction,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ticker(symbol: string, category: 'SPOT' | 'USDT-FUTURES') {
  const asset = symbol.replace('USDT', '');
  const values = {
    BTC: { last: '102', open: '100', change: '0.02', volume: '1000.25' },
    ETH: { last: '210', open: '200', change: '0.05', volume: '5000.5' },
    SOL: { last: '55', open: '50', change: '0.10', volume: '9000.75' },
  }[asset] ?? { last: '1', open: '1', change: '0', volume: '1' };
  return {
    symbol,
    category,
    ts: TICKER_TIME,
    lastPrice: values.last,
    openPrice24h: values.open,
    highPrice24h: values.last,
    lowPrice24h: values.open,
    ask1Price: values.last,
    bid1Price: values.last,
    bid1Size: '1.25',
    ask1Size: '1.5',
    price24hPcnt: values.change,
    turnover24h: '1000000.25',
    volume24h: values.volume,
    ...(category === 'USDT-FUTURES'
      ? { fundingRate: asset === 'ETH' ? '0.0001' : '-0.00005', openInterest: '1234.5678' }
      : {}),
  };
}

interface MockOptions {
  malformedSpotTicker?: boolean;
  failEthFutures?: boolean;
  insufficientEthCandles?: boolean;
  staleSpotTicker?: boolean;
  missingSpotSymbol?: string;
  missingFuturesSymbol?: string;
  misalignedCandleSymbol?: string;
}

function createMockFetch(options: MockOptions = {}): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const symbol = url.searchParams.get('symbol') ?? '';
    const category = url.searchParams.get('category');
    if (url.pathname === '/api/v3/market/instruments') {
      const baseCoin = symbol.replace('USDT', '');
      const missing =
        (category === 'SPOT' && options.missingSpotSymbol === symbol) ||
        (category === 'USDT-FUTURES' && options.missingFuturesSymbol === symbol);
      return json({
        code: '00000',
        msg: 'success',
        requestTime: REQUEST_TIME,
        data: missing
          ? []
          : [{ symbol, category, baseCoin, quoteCoin: 'USDT', status: 'online' }],
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
      const asset = symbol.replace('USDT', '');
      const [start, middle, end] =
        asset === 'ETH'
          ? ['200', '203', '210']
          : asset === 'SOL'
            ? ['50', '52', '55']
            : ['100', '101', '102'];
      const rows = [
        [TEN, start, middle, start, middle, '10', '2000'],
        [ELEVEN, middle, end, middle, end, '12', '2400'],
      ];
      const returnedRows =
        options.insufficientEthCandles && asset === 'ETH'
          ? rows.slice(1)
          : options.misalignedCandleSymbol === symbol
            ? [[String(Number(TEN) + 30 * 60 * 1000), ...rows[0]!.slice(1)], rows[1]!]
            : rows;
      return json({
        code: '00000',
        msg: 'success',
        requestTime: REQUEST_TIME,
        data: returnedRows,
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

  it.each([
    {
      baseAsset: 'SOL' as const,
      quoteAsset: 'BTC' as const,
      expectedSpread: '8',
      expectedRelativeReturn: '7.84313725',
    },
    {
      baseAsset: 'SOL' as const,
      quoteAsset: 'ETH' as const,
      expectedSpread: '5',
      expectedRelativeReturn: '4.76190476',
    },
    {
      baseAsset: 'BTC' as const,
      quoteAsset: 'SOL' as const,
      expectedSpread: '-8',
      expectedRelativeReturn: '-7.27272727',
    },
  ])(
    'preserves the ordered $baseAsset/$quoteAsset comparison using aligned USDT observations',
    async ({ baseAsset, quoteAsset, expectedSpread, expectedRelativeReturn }) => {
      const comparison = researchThesis(
        baseAsset,
        quoteAsset,
        'RELATIVE_LONG'
      );
      const result = await adapter().gatherMarketObservations(comparison, {
        lookbackHours: 2,
        includeFutures: false,
      });
      const spread = result.ledger.items.find(
        (item) => item.observation.type === 'RETURN_SPREAD'
      );
      const relativeReturn = result.ledger.items.find(
        (item) => item.observation.type === 'RELATIVE_RETURN'
      );

      expect(result.complete).toBe(true);
      expect(spread).toMatchObject({
        value: expectedSpread,
        unit: 'percentage points',
        nature: 'DERIVED',
        observation: {
          market: `${baseAsset}/${quoteAsset}`,
          instrumentType: 'DERIVED_SPOT_PAIR',
          providerSymbol: `${baseAsset}USDT:${quoteAsset}USDT`,
        },
      });
      expect(relativeReturn).toMatchObject({
        value: expectedRelativeReturn,
        unit: '%',
        nature: 'DERIVED',
        observation: {
          market: `${baseAsset}/${quoteAsset}`,
          instrumentType: 'DERIVED_SPOT_PAIR',
          providerSymbol: `${baseAsset}USDT:${quoteAsset}USDT`,
        },
      });
      expect(spread?.derivedFromEvidenceIds).toHaveLength(2);
      expect(relativeReturn?.derivedFromEvidenceIds).toEqual(
        spread?.derivedFromEvidenceIds
      );
      expect(
        result.ledger.items.some(
          (item) =>
            item.provenance.sourceType === 'EXCHANGE_API' &&
            item.observation.market === `${baseAsset}/${quoteAsset}`
        )
      ).toBe(false);
    }
  );

  it.each([
    { asset: 'BTC' as const, direction: 'LONG' as const },
    { asset: 'SOL' as const, direction: 'SHORT' as const },
  ])(
    'collects only $asset observations for a single-asset $direction thesis',
    async ({ asset, direction }) => {
      const result = await adapter().gatherMarketObservations(
        researchThesis(asset, 'USDT', direction),
        { lookbackHours: 2, includeFutures: true }
      );

      expect(result.complete).toBe(true);
      expect(result.ledger.items).toHaveLength(8);
      expect(
        result.ledger.items.every(
          (item) => item.observation.market === `${asset}/USDT`
        )
      ).toBe(true);
      expect(
        result.ledger.items.some((item) =>
          ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(item.observation.type)
        )
      ).toBe(false);
      expect(
        result.ledger.items.every(
          (item) => item.observation.instrumentType !== 'DERIVED_SPOT_PAIR'
        )
      ).toBe(true);
      expect(() => assertEvidenceLedgerIntegrity(result.ledger)).not.toThrow();
    }
  );

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

  it('rejects a missing required spot instrument before market-data requests', async () => {
    const requestedPaths: string[] = [];
    const delegate = createMockFetch({ missingSpotSymbol: 'SOLUSDT' });
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      requestedPaths.push(`${url.pathname}:${url.searchParams.get('category')}`);
      return delegate(input, init);
    }) as typeof fetch;

    await expect(
      adapter(fetchImpl).gatherMarketObservations(
        researchThesis('SOL', 'BTC', 'RELATIVE_LONG'),
        { lookbackHours: 2, includeFutures: false }
      )
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
    expect(requestedPaths.every((path) => path.startsWith('/api/v3/market/instruments'))).toBe(
      true
    );
  });

  it('reports missing required futures coverage without requesting its ticker', async () => {
    const futuresTickerSymbols: string[] = [];
    const delegate = createMockFetch({ missingFuturesSymbol: 'SOLUSDT' });
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (
        url.pathname === '/api/v3/market/tickers' &&
        url.searchParams.get('category') === 'USDT-FUTURES'
      ) {
        futuresTickerSymbols.push(url.searchParams.get('symbol') ?? '');
      }
      return delegate(input, init);
    }) as typeof fetch;
    const result = await adapter(fetchImpl).gatherMarketObservations(
      researchThesis('SOL', 'ETH', 'RELATIVE_LONG'),
      { lookbackHours: 2, includeFutures: true }
    );

    expect(result.complete).toBe(false);
    expect(result.gaps).toContainEqual(
      expect.objectContaining({
        market: 'SOL/USDT',
        dimension: 'INSTRUMENT_VALIDATION',
        reason: 'INSUFFICIENT_DATA',
      })
    );
    expect(futuresTickerSymbols).toContain('ETHUSDT');
    expect(futuresTickerSymbols).not.toContain('SOLUSDT');
  });

  it('rejects misaligned comparison candles and emits no relative metrics', async () => {
    const result = await adapter(
      createMockFetch({ misalignedCandleSymbol: 'SOLUSDT' })
    ).gatherMarketObservations(
      researchThesis('SOL', 'BTC', 'RELATIVE_SHORT'),
      { lookbackHours: 2, includeFutures: false }
    );

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
      adapter().gatherMarketObservations({ ...thesis, market: 'XRP/USDT', baseAsset: 'XRP', quoteAsset: 'USDT', direction: 'LONG' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
    await expect(
      adapter().gatherMarketObservations({ ...thesis, market: 'ETHBTC' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
    await expect(
      adapter().gatherMarketObservations({ ...thesis, market: 'ETH/ETH', baseAsset: 'ETH', quoteAsset: 'ETH' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MARKET' });
    await expect(
      adapter().gatherMarketObservations({ ...thesis, direction: 'LONG' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
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
