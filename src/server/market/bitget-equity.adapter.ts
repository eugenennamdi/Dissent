import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import type {
  EvidenceObservationTypeV1,
  EvidenceV1,
} from '@/core/contracts/evidence';
import { DissentError } from '@/core/errors/domain-errors';
import {
  isEquityThesisMarket,
  resolveSupportedThesisMarket,
} from '@/core/domain/supported-markets';
import type {
  MarketDeskPort,
  MarketObservationQuery,
  MarketResearchDimension,
  MarketResearchGap,
  MarketResearchGapReason,
  MarketResearchResult,
} from './market-desk.port';
import {
  BitgetEquityFundamentalRatioRecordSchema,
  BitgetEquityQuoteRecordSchema,
  type BitgetEquityFundamentalRatioRecord,
  type BitgetEquityQuoteRecord,
} from './bitget-mcp.schemas';
import { BitgetMcpClient } from './bitget-mcp.client';
import {
  assembleEvidenceLedger,
  createEvidenceId,
  sha256Canonical,
  validateEvidence,
} from './evidence.factory';

export interface BitgetEquityAdapterConfig {
  client?: BitgetMcpClient;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

/**
 * Read-only Bitget Equity MCP adapter.
 * Uses Bitget's verified MCP JSON-RPC service (https://agent.bitget.com/mcp)
 * to gather native US-equity price quotes and fundamental valuation ratios.
 *
 * Adheres strictly to Dissent invariants:
 * - Quote observations have unknown observation time (observedAt: null).
 * - Valuation records preserve source-reported period-ending dates and timestamps without claiming independent verification of SEC filing dates.
 * - Missing optional valuation fields are treated as non-fatal coverage gaps.
 * - No trade execution, account operations, or price prediction tools are installed.
 */
export class BitgetEquityAdapter implements MarketDeskPort {
  private readonly client: BitgetMcpClient;
  private readonly now: () => Date;

  constructor(config: BitgetEquityAdapterConfig = {}) {
    this.client =
      config.client ??
      new BitgetMcpClient({
        timeoutMs: config.timeoutMs,
        fetch: config.fetch,
      });
    this.now = config.now ?? (() => new Date());
  }

  async gatherMarketObservations(
    thesis: StructuredThesisV1,
    _query: MarketObservationQuery = {}
  ): Promise<MarketResearchResult> {
    const market = thesis.market;
    if (!isEquityThesisMarket(market)) {
      throw DissentError.unsupportedMarket(market, {
        reason: 'Bitget equity desk currently supports native NVDA/USD equity research only',
      });
    }

    if (thesis.direction !== 'LONG' && thesis.direction !== 'SHORT') {
      throw DissentError.invalidInput(
        `Equity thesis direction must be LONG or SHORT, received ${thesis.direction}`
      );
    }

    const definition = resolveSupportedThesisMarket(thesis);
    if (!definition || definition.baseAsset !== 'NVDA') {
      throw DissentError.unsupportedMarket(market, {
        reason: 'Bitget equity desk currently supports native NVDA/USD equity research only',
      });
    }

    const gaps: MarketResearchGap[] = [];
    const items: EvidenceV1[] = [];
    const symbol = definition.baseAsset; // NVDA

    // Query 1: equity_price_quote
    try {
      const quoteItems = await this.collectEquityQuote(thesis.id, market, symbol);
      items.push(...quoteItems);
    } catch (error: unknown) {
      gaps.push(this.toGap(market, 'EQUITY_QUOTE', error));
    }

    // Query 2: equity_fundamental_ratios
    try {
      const valuationItems = await this.collectEquityValuation(thesis.id, market, symbol);
      items.push(...valuationItems);
    } catch (error: unknown) {
      gaps.push(this.toGap(market, 'EQUITY_VALUATION', error));
    }

    const assembledAt = this.now().toISOString();
    const ledger = assembleEvidenceLedger(thesis.id, items, assembledAt);

    // Complete if all requested dimensions succeeded and minimum required evidence is present
    const complete =
      gaps.length === 0 &&
      items.some((i) => i.observation.type === 'LAST_PRICE') &&
      items.some((i) => i.observation.type === 'SESSION_PRICE_CHANGE');

    return {
      ledger,
      gaps,
      complete,
    };
  }

