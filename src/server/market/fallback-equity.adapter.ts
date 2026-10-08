import type {
  EvidenceObservationTypeV1,
  EvidenceV1,
} from '@/core/contracts/evidence';
import { DissentError } from '@/core/errors/domain-errors';
import {
  BitgetRestReferenceClient,
  type BitgetRestValuationData,
} from './bitget-rest-reference.client';
import {
  EulerpoolQuoteClient,
  type EulerpoolQuoteData,
} from './eulerpool-quote.client';
import {
  createEvidenceId,
  sha256Canonical,
  validateEvidence,
} from './evidence.factory';

export interface FallbackEquityAdapterConfig {
  eulerpoolClient?: EulerpoolQuoteClient;
  bitgetRestClient?: BitgetRestReferenceClient;
  fetch?: typeof fetch;
  now?: () => Date;
  eulerpoolApiKey?: string;
}

/**
 * FallbackEquityAdapter
 *
 * Activated strictly and conservatively when Bitget MCP returns an upstream
 * tool-level 503 outage.
 *
 * Uses:
 * 1. Eulerpool Equity API for native US-equity price quotes (price, change, volume, source timestamp).
 *    Always marked as DELAYED freshness tier.
 * 2. Bitget Reality Reference API for underlying stock valuation indicators
 *    (market cap, P/E LYR/TTM, P/B, P/S, EV/EBITDA).
 *
 * Invariants strictly enforced:
 * - Never uses Reality/rToken trading-pair prices as native equity quotes.
 * - Never labels fallback evidence as 'bitget-mcp-server'.
 * - Provenance sources are truthful: 'Eulerpool Equity API' and 'Bitget Reality Reference API'.
 * - Preserves retrievedAt separately from observedAt.
 * - Does not overstate generic peRatio as TTM.
 */
export class FallbackEquityAdapter {
  private readonly eulerpoolClient: EulerpoolQuoteClient;
  private readonly bitgetRestClient: BitgetRestReferenceClient;

  constructor(config: FallbackEquityAdapterConfig = {}) {
    this.eulerpoolClient =
      config.eulerpoolClient ??
      new EulerpoolQuoteClient({
        apiKey: config.eulerpoolApiKey,
        fetch: config.fetch,
        now: config.now,
      });

    this.bitgetRestClient =
      config.bitgetRestClient ??
      new BitgetRestReferenceClient({
        fetch: config.fetch,
        now: config.now,
      });
  }

