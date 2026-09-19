import { z } from 'zod';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import {
  isEvidenceStale,
  type EvidenceObservationTypeV1,
  type EvidenceV1,
  type MarketInstrumentTypeV1,
} from '@/core/contracts/evidence';
import { DissentError } from '@/core/errors/domain-errors';
import type {
  MarketDeskPort,
  MarketObservationQuery,
  MarketResearchDimension,
  MarketResearchGap,
  MarketResearchGapReason,
  MarketResearchResult,
} from './market-desk.port';
import {
  BitgetCandlesDataSchema,
  BitgetEnvelopeSchema,
  BitgetInstrumentsDataSchema,
  BitgetTickersDataSchema,
  type BitgetCandle,
  type BitgetTicker,
} from './bitget.schemas';
import {
  canonicalDecimal,
  multiplyDecimalByPowerOfTen,
  percentageChange,
  relativeReturnPercent,
  subtractDecimals,
} from './decimal';
import {
  assembleEvidenceLedger,
  createEvidenceId,
  sha256Canonical,
  validateEvidence,
} from './evidence.factory';

const BITGET_BASE_URL = 'https://api.bitget.com';
const HOUR_MS = 60 * 60 * 1000;
const TICKER_FRESHNESS_SECONDS = 60;
const DERIVED_FRESHNESS_SECONDS = 2 * 60 * 60;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SUPPORTED_ASSETS = new Set(['BTC', 'ETH']);

interface ResearchMarket {
  baseAsset: string;
  quoteAsset: 'USDT';
  market: string;
  symbol: string;
}

interface ProviderResult<T> {
  data: T;
  requestTime: number;
  retrievedAt: string;
  locator: string;
}

interface IntervalResult {
  items: EvidenceV1[];
  changeEvidence: EvidenceV1;
}

export interface BitgetAdapterConfig {
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

/**
 * Read-only Bitget V3 market adapter. It never accepts credentials and restricts
 * every request to Bitget's documented public API host.
 */
export class BitgetMarketAdapter implements MarketDeskPort {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: BitgetAdapterConfig = {}) {
    const baseUrl = config.baseUrl ?? BITGET_BASE_URL;
    if (baseUrl !== BITGET_BASE_URL) {
      throw DissentError.invalidInput(
        `Bitget base URL must be the approved host ${BITGET_BASE_URL}`
      );
    }
    if (
      config.timeoutMs !== undefined &&
      (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 30_000)
    ) {
      throw DissentError.invalidInput('Bitget timeoutMs must be an integer from 100 to 30000');
    }

    this.baseUrl = baseUrl;
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async gatherMarketObservations(
    thesis: StructuredThesisV1,
    query: MarketObservationQuery = {}
  ): Promise<MarketResearchResult> {
    const lookbackHours = this.resolveLookbackHours(thesis, query.lookbackHours);
    const includeFutures = query.includeFutures ?? true;
    const markets = this.resolveResearchMarkets(thesis);
    const candlePeriodEndMs = Math.floor(this.now().getTime() / HOUR_MS) * HOUR_MS;

    await Promise.all(markets.map((market) => this.validateSpotInstrument(market)));

    const items: EvidenceV1[] = [];
    const gaps: MarketResearchGap[] = [];
    const intervalResults = new Map<string, IntervalResult>();

    await Promise.all(
      markets.map(async (market) => {
        const tasks: Promise<void>[] = [
          this.captureDimension(
            market,
            'SPOT_TICKER',
            () => this.collectSpotTicker(thesis.id, market),
            (tickerItems) => items.push(...tickerItems),
            gaps
          ),
          this.captureDimension(
            market,
            'SPOT_CANDLES',
            () =>
              this.collectIntervalEvidence(
                thesis.id,
                market,
                lookbackHours,
                candlePeriodEndMs
              ),
            (result) => {
              items.push(...result.items);
              intervalResults.set(market.market, result);
            },
            gaps
          ),
        ];

        if (includeFutures) {
          tasks.push(
            this.captureDimension(
              market,
              'FUTURES_TICKER',
              () => this.collectFuturesTicker(thesis.id, market),
              (futuresItems) => items.push(...futuresItems),
              gaps
            )
          );
        }

        await Promise.all(tasks);
      })
    );

    if (markets.length === 2) {
      const baseMarket = `${thesis.baseAsset.toUpperCase()}/USDT`;
      const quoteMarket = `${thesis.quoteAsset.toUpperCase()}/USDT`;
      const baseResult = intervalResults.get(baseMarket);
      const quoteResult = intervalResults.get(quoteMarket);
      if (baseResult && quoteResult) {
        items.push(
          ...this.createRelativeMetricEvidence(
            thesis,
            lookbackHours,
            baseResult.changeEvidence,
            quoteResult.changeEvidence
          )
        );
      } else {
        gaps.push({
          market: `${thesis.baseAsset.toUpperCase()}/${thesis.quoteAsset.toUpperCase()}`,
          dimension: 'RELATIVE_METRICS',
          reason: 'INSUFFICIENT_DATA',
          message: 'Relative metrics require complete aligned candle evidence for both assets.',
        });
      }
    }

    if (items.length === 0) {
      throw DissentError.evidenceUnavailable(thesis.market, {
        gapCount: gaps.length,
        dimensions: gaps.map((gap) => gap.dimension),
      });
    }

    const assembledAt = this.now().toISOString();
    const ledger = assembleEvidenceLedger(thesis.id, items, assembledAt);
    return { ledger, gaps, complete: gaps.length === 0 };
  }

