import { describe, expect, it } from 'vitest';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { EvidenceLedgerV1Schema } from '@/core/contracts/evidence';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';

const runLive = process.env.RUN_BITGET_LIVE === '1';

describe.skipIf(!runLive)('Bitget live public-market integration', () => {
  it('validates and normalizes real BTC/USDT and ETH/USDT data', async () => {
    const now = new Date();
    const thesis: StructuredThesisV1 = {
      id: `th_live_${now.getTime()}`,
      thesisInputId: 'inp_live_bitget',
      originalThesis:
        'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.',
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      claim: 'ETH will outperform BTC over the next 48 hours',
      direction: 'RELATIVE_LONG',
      timeHorizon: { description: '48 hours', estimatedHours: 48 },
      catalysts: ['risk appetite', 'ETH momentum'],
      createdAt: now.toISOString(),
      schemaVersion: 1,
    };

    const result = await new BitgetMarketAdapter().gatherMarketObservations(thesis, {
      lookbackHours: 48,
      includeFutures: true,
    });
    const ledger = EvidenceLedgerV1Schema.parse(result.ledger);
    expect(ledger.items.length).toBeGreaterThan(0);
    expect(ledger.items.some((item) => item.observation.market === 'BTC/USDT')).toBe(true);
    expect(ledger.items.some((item) => item.observation.market === 'ETH/USDT')).toBe(true);
    expect(() => assertEvidenceLedgerIntegrity(ledger)).not.toThrow();

    const proof = ledger.items
      .filter((item) =>
        ['LAST_PRICE', 'INTERVAL_PRICE_CHANGE', 'RETURN_SPREAD', 'RELATIVE_RETURN'].includes(
          item.observation.type
        )
      )
      .map((item) => ({
        market: item.observation.market,
        observationType: item.observation.type,
        value: item.value,
        unit: item.unit,
        source: item.provenance.sourceName,
        observedAt: item.provenance.observedAt,
        retrievedAt: item.provenance.retrievedAt,
        evidenceId: item.id,
      }));
    console.log('BITGET_LIVE_PROOF', JSON.stringify({ complete: result.complete, gaps: result.gaps, proof }, null, 2));
  }, 30_000);
});