  private async collectEquityQuote(
    thesisId: string,
    market: string,
    symbol: string
  ): Promise<EvidenceV1[]> {
    const queryResult = await this.client.executeQuery<unknown[]>('equity_price_quote', {
      symbol,
    });

    if (!Array.isArray(queryResult.results) || queryResult.results.length === 0) {
      throw DissentError.evidenceUnavailable(`equity_price_quote ${symbol}`, {
        reason: 'Provider returned empty quote results array',
      });
    }

    let parsedQuote: BitgetEquityQuoteRecord;
    try {
      parsedQuote = BitgetEquityQuoteRecordSchema.parse(queryResult.results[0]);
    } catch (err: unknown) {
      throw DissentError.externalProviderError(
        'Bitget MCP',
        `Malformed equity quote record for ${symbol}`,
        {
          kind: 'invalid_response',
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }

    const locator = `https://agent.bitget.com/mcp?entry_id=equity_price_quote&symbol=${symbol}`;
    const retrievedAt = queryResult.retrievedAt;
    const rawSnapshot = parsedQuote as unknown as Record<string, unknown>;

    const items: EvidenceV1[] = [];

    // 1. LAST_PRICE
    items.push(
      this.createEquityEvidence({
        thesisId,
        market,
        symbol,
        observationType: 'LAST_PRICE',
        claim: `${symbol} session price is ${parsedQuote.last_price} USD`,
        category: 'PRICE_ACTION',
        value: parsedQuote.last_price,
        unit: 'USD',
        observedAt: null,
        retrievedAt,
        freshnessMode: 'UNKNOWN_OBSERVATION_TIME',
        locator,
        rawSnapshot,
      })
    );

    // 2. SESSION_PRICE_CHANGE
    // change_percent is a fractional ratio (e.g. -0.0093925) -> convert to percentage points (-0.93925%)
    const pctChange = Number((parsedQuote.change_percent * 100).toFixed(5));
    items.push(
      this.createEquityEvidence({
        thesisId,
        market,
        symbol,
        observationType: 'SESSION_PRICE_CHANGE',
        claim: `${symbol} session price change relative to source-reported prev_close (${parsedQuote.prev_close} USD) is ${pctChange}%`,
        category: 'PRICE_ACTION',
        value: pctChange,
        unit: 'PERCENT',
        observedAt: null,
        retrievedAt,
        freshnessMode: 'UNKNOWN_OBSERVATION_TIME',
        locator,
        rawSnapshot,
        metadata: {
          formula: '((last_price - prev_close) / prev_close) * 100',
          prevCloseUsd: parsedQuote.prev_close,
          sourceReportedChange: parsedQuote.change,
          sourceReportedChangePercent: parsedQuote.change_percent,
        },
      })
    );

    // 3. SESSION_VOLUME (optional field from quote)
    if (parsedQuote.volume !== undefined && parsedQuote.volume > 0) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'SESSION_VOLUME',
          claim: `${symbol} session trading volume is ${parsedQuote.volume} shares`,
          category: 'PRICE_ACTION',
          value: parsedQuote.volume,
          unit: 'SHARES',
          observedAt: null,
          retrievedAt,
          freshnessMode: 'UNKNOWN_OBSERVATION_TIME',
          locator,
          rawSnapshot,
        })
      );
    }