  private async captureDimension<T>(
    market: ResearchMarket,
    dimension: MarketResearchDimension,
    operation: () => Promise<T>,
    onSuccess: (value: T) => void,
    gaps: MarketResearchGap[]
  ): Promise<void> {
    try {
      onSuccess(await operation());
    } catch (error) {
      gaps.push(this.toGap(market.market, dimension, error));
    }
  }

  private resolveLookbackHours(
    thesis: StructuredThesisV1,
    requested?: number
  ): number {
    const estimated = thesis.timeHorizon.estimatedHours;
    const value =
      requested ??
      (Number.isInteger(estimated) && (estimated ?? 0) >= 1 && (estimated ?? 0) <= 48
        ? estimated
        : 24);
    if (!Number.isInteger(value) || value === undefined || value < 1 || value > 48) {
      throw DissentError.invalidInput('lookbackHours must be a whole number from 1 through 48');
    }
    return value;
  }

  private resolveResearchMarkets(thesis: StructuredThesisV1): ResearchMarket[] {
    const rawMarket = thesis.market.trim().toUpperCase();
    if (!/^[A-Z0-9]+\/[A-Z0-9]+$/.test(rawMarket)) {
      throw DissentError.unsupportedMarket(thesis.market, {
        reason: 'Expected canonical BASE/QUOTE notation',
      });
    }

    const [marketBase, marketQuote] = rawMarket.split('/');
    const baseAsset = thesis.baseAsset.trim().toUpperCase();
    const quoteAsset = thesis.quoteAsset.trim().toUpperCase();
    if (marketBase !== baseAsset || marketQuote !== quoteAsset) {
      throw DissentError.invalidInput(
        'Structured thesis market must match its baseAsset and quoteAsset fields'
      );
    }
    if (!SUPPORTED_ASSETS.has(baseAsset)) {
      throw DissentError.unsupportedMarket(rawMarket, { unsupportedAsset: baseAsset });
    }

    if (quoteAsset === 'USDT') {
      return [this.toUsdtMarket(baseAsset)];
    }
    if (!SUPPORTED_ASSETS.has(quoteAsset) || baseAsset === quoteAsset) {
      throw DissentError.unsupportedMarket(rawMarket, { unsupportedAsset: quoteAsset });
    }

    return [this.toUsdtMarket(baseAsset), this.toUsdtMarket(quoteAsset)];
  }

  private toUsdtMarket(asset: string): ResearchMarket {
    return {
      baseAsset: asset,
      quoteAsset: 'USDT',
      market: `${asset}/USDT`,
      symbol: `${asset}USDT`,
    };
  }

  private async validateSpotInstrument(market: ResearchMarket): Promise<void> {
    const result = await this.request(
      '/api/v3/market/instruments',
      { category: 'SPOT', symbol: market.symbol },
      BitgetInstrumentsDataSchema,
      'validateSpotInstrument'
    );
    const instrument = result.data.find(
      (candidate) =>
        candidate.symbol === market.symbol &&
        candidate.category === 'SPOT' &&
        candidate.baseCoin === market.baseAsset &&
        candidate.quoteCoin === market.quoteAsset
    );
    if (!instrument || instrument.status !== 'online') {
      throw DissentError.unsupportedMarket(market.market, {
        symbol: market.symbol,
        providerStatus: instrument?.status ?? 'missing',
      });
    }
  }

