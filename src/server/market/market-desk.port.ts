import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import type { EvidenceV1, EvidenceCategoryV1 } from '@/core/contracts/evidence';

export interface MarketObservationQuery {
  market: string;
  baseAsset: string;
  quoteAsset: string;
  lookbackHours?: number;
  categories?: EvidenceCategoryV1[];
}

/**
 * MarketDeskPort
 * Inbound port for market observation retrieval.
 * The core domain relies on this contract; it has zero knowledge of Bitget
 * or any specific exchange SDK.
 */
export interface MarketDeskPort {
  /**
   * Gathers verifiable market observations (orderbook depth, funding, price momentum, open interest)
   * relevant to the given structured trade thesis.
   */
  gatherMarketObservations(
    thesis: StructuredThesisV1,
    query?: Partial<MarketObservationQuery>
  ): Promise<EvidenceV1[]>;
}
