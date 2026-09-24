import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { isEquityThesisMarket } from '@/core/domain/supported-markets';
import type {
  MarketDeskPort,
  MarketObservationQuery,
  MarketResearchResult,
} from './market-desk.port';
import { BitgetMarketAdapter } from './bitget.adapter';
import { BitgetEquityAdapter } from './bitget-equity.adapter';

export interface CompositeMarketAdapterOptions {
  cryptoAdapter?: MarketDeskPort;
  equityAdapter?: MarketDeskPort;
}

/**
 * CompositeMarketAdapter
 *
 * Routes thesis market observations to the appropriate market desk:
 * - Native US-Equity single-asset research (NVDA/USD) -> BitgetEquityAdapter (MCP)
 * - Crypto relative and single-asset research (BTC, ETH, SOL) -> BitgetMarketAdapter (Spot/Futures API)
 */
export class CompositeMarketAdapter implements MarketDeskPort {
  private readonly cryptoAdapter: MarketDeskPort;
  private readonly equityAdapter: MarketDeskPort;

  constructor(options: CompositeMarketAdapterOptions = {}) {
    this.cryptoAdapter = options.cryptoAdapter ?? new BitgetMarketAdapter();
    this.equityAdapter = options.equityAdapter ?? new BitgetEquityAdapter();
  }

  async gatherMarketObservations(
    thesis: StructuredThesisV1,
    query?: MarketObservationQuery
  ): Promise<MarketResearchResult> {
    if (isEquityThesisMarket(thesis.market)) {
      return this.equityAdapter.gatherMarketObservations(thesis, query);
    }
    return this.cryptoAdapter.gatherMarketObservations(thesis, query);
  }
}