  private async collectSpotTicker(
    thesisId: string,
    market: ResearchMarket
  ): Promise<EvidenceV1[]> {
    const result = await this.request(
      '/api/v3/market/tickers',
      { category: 'SPOT', symbol: market.symbol },
      BitgetTickersDataSchema,
      'collectSpotTicker'
    );
    const ticker = this.selectTicker(result.data, market.symbol, 'SPOT');
    const observedAt = this.sourceTimestampToIso(ticker.ts, result.retrievedAt);
    const price = canonicalDecimal(ticker.lastPrice);
    const changePercent = multiplyDecimalByPowerOfTen(ticker.price24hPcnt, 2);
    const volume = canonicalDecimal(ticker.volume24h);
    const rawSnapshot = this.tickerSnapshot(ticker);

    const evidence = [
      this.createDirectEvidence({
        thesisId,
        market,
        observationType: 'LAST_PRICE',
        instrumentType: 'SPOT',
        claim: `${market.market} spot last price was ${price} ${market.quoteAsset} per ${market.baseAsset}.`,
        category: 'PRICE_ACTION',
        value: price,
        unit: `${market.quoteAsset} per ${market.baseAsset}`,
        observedAt,
        retrievedAt: result.retrievedAt,
        locator: result.locator,
        rawSnapshot,
        freshnessWindowSeconds: TICKER_FRESHNESS_SECONDS,
      }),
      this.createDirectEvidence({
        thesisId,
        market,
        observationType: 'PRICE_CHANGE_24H',
        instrumentType: 'SPOT',
        claim: `${market.market} spot 24-hour price change was ${changePercent}%.`,
        category: 'PRICE_ACTION',
        value: changePercent,
        unit: '%',
        observedAt,
        retrievedAt: result.retrievedAt,
        locator: result.locator,
        rawSnapshot,
        freshnessWindowSeconds: TICKER_FRESHNESS_SECONDS,
      }),
      this.createDirectEvidence({
        thesisId,
        market,
        observationType: 'BASE_VOLUME_24H',
        instrumentType: 'SPOT',
        claim: `${market.market} spot 24-hour base volume was ${volume} ${market.baseAsset}.`,
        category: 'PRICE_ACTION',
        value: volume,
        unit: market.baseAsset,
        observedAt,
        retrievedAt: result.retrievedAt,
        locator: result.locator,
        rawSnapshot,
        freshnessWindowSeconds: TICKER_FRESHNESS_SECONDS,
      }),
    ];

    if (evidence.some((item) => isEvidenceStale(item, result.retrievedAt))) {
      throw DissentError.evidenceStale(`${market.market} spot ticker`, {
        sourceTimestamp: ticker.ts,
      });
    }
    return evidence;
  }

  private async collectFuturesTicker(
    thesisId: string,
    market: ResearchMarket
  ): Promise<EvidenceV1[]> {
    const result = await this.request(
      '/api/v3/market/tickers',
      { category: 'USDT-FUTURES', symbol: market.symbol },
      BitgetTickersDataSchema,
      'collectFuturesTicker'
    );
    const ticker = this.selectTicker(result.data, market.symbol, 'USDT-FUTURES');
    if (ticker.fundingRate === undefined || ticker.openInterest === undefined) {
      throw DissentError.evidenceUnavailable(`${market.market} futures positioning`, {
        missingFundingRate: ticker.fundingRate === undefined,
        missingOpenInterest: ticker.openInterest === undefined,
      });
    }

    const observedAt = this.sourceTimestampToIso(ticker.ts, result.retrievedAt);
    const fundingPercent = multiplyDecimalByPowerOfTen(ticker.fundingRate, 2);
    const openInterest = canonicalDecimal(ticker.openInterest);
    const rawSnapshot = this.tickerSnapshot(ticker);
    const evidence = [
      this.createDirectEvidence({
        thesisId,
        market,
        observationType: 'FUNDING_RATE',
        instrumentType: 'PERPETUAL_FUTURES',
        claim: `${market.market} USDT perpetual current funding rate was ${fundingPercent}%.`,
        category: 'FUNDING_RATE',
        value: fundingPercent,
        unit: '%',
        observedAt,
        retrievedAt: result.retrievedAt,
        locator: result.locator,
        rawSnapshot,
        freshnessWindowSeconds: TICKER_FRESHNESS_SECONDS,
      }),
      this.createDirectEvidence({
        thesisId,
        market,
        observationType: 'OPEN_INTEREST',
        instrumentType: 'PERPETUAL_FUTURES',
        claim: `${market.market} USDT perpetual open interest was ${openInterest} in Bitget's native open-interest units.`,
        category: 'OPEN_INTEREST',
        value: openInterest,
        unit: 'BITGET_NATIVE_OPEN_INTEREST',
        observedAt,
        retrievedAt: result.retrievedAt,
        locator: result.locator,
        rawSnapshot,
        freshnessWindowSeconds: TICKER_FRESHNESS_SECONDS,
        metadata: {
          unitLimitation:
            'The V3 ticker documentation exposes openInterest but does not define its unit.',
        },
      }),
    ];

    if (evidence.some((item) => isEvidenceStale(item, result.retrievedAt))) {
      throw DissentError.evidenceStale(`${market.market} futures ticker`, {
        sourceTimestamp: ticker.ts,
      });
    }
    return evidence;
  }

