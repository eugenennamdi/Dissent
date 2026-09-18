import type { MarketDeskPort, MarketObservationQuery } from './market-desk.port';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import { DissentError } from '@/core/errors/domain-errors';

export interface BitgetAdapterConfig {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  baseUrl?: string;
}

/**
 * BitgetMarketAdapter
 *
 * Outbound adapter for Bitget exchange market data.
 * Translates Bitget ticker, orderbook, funding, and contract data into normalized EvidenceV1.
 *
 * TODO for Codex / GPT-5.6 Sol High (Tomorrow):
 * 1. Implement Bitget V2 REST API client:
 *    - /api/v2/mix/market/ticker (Futures pricing, volume, 24h change)
 *    - /api/v2/mix/market/current-funding-rate (Perpetual funding rate & bias)
 *    - /api/v2/mix/market/open-interest (Open interest trends)
 *    - /api/v2/spot/market/orderbook (Bid/ask imbalance & liquidity depth)
 * 2. Handle symbol mapping (e.g. "ETH/BTC" -> spot symbol "ETHBTC", "SOL/USDT" -> "SOLUSDT")
 * 3. Construct deterministic EvidenceV1 objects with:
 *    - sourceName: "Bitget Market API"
 *    - sourceType: "EXCHANGE_API"
 *    - endpointOrLocator: exact endpoint called
 *    - observedAt: timestamp from exchange payload
 *    - retrievedAt: local ingestion timestamp
 *    - rawSnapshot: key response values for auditability
 * 4. Handle rate limits and connection retries using DissentError.externalProviderError
 */
export class BitgetMarketAdapter implements MarketDeskPort {
  private readonly config: BitgetAdapterConfig;

  constructor(config: BitgetAdapterConfig = {}) {
    this.config = {
      baseUrl: process.env.BITGET_API_BASE_URL || 'https://api.bitget.com',
      apiKey: config.apiKey || process.env.BITGET_API_KEY,
      secretKey: config.secretKey || process.env.BITGET_SECRET_KEY,
      passphrase: config.passphrase || process.env.BITGET_PASSPHRASE,
      ...config,
    };
  }

  async gatherMarketObservations(
    thesis: StructuredThesisV1,
    query?: Partial<MarketObservationQuery>
  ): Promise<EvidenceV1[]> {
    // Intentionally deferred to tomorrow's implementation phase.
    // Core domain boundaries and contracts are established tonight.
    throw DissentError.evidenceUnavailable(
      `Bitget adapter is not yet implemented. Structured thesis ready for market: ${thesis.market}`,
      {
        market: thesis.market,
        query,
        todo: 'Implement Bitget REST/WS client in Phase 1 tomorrow',
      }
    );
  }
}
