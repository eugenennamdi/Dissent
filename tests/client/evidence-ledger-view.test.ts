import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { EvidenceLedgerView } from '@/components/EvidenceLedgerView';
import type { EvidenceV1, EvidenceLedgerV1 } from '@/core/contracts/evidence';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

describe('EvidenceLedgerView Component', () => {
  const now = '2026-09-23T16:18:55.000Z';

  const longIdItem: EvidenceV1 = {
    id: 'ev_a671b1718c86b606f8cd0e6a985f5dc7d585c825650d343516f0e5326fdd04c1',
    thesisId: 'th_eth_btc',
    claim: 'ETH/USDT spot changed 3.70102311% from the candle open through candle close.',
    category: 'PRICE_ACTION',
    stance: 'SUPPORTING',
    nature: 'DERIVED',
    observation: {
      type: 'INTERVAL_PRICE_CHANGE',
      market: 'ETH/USDT',
      instrumentType: 'SPOT',
      providerSymbol: 'ETHUSDT',
    },
    provenance: {
      sourceName: 'Dissent Deterministic Analytics',
      sourceType: 'DERIVED_ANALYTICS',
      endpointOrLocator: 'dissent://derived/interval-change',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    value: 3.70102311,
    unit: '%',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1,
  };

  const openInterestItem: EvidenceV1 = {
    id: 'ev_e36581d898a9ab366e582aa9805b1e71ef61edfe484e5b9ce4be96db2cfccf75',
    thesisId: 'th_eth_btc',
    claim: 'BTC/USDT perpetual open interest was 34431.245399999923 in native units.',
    category: 'OPEN_INTEREST',
    stance: 'CONTRADICTING',
    nature: 'NUMERIC',
    observation: {
      type: 'OPEN_INTEREST',
      market: 'BTC/USDT',
      instrumentType: 'PERPETUAL_FUTURES',
      providerSymbol: 'BTCUSDT',
    },
    provenance: {
      sourceName: 'Bitget V3 Market API',
      sourceType: 'EXCHANGE_API',
      endpointOrLocator: '/api/v2/mix/market/open-interest',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    value: 34431.245399999923,
    unit: 'BITGET_NATIVE_OPEN_INTEREST',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1,
  };

  const returnSpreadItem: EvidenceV1 = {
    id: 'ev_3ffd3c824ba833e8b9394b0dda22a6e074204c170c95b199a37edcde157cdc21',
    thesisId: 'th_eth_btc',
    claim: 'The aligned 48-hour ETH/USDT return minus BTC/USDT return was -1.52478892 percentage points.',
    category: 'CORRELATION',
    stance: 'CONTRADICTING',
    nature: 'DERIVED',
    observation: {
      type: 'RETURN_SPREAD',
      market: 'ETH/BTC',
      instrumentType: 'DERIVED_SPOT_PAIR',
      providerSymbol: 'ETHBTC',
    },
    provenance: {
      sourceName: 'Dissent Deterministic Analytics',
      sourceType: 'DERIVED_ANALYTICS',
      endpointOrLocator: 'dissent://derived/return-spread',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    value: -1.52478892,
    unit: 'percentage points',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1,
  };

  const testLedger: EvidenceLedgerV1 = {
    id: 'led_test',
    thesisId: 'th_eth_btc',
    items: [longIdItem, openInterestItem, returnSpreadItem],
    summary: {
      totalCount: 3,
      supportingCount: 1,
      contradictingCount: 2,
      neutralCount: 0,
      staleCountAtAssembly: 0,
      categoriesPresent: ['PRICE_ACTION', 'OPEN_INTEREST', 'CORRELATION'],
    },
    assembledAt: now,
    schemaVersion: 1,
  };

  it('renders clean source and stance badges without overflowing IDs', () => {
    const html = cleanHtml(
      renderToString(
        React.createElement(EvidenceLedgerView, {
          ledger: testLedger,
          onSelectEvidence: () => {},
        })
      )
    );

    // Header summary metrics
    expect(html).toContain('Full Verifiable Evidence Ledger');
    expect(html).toContain('3');
    expect(html).toContain('Total');
    expect(html).toContain('Bitget');
    expect(html).toContain('Desk Analytics');

    // Truncated IDs prevent text collision & overflow
    expect(html).toContain('#ev_a671b1…04c1');
    expect(html).toContain('#ev_e36581…cf75');
    expect(html).toContain('#ev_3ffd3c…dc21');
    expect(html).not.toContain('ev_a671b1718c86b606f8cd0e6a985f5dc7d585c825650d343516f0e5326fdd04c1<');

    // Clean formatted values and units
    expect(html).toContain('+3.70%');
    expect(html).toContain('34,431 Contracts');
    expect(html).toContain('-1.52 pp');

    // Raw unformatted strings are eliminated
    expect(html).not.toContain('34431.245399999923');
    expect(html).not.toContain('BITGET_NATIVE_OPEN_INTEREST');
    expect(html).not.toContain('-1.52478892');

    // Stance badges
    expect(html).toContain('Supporting');
    expect(html).toContain('Contradicting');
  });
});