  private async collectIntervalEvidence(
    thesisId: string,
    market: ResearchMarket,
    lookbackHours: number,
    periodEndMs: number
  ): Promise<IntervalResult> {
    const periodStartMs = periodEndMs - lookbackHours * HOUR_MS;
    const result = await this.request(
      '/api/v3/market/candles',
      {
        category: 'SPOT',
        symbol: market.symbol,
        interval: '1H',
        startTime: String(periodStartMs - 1),
        endTime: String(periodEndMs - 1),
        limit: String(lookbackHours + 1),
      },
      BitgetCandlesDataSchema,
      'collectIntervalEvidence'
    );

    const sorted = [...result.data].sort((left, right) => Number(left[0]) - Number(right[0]));
    const first = sorted.find((candle) => Number(candle[0]) === periodStartMs);
    const last = sorted.find((candle) => Number(candle[0]) === periodEndMs - HOUR_MS);
    if (!first || !last || Number(last[0]) + HOUR_MS > result.requestTime) {
      throw DissentError.evidenceUnavailable(`${market.market} ${lookbackHours}h candles`, {
        reason: 'Insufficient aligned, closed 1H candles',
        receivedCount: sorted.length,
      });
    }

    const periodStartAt = new Date(periodStartMs).toISOString();
    const periodEndAt = new Date(periodEndMs).toISOString();
    const startPrice = canonicalDecimal(first[1]);
    const endPrice = canonicalDecimal(last[4]);
    const changePercent = percentageChange(startPrice, endPrice);
    const startEvidence = this.createCandleEvidence({
      thesisId,
      market,
      candle: first,
      observationType: 'CANDLE_OPEN',
      value: startPrice,
      observedAt: periodStartAt,
      retrievedAt: result.retrievedAt,
      locator: result.locator,
    });
    const endEvidence = this.createCandleEvidence({
      thesisId,
      market,
      candle: last,
      observationType: 'CANDLE_CLOSE',
      value: endPrice,
      observedAt: periodEndAt,
      retrievedAt: result.retrievedAt,
      locator: result.locator,
    });
    const sourceIds = [startEvidence.id, endEvidence.id];
    const changeEvidence = this.createDerivedEvidence({
      thesisId,
      observationType: 'INTERVAL_PRICE_CHANGE',
      market: market.market,
      providerSymbol: market.symbol,
      instrumentType: 'SPOT',
      claim: `${market.market} spot changed ${changePercent}% from the ${periodStartAt} candle open through the ${periodEndAt} candle close.`,
      category: 'PRICE_ACTION',
      value: changePercent,
      unit: '%',
      observedAt: periodEndAt,
      retrievedAt: result.retrievedAt,
      periodStartAt,
      periodEndAt,
      sourceIds,
      locator: 'dissent://derived/interval-price-change-v1',
      rawSnapshot: {
        formula: '((endClose - startOpen) / startOpen) * 100',
        startOpen: startPrice,
        endClose: endPrice,
        sourceEvidenceIds: sourceIds,
      },
    });

    return { items: [startEvidence, endEvidence, changeEvidence], changeEvidence };
  }

