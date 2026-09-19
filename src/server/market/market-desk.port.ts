import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import type { EvidenceLedgerV1 } from '@/core/contracts/evidence';

export interface MarketObservationQuery {
  /** Whole-hour spot candle lookback. V1 supports 1 through 48 hours. */
  lookbackHours?: number;
  /** Funding and open-interest snapshots are optional research dimensions. */
  includeFutures?: boolean;
}

export type MarketResearchDimension =
  | 'INSTRUMENT_VALIDATION'
  | 'SPOT_TICKER'
  | 'SPOT_CANDLES'
  | 'FUTURES_TICKER'
  | 'RELATIVE_METRICS';

export type MarketResearchGapReason =
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'INSUFFICIENT_DATA'
  | 'STALE_DATA'
  | 'UNSUPPORTED';

export interface MarketResearchGap {
  market: string;
  dimension: MarketResearchDimension;
  reason: MarketResearchGapReason;
  message: string;
}

export interface MarketResearchResult {
  ledger: EvidenceLedgerV1;
  gaps: MarketResearchGap[];
  /** False whenever a requested research dimension could not be collected. */
  complete: boolean;
}

/**
 * MarketDeskPort
 * Inbound port for market observation retrieval.
 * Partial results are explicit: valid evidence is retained in the ledger while
 * unavailable dimensions are reported in `gaps`.
 */
export interface MarketDeskPort {
  /**
   * Gathers factual observations relevant to the structured thesis.
   */
  gatherMarketObservations(
    thesis: StructuredThesisV1,
    query?: MarketObservationQuery
  ): Promise<MarketResearchResult>;
}