  async collectFallbackQuote(
    thesisId: string,
    market: string,
    symbol: string
  ): Promise<EvidenceV1[]> {
    const quoteData: EulerpoolQuoteData =
      await this.eulerpoolClient.getLastQuote(symbol);

    const locator = `https://api.eulerpool.com/api/1/market/last-quote/${symbol}`;
    const observedAt = quoteData.observedAt;
    const retrievedAt = quoteData.retrievedAt;
    const rawSnapshot = quoteData.rawSnapshot;

    const items: EvidenceV1[] = [];

    // 1. LAST_PRICE
    const currency = quoteData.currency ?? 'USD';
    items.push(
      this.createFallbackEvidence({
        thesisId,
        market,
        symbol,
        observationType: 'LAST_PRICE',
        claim: `${symbol} delayed session price is ${quoteData.price} ${currency} (Eulerpool feed)`,
        category: 'PRICE_ACTION',
        value: quoteData.price,
        unit: currency,
        observedAt,
        retrievedAt,
        freshnessMode: 'AGE_SINCE_OBSERVATION',
        sourceName: 'Eulerpool Equity API',
        sourceType: 'EXCHANGE_API',
        locator,
        rawSnapshot,
        metadata: {
          feedTier: 'DELAYED',
          delayNotice: 'Delayed equity quote feed',
          ...(quoteData.bid !== undefined ? { bid: quoteData.bid } : {}),
          ...(quoteData.ask !== undefined ? { ask: quoteData.ask } : {}),
          ...(quoteData.exchange ? { exchange: quoteData.exchange } : {}),
        },
      })
    );

    // 2. SESSION_PRICE_CHANGE (from price-change 1D window, or quoteData if ever present)
    let sessionChangeVal: number | undefined;
    let changeObservedAt: string = observedAt;
    let changeRetrievedAt: string = retrievedAt;
    let changeSnapshot: Record<string, unknown> = rawSnapshot;
    let changeLocator: string = locator;

    if (quoteData.changePercent !== undefined) {
      sessionChangeVal = quoteData.changePercent;
    } else {
      // Query verified Eulerpool price-change endpoint for 1D window
      try {
        const pcData = await this.eulerpoolClient.getPriceChange(symbol);
        if (pcData.oneDayChange !== undefined) {
          sessionChangeVal = pcData.oneDayChange;
          changeObservedAt = pcData.observedAt;
          changeRetrievedAt = pcData.retrievedAt;
          changeSnapshot = pcData.rawSnapshot;
          changeLocator = `https://api.eulerpool.com/api/1/equity/price-change/${symbol}`;
        }
      } catch {
        // If price-change fails or 1D is missing, sessionChangeVal remains undefined.
        // Fallback completeness preserves fail-closed behavior.
      }
    }

    if (sessionChangeVal !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'SESSION_PRICE_CHANGE',
          claim: `${symbol} delayed 1D session price change is ${sessionChangeVal}%`,
          category: 'PRICE_ACTION',
          value: sessionChangeVal,
          unit: 'PERCENT',
          observedAt: changeObservedAt,
          retrievedAt: changeRetrievedAt,
          freshnessMode: 'AGE_SINCE_OBSERVATION',
          sourceName: 'Eulerpool Equity API',
          sourceType: 'EXCHANGE_API',
          locator: changeLocator,
          rawSnapshot: changeSnapshot,
          metadata: {
            feedTier: 'DELAYED',
            delayNotice: 'Delayed equity quote feed',
            providerField: '1D',
            horizon: '1D',
          },
        })
      );
    }

    // 3. SESSION_VOLUME (optional)
    if (quoteData.volume !== undefined && quoteData.volume > 0) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'SESSION_VOLUME',
          claim: `${symbol} delayed session trading volume is ${quoteData.volume} shares`,
          category: 'PRICE_ACTION',
          value: quoteData.volume,
          unit: 'SHARES',
          observedAt,
          retrievedAt,
          freshnessMode: 'AGE_SINCE_OBSERVATION',
          sourceName: 'Eulerpool Equity API',
          sourceType: 'EXCHANGE_API',
          locator,
          rawSnapshot,
          metadata: {
            feedTier: 'DELAYED',
          },
        })
      );
    }

    return items;
  }

  async collectFallbackValuation(
    thesisId: string,
    market: string,
    symbol: string
  ): Promise<EvidenceV1[]> {
    const valData: BitgetRestValuationData =
      await this.bitgetRestClient.getEquityValuationData(symbol);

    const locator = `https://api.bitget.com/api/v3/reality/market/valuation-indicators?code=${symbol}`;
    const observedAt = valData.observedAt;
    const retrievedAt = valData.retrievedAt;
    const rawSnapshot = valData.rawSnapshot;
    const reportingPeriod = valData.reportingPeriod;

    const items: EvidenceV1[] = [];

    // VALUATION_PE_TTM
    if (valData.peTtm !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PE_TTM',
          claim: `${symbol} trailing twelve-month P/E ratio is ${valData.peTtm}x for period ending ${reportingPeriod ?? 'latest'}`,
          category: 'VALUATION_METRIC',
          value: valData.peTtm,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PE_LYR
    if (valData.peLyr !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PE_LYR',
          claim: `${symbol} last year reported P/E ratio is ${valData.peLyr}x for period ending ${reportingPeriod ?? 'latest'}`,
          category: 'VALUATION_METRIC',
          value: valData.peLyr,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PB_RATIO
    if (valData.pbRatio !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PB_RATIO',
          claim: `${symbol} price-to-book ratio is ${valData.pbRatio}x for period ending ${reportingPeriod ?? 'latest'}`,
          category: 'VALUATION_METRIC',
          value: valData.pbRatio,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_EV_EBITDA
    if (valData.evEbitda !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_EV_EBITDA',
          claim: `${symbol} enterprise multiple (EV/EBITDA) is ${valData.evEbitda}x for period ending ${reportingPeriod ?? 'latest'}`,
          category: 'VALUATION_METRIC',
          value: valData.evEbitda,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PS_TTM
    if (valData.psTtm !== undefined) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PS_TTM',
          claim: `${symbol} trailing twelve-month price-to-sales ratio is ${valData.psTtm}x for period ending ${reportingPeriod ?? 'latest'}`,
          category: 'VALUATION_METRIC',
          value: valData.psTtm,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // MARKET_CAPITALIZATION (from valuation indicator tmvUsd)
    if (valData.marketCap !== undefined && valData.marketCap > 0) {
      items.push(
        this.createFallbackEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'MARKET_CAPITALIZATION',
          claim: `${symbol} reported total market capitalization is ${valData.marketCap} USD`,
          category: 'VALUATION_METRIC',
          value: valData.marketCap,
          unit: 'USD',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          sourceName: 'Bitget Reality Reference API',
          sourceType: 'PRIMARY_DOCUMENT',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    if (items.length === 0) {
      throw DissentError.evidenceUnavailable(
        `Bitget Reality Reference API ${symbol}`,
        {
          reason:
            'Fundamental reference record contained no valid recognizable valuation multiples',
        }
      );
    }

    return items;
  }

  private createFallbackEvidence(input: {
    thesisId: string;
    market: string;
    symbol: string;
    observationType: EvidenceObservationTypeV1;
    claim: string;
    category: EvidenceV1['category'];
    value: number;
    unit: string;
    observedAt: string;
    retrievedAt: string;
    freshnessMode: 'AGE_SINCE_OBSERVATION' | 'HISTORICAL_RECORD';
    sourceName: string;
    sourceType: EvidenceV1['provenance']['sourceType'];
    locator: string;
    rawSnapshot: Record<string, unknown>;
    reportingPeriod?: string;
    metadata?: Record<string, unknown>;
  }): EvidenceV1 {
    const observation = {
      type: input.observationType,
      market: input.market,
      instrumentType: 'EQUITY_CASH' as const,
      providerSymbol: input.symbol,
      reportingPeriod: input.reportingPeriod,
    };

    const identity = {
      source: input.sourceName,
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
        sourceName: input.sourceName,
        sourceType: input.sourceType,
        endpointOrLocator: input.locator,
        observedAt: input.observedAt,
        retrievedAt: input.retrievedAt,
        freshnessMode: input.freshnessMode,
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
}