  private createRelativeMetricEvidence(
    thesis: StructuredThesisV1,
    lookbackHours: number,
    baseChange: EvidenceV1,
    quoteChange: EvidenceV1
  ): EvidenceV1[] {
    const baseValue = String(baseChange.value);
    const quoteValue = String(quoteChange.value);
    const returnSpread = subtractDecimals(baseValue, quoteValue);
    const relativeReturn = relativeReturnPercent(baseValue, quoteValue);
    const sourceIds = [baseChange.id, quoteChange.id];
    const periodStartAt = baseChange.observation.periodStartAt as string;
    const periodEndAt = baseChange.observation.periodEndAt as string;
    const retrievedAt =
      baseChange.provenance.retrievedAt > quoteChange.provenance.retrievedAt
        ? baseChange.provenance.retrievedAt
        : quoteChange.provenance.retrievedAt;

    const common = {
      thesisId: thesis.id,
      market: `${thesis.baseAsset.toUpperCase()}/${thesis.quoteAsset.toUpperCase()}`,
      providerSymbol: `${thesis.baseAsset.toUpperCase()}USDT:${thesis.quoteAsset.toUpperCase()}USDT`,
      instrumentType: 'DERIVED_SPOT_PAIR' as const,
      category: 'PRICE_ACTION' as const,
      observedAt: periodEndAt,
      retrievedAt,
      periodStartAt,
      periodEndAt,
      sourceIds,
    };

    return [
      this.createDerivedEvidence({
        ...common,
        observationType: 'RETURN_SPREAD',
        claim: `The aligned ${lookbackHours}-hour ${thesis.baseAsset.toUpperCase()}/USDT return minus the ${thesis.quoteAsset.toUpperCase()}/USDT return was ${returnSpread} percentage points.`,
        value: returnSpread,
        unit: 'percentage points',
        locator: 'dissent://derived/return-spread-v1',
        rawSnapshot: {
          formula: 'baseAssetPercentChange - quoteAssetPercentChange',
          baseAssetPercentChange: baseValue,
          quoteAssetPercentChange: quoteValue,
          sourceEvidenceIds: sourceIds,
        },
      }),
      this.createDerivedEvidence({
        ...common,
        observationType: 'RELATIVE_RETURN',
        claim: `The aligned ${lookbackHours}-hour ${thesis.baseAsset.toUpperCase()}/${thesis.quoteAsset.toUpperCase()} relative return was ${relativeReturn}%.`,
        value: relativeReturn,
        unit: '%',
        locator: 'dissent://derived/relative-return-v1',
        rawSnapshot: {
          formula:
            '(((1 + baseAssetPercentChange / 100) / (1 + quoteAssetPercentChange / 100)) - 1) * 100',
          baseAssetPercentChange: baseValue,
          quoteAssetPercentChange: quoteValue,
          sourceEvidenceIds: sourceIds,
        },
      }),
    ];
  }

  private createCandleEvidence(input: {
    thesisId: string;
    market: ResearchMarket;
    candle: BitgetCandle;
    observationType: 'CANDLE_OPEN' | 'CANDLE_CLOSE';
    value: string;
    observedAt: string;
    retrievedAt: string;
    locator: string;
  }): EvidenceV1 {
    const candleStartMs = Number(input.candle[0]);
    const periodStartAt = new Date(candleStartMs).toISOString();
    const periodEndAt = new Date(candleStartMs + HOUR_MS).toISOString();
    const point = input.observationType === 'CANDLE_OPEN' ? 'open' : 'close';
    return this.createDirectEvidence({
      thesisId: input.thesisId,
      market: input.market,
      observationType: input.observationType,
      instrumentType: 'SPOT',
      claim: `${input.market.market} 1H candle ${point} was ${input.value} ${input.market.quoteAsset} per ${input.market.baseAsset} for the interval ${periodStartAt} to ${periodEndAt}.`,
      category: 'PRICE_ACTION',
      value: input.value,
      unit: `${input.market.quoteAsset} per ${input.market.baseAsset}`,
      observedAt: input.observedAt,
      retrievedAt: input.retrievedAt,
      locator: input.locator,
      rawSnapshot: {
        sourceTimestampMs: input.candle[0],
        open: input.candle[1],
        high: input.candle[2],
        low: input.candle[3],
        close: input.candle[4],
        baseVolume: input.candle[5],
        quoteTurnover: input.candle[6],
      },
      interval: '1H',
      periodStartAt,
      periodEndAt,
      freshnessMode: 'HISTORICAL_RECORD',
    });
  }