    // 4. MARKET_CAPITALIZATION (optional scale metric from quote)
    if (parsedQuote.total_market_cap !== undefined && parsedQuote.total_market_cap > 0) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'MARKET_CAPITALIZATION',
          claim: `${symbol} reported total market capitalization is ${parsedQuote.total_market_cap} USD`,
          category: 'VALUATION_METRIC',
          value: parsedQuote.total_market_cap,
          unit: 'USD',
          observedAt: null,
          retrievedAt,
          freshnessMode: 'UNKNOWN_OBSERVATION_TIME',
          locator,
          rawSnapshot,
        })
      );
    }

    return items;
  }

  private async collectEquityValuation(
    thesisId: string,
    market: string,
    symbol: string
  ): Promise<EvidenceV1[]> {
    const queryResult = await this.client.executeQuery<unknown[]>(
      'equity_fundamental_ratios',
      { symbol }
    );

    if (!Array.isArray(queryResult.results) || queryResult.results.length === 0) {
      throw DissentError.evidenceUnavailable(`equity_fundamental_ratios ${symbol}`, {
        reason: 'Provider returned empty fundamental ratios array',
      });
    }

    let parsedRecord: BitgetEquityFundamentalRatioRecord;
    try {
      parsedRecord = BitgetEquityFundamentalRatioRecordSchema.parse(queryResult.results[0]);
    } catch (err: unknown) {
      throw DissentError.externalProviderError(
        'Bitget MCP',
        `Malformed fundamental ratio record for ${symbol}`,
        {
          kind: 'invalid_response',
          error: err instanceof Error ? err.message : String(err),
        }
      );
    }

    const locator = `https://agent.bitget.com/mcp?entry_id=equity_fundamental_ratios&symbol=${symbol}`;
    const retrievedAt = queryResult.retrievedAt;
    const rawSnapshot = parsedRecord as unknown as Record<string, unknown>;
    const observedAt = new Date(parsedRecord.time).toISOString();
    const reportingPeriod = parsedRecord.period_ending;

    const items: EvidenceV1[] = [];

    // VALUATION_PE_TTM (Trailing Twelve Months operating P/E)
    if (typeof parsedRecord.pe_ttm_ed === 'number' && Number.isFinite(parsedRecord.pe_ttm_ed)) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PE_TTM',
          claim: `${symbol} trailing twelve-month P/E ratio is ${parsedRecord.pe_ttm_ed}x for period ending ${reportingPeriod}`,
          category: 'VALUATION_METRIC',
          value: parsedRecord.pe_ttm_ed,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PE_LYR (Last Year Reported P/E)
    if (typeof parsedRecord.pe_lyr === 'number' && Number.isFinite(parsedRecord.pe_lyr)) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PE_LYR',
          claim: `${symbol} last year reported P/E ratio is ${parsedRecord.pe_lyr}x for period ending ${reportingPeriod}`,
          category: 'VALUATION_METRIC',
          value: parsedRecord.pe_lyr,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PB_RATIO (Price-to-Book, prefer MRQ)
    const pbValue =
      typeof parsedRecord.pb_mrq === 'number' && Number.isFinite(parsedRecord.pb_mrq)
        ? parsedRecord.pb_mrq
        : typeof parsedRecord.pb === 'number' && Number.isFinite(parsedRecord.pb)
          ? parsedRecord.pb
          : undefined;

    if (pbValue !== undefined) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PB_RATIO',
          claim: `${symbol} price-to-book ratio is ${pbValue}x for period ending ${reportingPeriod}`,
          category: 'VALUATION_METRIC',
          value: pbValue,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_EV_EBITDA (Enterprise multiple)
    if (typeof parsedRecord.ent_multi === 'number' && Number.isFinite(parsedRecord.ent_multi)) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_EV_EBITDA',
          claim: `${symbol} enterprise multiple (EV/EBITDA) is ${parsedRecord.ent_multi}x for period ending ${reportingPeriod}`,
          category: 'VALUATION_METRIC',
          value: parsedRecord.ent_multi,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    // VALUATION_PS_TTM (Price-to-Sales TTM)
    if (typeof parsedRecord.ps_ttm_ed === 'number' && Number.isFinite(parsedRecord.ps_ttm_ed)) {
      items.push(
        this.createEquityEvidence({
          thesisId,
          market,
          symbol,
          observationType: 'VALUATION_PS_TTM',
          claim: `${symbol} trailing twelve-month price-to-sales ratio is ${parsedRecord.ps_ttm_ed}x for period ending ${reportingPeriod}`,
          category: 'VALUATION_METRIC',
          value: parsedRecord.ps_ttm_ed,
          unit: 'RATIO',
          observedAt,
          retrievedAt,
          freshnessMode: 'HISTORICAL_RECORD',
          locator,
          rawSnapshot,
          reportingPeriod,
        })
      );
    }

    if (items.length === 0) {
      throw DissentError.evidenceUnavailable(`equity_fundamental_ratios ${symbol}`, {
        reason: 'Fundamental record contained no valid recognizable valuation multiples',
      });
    }

    return items;
  }

  private createEquityEvidence(input: {
    thesisId: string;
    market: string;
    symbol: string;
    observationType: EvidenceObservationTypeV1;
    claim: string;
    category: EvidenceV1['category'];
    value: number;
    unit: string;
    observedAt: string | null;
    retrievedAt: string;
    freshnessMode: 'UNKNOWN_OBSERVATION_TIME' | 'HISTORICAL_RECORD';
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
      source: 'bitget-mcp-server',
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
        sourceName: 'bitget-mcp-server',
        sourceType: input.observedAt ? 'PRIMARY_DOCUMENT' : 'EXCHANGE_API',
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
    } else if (error instanceof Error) {
      message = error.message;
    }
    return { market, dimension, reason, message };
  }
}
