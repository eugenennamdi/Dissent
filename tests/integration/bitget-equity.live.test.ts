import { describe, expect, it } from 'vitest';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { BitgetEquityAdapter } from '@/server/market/bitget-equity.adapter';

const runLive = process.env.RUN_EQUITY_LIVE === '1' || process.env.RUN_NVDA_LIVE === '1';

describe.skipIf(!runLive)('Bitget Live Equity MCP Integration Checkpoint', () => {
  it('performs ONE controlled live data checkpoint for NVDA/USD', async () => {
    const now = new Date();
    const thesis: StructuredThesisV1 = {
      id: `th_nvda_live_${now.getTime()}`,
      thesisInputId: 'inp_nvda_live',
      originalThesis:
        'NVDA will maintain its pricing power and operating margin in the data-center compute segment across the current cycle.',
      market: 'NVDA/USD',
      baseAsset: 'NVDA',
      quoteAsset: 'USD',
      claim: 'NVDA will maintain pricing power and operating margins',
      direction: 'LONG',
      timeHorizon: { description: '6 months', estimatedHours: 4320 },
      catalysts: ['compute demand', 'datacenter expansion'],
      createdAt: now.toISOString(),
      schemaVersion: 1,
    };

    const adapter = new BitgetEquityAdapter();
    const result = await adapter.gatherMarketObservations(thesis);

    expect(result.ledger).toBeDefined();
    expect(result.ledger.items.length).toBeGreaterThanOrEqual(2);
    expect(() => assertEvidenceLedgerIntegrity(result.ledger)).not.toThrow();

    // Verify quote evidence properties
    const lastPrice = result.ledger.items.find((i) => i.observation.type === 'LAST_PRICE');
    expect(lastPrice).toBeDefined();
    expect(lastPrice?.provenance.observedAt).toBeNull();
    expect(lastPrice?.provenance.freshnessMode).toBe('UNKNOWN_OBSERVATION_TIME');

    const sessionChange = result.ledger.items.find(
      (i) => i.observation.type === 'SESSION_PRICE_CHANGE'
    );
    expect(sessionChange).toBeDefined();
    expect(sessionChange?.provenance.observedAt).toBeNull();
    expect(sessionChange?.provenance.freshnessMode).toBe('UNKNOWN_OBSERVATION_TIME');

    // Report compact sanitized summary
    const summary = {
      market: thesis.market,
      totalEvidenceCount: result.ledger.items.length,
      categoriesPresent: result.ledger.summary.categoriesPresent,
      observationTypes: result.ledger.items.map((i) => i.observation.type),
      complete: result.complete,
      gaps: result.gaps,
      quoteObservationTime: lastPrice?.provenance.observedAt,
      sampleItems: result.ledger.items.map((i) => ({
        type: i.observation.type,
        claim: i.claim,
        value: i.value,
        unit: i.unit,
        observedAt: i.provenance.observedAt,
        freshnessMode: i.provenance.freshnessMode,
      })),
    };

    console.log('NVDA_EQUITY_LIVE_CHECKPOINT', JSON.stringify(summary, null, 2));
  }, 30_000);
});