  private createDirectEvidence(input: {
    thesisId: string;
    market: ResearchMarket;
    observationType: EvidenceObservationTypeV1;
    instrumentType: MarketInstrumentTypeV1;
    claim: string;
    category: EvidenceV1['category'];
    value: string;
    unit: string;
    observedAt: string;
    retrievedAt: string;
    locator: string;
    rawSnapshot: Record<string, unknown>;
    freshnessWindowSeconds?: number;
    freshnessMode?: 'AGE_SINCE_OBSERVATION' | 'HISTORICAL_RECORD';
    interval?: string;
    periodStartAt?: string;
    periodEndAt?: string;
    metadata?: Record<string, unknown>;
  }): EvidenceV1 {
    const observation = {
      type: input.observationType,
      market: input.market.market,
      instrumentType: input.instrumentType,
      providerSymbol: input.market.symbol,
      interval: input.interval,
      periodStartAt: input.periodStartAt,
      periodEndAt: input.periodEndAt,
    };
    const identity = {
      source: 'Bitget V3 Market API',
      endpoint: input.locator.split('?')[0],
      observation,
      observedAt: input.observedAt,
      value: input.value,
      unit: input.unit,
    };
    return validateEvidence({
      id: createEvidenceId(identity),
      thesisId: input.thesisId,
      claim: input.claim,
      category: input.category,
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation,
      provenance: {
        sourceName: 'Bitget V3 Market API',
        sourceType: 'EXCHANGE_API',
        endpointOrLocator: input.locator,
        observedAt: input.observedAt,
        retrievedAt: input.retrievedAt,
        freshnessWindowSeconds: input.freshnessWindowSeconds,
        freshnessMode: input.freshnessMode ?? 'AGE_SINCE_OBSERVATION',
        contentHash: `sha256:${sha256Canonical(input.rawSnapshot)}`,
        rawSnapshot: input.rawSnapshot,
      },
      value: input.value,
      unit: input.unit,
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      metadata: input.metadata,
      schemaVersion: 1,
    });
  }

  private createDerivedEvidence(input: {
    thesisId: string;
    observationType: 'INTERVAL_PRICE_CHANGE' | 'RETURN_SPREAD' | 'RELATIVE_RETURN';
    market: string;
    providerSymbol: string;
    instrumentType: MarketInstrumentTypeV1;
    claim: string;
    category: EvidenceV1['category'];
    value: string;
    unit: string;
    observedAt: string;
    retrievedAt: string;
    periodStartAt: string;
    periodEndAt: string;
    sourceIds: string[];
    locator: string;
    rawSnapshot: Record<string, unknown>;
  }): EvidenceV1 {
    const observation = {
      type: input.observationType,
      market: input.market,
      instrumentType: input.instrumentType,
      providerSymbol: input.providerSymbol,
      interval: '1H',
      periodStartAt: input.periodStartAt,
      periodEndAt: input.periodEndAt,
    } as const;
    const identity = {
      source: 'Dissent Deterministic Analytics',
      observation,
      value: input.value,
      unit: input.unit,
      sourceEvidenceIds: input.sourceIds,
    };
    return validateEvidence({
      id: createEvidenceId(identity),
      thesisId: input.thesisId,
      claim: input.claim,
      category: input.category,
      stance: 'NEUTRAL',
      nature: 'DERIVED',
      observation,
      provenance: {
        sourceName: 'Dissent Deterministic Analytics',
        sourceType: 'DERIVED_ANALYTICS',
        endpointOrLocator: input.locator,
        observedAt: input.observedAt,
        retrievedAt: input.retrievedAt,
        freshnessWindowSeconds: DERIVED_FRESHNESS_SECONDS,
        freshnessMode: 'AGE_SINCE_OBSERVATION',
        contentHash: `sha256:${sha256Canonical(input.rawSnapshot)}`,
        rawSnapshot: input.rawSnapshot,
      },
      value: input.value,
      unit: input.unit,
      derivedFromEvidenceIds: input.sourceIds,
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    });
  }

  private selectTicker(
    tickers: BitgetTicker[],
    symbol: string,
    category: 'SPOT' | 'USDT-FUTURES'
  ): BitgetTicker {
    const ticker = tickers.find(
      (candidate) => candidate.symbol === symbol && candidate.category === category
    );
    if (!ticker) {
      throw DissentError.evidenceUnavailable(`${category} ticker ${symbol}`, {
        reason: 'Expected symbol was missing from provider response',
      });
    }
    return ticker;
  }

  private tickerSnapshot(ticker: BitgetTicker): Record<string, unknown> {
    return {
      category: ticker.category,
      symbol: ticker.symbol,
      ts: ticker.ts,
      lastPrice: ticker.lastPrice,
      openPrice24h: ticker.openPrice24h,
      highPrice24h: ticker.highPrice24h,
      lowPrice24h: ticker.lowPrice24h,
      ask1Price: ticker.ask1Price,
      bid1Price: ticker.bid1Price,
      bid1Size: ticker.bid1Size,
      ask1Size: ticker.ask1Size,
      price24hPcnt: ticker.price24hPcnt,
      turnover24h: ticker.turnover24h,
      volume24h: ticker.volume24h,
      fundingRate: ticker.fundingRate,
      openInterest: ticker.openInterest,
    };
  }

  private sourceTimestampToIso(timestamp: string, retrievedAt: string): string {
    const timestampMs = Number(timestamp);
    if (
      !Number.isSafeInteger(timestampMs) ||
      timestampMs <= 0 ||
      timestampMs > new Date(retrievedAt).getTime() + MAX_FUTURE_SKEW_MS
    ) {
      throw DissentError.externalProviderError('Bitget', 'Invalid source timestamp', {
        kind: 'invalid_response',
      });
    }
    return new Date(timestampMs).toISOString();
  }

  private async request<T>(
    path: string,
    parameters: Record<string, string>,
    dataSchema: z.ZodType<T>,
    operation: string
  ): Promise<ProviderResult<T>> {
    const url = new URL(path, this.baseUrl);
    if (url.origin !== BITGET_BASE_URL) {
      throw DissentError.invalidInput('Refusing request to a non-Bitget host');
    }
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw DissentError.timeout(operation, this.timeoutMs);
      }
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        'Provider Bitget failed: Network request failed',
        {
          cause: error,
          details: { kind: 'network_failure', operation },
          retryable: true,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw DissentError.externalProviderError('Bitget', `HTTP ${response.status}`, {
        kind: 'non_2xx',
        operation,
        statusCode: response.status,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new DissentError(
        'EXTERNAL_PROVIDER_ERROR',
        'Provider Bitget failed: Response was not valid JSON',
        {
          cause: error,
          details: { kind: 'invalid_response', operation },
          retryable: true,
        }
      );
    }

    const envelope = BitgetEnvelopeSchema.safeParse(payload);
    if (!envelope.success) {
      throw DissentError.externalProviderError('Bitget', 'Unexpected response envelope', {
        kind: 'invalid_response',
        operation,
        issueCount: envelope.error.issues.length,
      });
    }
    if (envelope.data.code !== '00000') {
      throw DissentError.externalProviderError('Bitget', 'Provider returned an error', {
        kind: 'provider_error',
        operation,
        providerCode: envelope.data.code,
      });
    }

    const parsedData = dataSchema.safeParse(envelope.data.data);
    if (!parsedData.success) {
      throw DissentError.externalProviderError('Bitget', 'Unexpected response data schema', {
        kind: 'invalid_response',
        operation,
        issueCount: parsedData.error.issues.length,
      });
    }

    return {
      data: parsedData.data,
      requestTime: envelope.data.requestTime,
      retrievedAt: this.now().toISOString(),
      locator: `${url.pathname}?${url.searchParams.toString()}`,
    };
  }

  private toGap(
    market: string,
    dimension: MarketResearchDimension,
    error: unknown
  ): MarketResearchGap {
    let reason: MarketResearchGapReason = 'PROVIDER_ERROR';
    let message = 'The requested market dimension could not be retrieved.';
    if (error instanceof DissentError) {
      message = error.message;
      if (error.code === 'TIMEOUT') reason = 'TIMEOUT';
      else if (error.code === 'EVIDENCE_STALE') reason = 'STALE_DATA';
      else if (error.code === 'UNSUPPORTED_MARKET') reason = 'UNSUPPORTED';
      else if (error.code === 'EVIDENCE_UNAVAILABLE') reason = 'INSUFFICIENT_DATA';
      else if (error.details?.kind === 'network_failure') reason = 'NETWORK_FAILURE';
      else if (error.details?.kind === 'invalid_response') reason = 'INVALID_RESPONSE';
    }
    return { market, dimension, reason, message };
  }
}
