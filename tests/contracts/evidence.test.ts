import { describe, it, expect } from 'vitest';
import {
  EvidenceV1Schema,
  EvidenceLedgerV1Schema,
  deriveEvidenceFreshness,
  isEvidenceStale,
  type EvidenceV1,
  type EvidenceLedgerV1,
} from '@/core/contracts/evidence';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';

describe('Evidence & EvidenceLedger Contracts', () => {
  const now = new Date().toISOString();

  const mockEvidence1: EvidenceV1 = {
    id: 'ev_price_01',
    thesisId: 'th_123',
    claim: 'ETH/BTC 24h trading volume expanded 34% on Bitget spot',
    category: 'PRICE_ACTION',
    stance: 'SUPPORTING',
    nature: 'NUMERIC',
    observation: {
      type: 'BASE_VOLUME_24H',
      market: 'ETH/BTC',
      instrumentType: 'SPOT',
      providerSymbol: 'ETHBTC',
    },
    provenance: {
      sourceName: 'Bitget Spot API',
      sourceType: 'EXCHANGE_API',
      endpointOrLocator: '/api/v2/spot/market/tickers?symbol=ETHBTC',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
      freshnessWindowSeconds: 120,
      contentHash: 'sha256_mock_hash_1',
      rawSnapshot: { volume24h: '12450.32', change24h: '+0.034' },
    },
    value: 34,
    unit: '%',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: ['as_01'],
    verifiable: true,
    schemaVersion: 1,
  };

  const mockEvidence2: EvidenceV1 = {
    id: 'ev_funding_02',
    thesisId: 'th_123',
    claim: 'BTC perpetual funding rate remains elevated at +0.03% vs ETH at +0.008%',
    category: 'FUNDING_RATE',
    stance: 'CONTRADICTING',
    nature: 'NUMERIC',
    observation: {
      type: 'FUNDING_RATE',
      market: 'BTC/USDT',
      instrumentType: 'PERPETUAL_FUTURES',
      providerSymbol: 'BTCUSDT',
    },
    provenance: {
      sourceName: 'Bitget Futures API',
      sourceType: 'EXCHANGE_API',
      endpointOrLocator: '/api/v2/mix/market/current-funding-rate',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    value: '+0.03%',
    unit: 'funding_rate',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: ['as_02'],
    verifiable: true,
    schemaVersion: 1,
  };

  it('validates compliant EvidenceV1 items without static freshness booleans', () => {
    const parsed1 = EvidenceV1Schema.parse(mockEvidence1);
    const parsed2 = EvidenceV1Schema.parse(mockEvidence2);
    expect(parsed1.stance).toBe('SUPPORTING');
    expect(parsed2.stance).toBe('CONTRADICTING');
    expect(parsed1.provenance.sourceType).toBe('EXCHANGE_API');
    expect(parsed1.provenance.freshnessWindowSeconds).toBe(120);
  });

  it('rejects evidence with missing or invalid provenance', () => {
    expect(() =>
      EvidenceV1Schema.parse({
        ...mockEvidence1,
        provenance: {
          ...mockEvidence1.provenance,
          observedAt: 'not-a-valid-date',
        },
      })
    ).toThrow();

    expect(() =>
      EvidenceV1Schema.parse({
        ...mockEvidence1,
        provenance: {
          ...mockEvidence1.provenance,
          sourceName: '',
        },
      })
    ).toThrow();
  });

  it('validates a compliant EvidenceLedgerV1', () => {
    const ledger: EvidenceLedgerV1 = {
      id: 'led_123',
      thesisId: 'th_123',
      items: [mockEvidence1, mockEvidence2],
      summary: {
        totalCount: 2,
        supportingCount: 1,
        contradictingCount: 1,
        neutralCount: 0,
        staleCountAtAssembly: 0,
        categoriesPresent: ['PRICE_ACTION', 'FUNDING_RATE'],
      },
      assembledAt: now,
      schemaVersion: 1,
    };

    const parsed = EvidenceLedgerV1Schema.parse(ledger);
    expect(parsed.items.length).toBe(2);
    expect(() => assertEvidenceLedgerIntegrity(ledger)).not.toThrow();
  });

  it('detects duplicate IDs and summary discrepancies in ledger', () => {
    const invalidLedger: EvidenceLedgerV1 = {
      id: 'led_123',
      thesisId: 'th_123',
      items: [mockEvidence1, mockEvidence1], // duplicate item
      summary: {
        totalCount: 2,
        supportingCount: 2,
        contradictingCount: 0,
        neutralCount: 0,
        staleCountAtAssembly: 0,
        categoriesPresent: ['PRICE_ACTION'],
      },
      assembledAt: now,
      schemaVersion: 1,
    };

    expect(() => assertEvidenceLedgerIntegrity(invalidLedger)).toThrow(DissentError);
  });

  it('deterministically derives freshness relative to an evaluation timestamp', () => {
    const baseTime = new Date('2026-09-18T12:00:00.000Z');

    const sampleEvidence: EvidenceV1 = {
      id: 'ev_sample',
      thesisId: 'th_123',
      claim: 'Sample ticker price observation',
      category: 'PRICE_ACTION',
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation: {
        type: 'LAST_PRICE',
        market: 'BTC/USDT',
        instrumentType: 'SPOT',
        providerSymbol: 'BTCUSDT',
      },
      provenance: {
        sourceName: 'Bitget Spot',
        sourceType: 'EXCHANGE_API',
        endpointOrLocator: '/api/v2/spot/market/ticker',
        observedAt: baseTime.toISOString(),
        retrievedAt: baseTime.toISOString(),
        freshnessMode: 'AGE_SINCE_OBSERVATION',
      },
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    };

    // 10 seconds later: REALTIME, not stale
    const at10s = new Date(baseTime.getTime() + 10 * 1000);
    expect(deriveEvidenceFreshness(sampleEvidence, at10s).level).toBe('REALTIME');
    expect(isEvidenceStale(sampleEvidence, at10s)).toBe(false);

    // 10 minutes later: RECENT, not stale
    const at10m = new Date(baseTime.getTime() + 600 * 1000);
    expect(deriveEvidenceFreshness(sampleEvidence, at10m).level).toBe('RECENT');
    expect(isEvidenceStale(sampleEvidence, at10m)).toBe(false);

    // 2 hours later: DELAYED, not stale
    const at2h = new Date(baseTime.getTime() + 7200 * 1000);
    expect(deriveEvidenceFreshness(sampleEvidence, at2h).level).toBe('HISTORICAL');
    expect(isEvidenceStale(sampleEvidence, at2h)).toBe(false);

    // 2 days later: STALE
    const at2d = new Date(baseTime.getTime() + 172800 * 1000);
    expect(deriveEvidenceFreshness(sampleEvidence, at2d).level).toBe('STALE');
    expect(isEvidenceStale(sampleEvidence, at2d)).toBe(true);
  });

  it('respects explicit validUntil timestamps for stale evaluation', () => {
    const baseTime = new Date('2026-09-18T12:00:00.000Z');
    const expiryTime = new Date('2026-09-18T12:05:00.000Z'); // 5 minutes validity

    const expiringEvidence: EvidenceV1 = {
      id: 'ev_expiring',
      thesisId: 'th_123',
      claim: 'Funding rate cycle valid until next settlement',
      category: 'FUNDING_RATE',
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation: {
        type: 'FUNDING_RATE',
        market: 'BTC/USDT',
        instrumentType: 'PERPETUAL_FUTURES',
        providerSymbol: 'BTCUSDT',
      },
      provenance: {
        sourceName: 'Bitget Futures',
        sourceType: 'EXCHANGE_API',
        endpointOrLocator: '/api/v2/mix/market/current-funding-rate',
        observedAt: baseTime.toISOString(),
        retrievedAt: baseTime.toISOString(),
        freshnessMode: 'AGE_SINCE_OBSERVATION',
        validUntil: expiryTime.toISOString(),
      },
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    };

    // 2 minutes after observation: before validUntil, not stale
    const beforeExpiry = new Date('2026-09-18T12:02:00.000Z');
    expect(isEvidenceStale(expiringEvidence, beforeExpiry)).toBe(false);

    // 6 minutes after observation: after validUntil, STALE
    const afterExpiry = new Date('2026-09-18T12:06:00.000Z');
    expect(deriveEvidenceFreshness(expiringEvidence, afterExpiry).level).toBe('STALE');
    expect(isEvidenceStale(expiringEvidence, afterExpiry)).toBe(true);
  });

  it('keeps closed historical records historical without declaring them stale', () => {
    const historical = EvidenceV1Schema.parse({
      ...mockEvidence1,
      observation: {
        type: 'CANDLE_CLOSE',
        market: 'ETH/BTC',
        instrumentType: 'SPOT',
        providerSymbol: 'ETHBTC',
        interval: '1H',
        periodStartAt: '2020-01-01T00:00:00.000Z',
        periodEndAt: '2020-01-01T01:00:00.000Z',
      },
      provenance: {
        ...mockEvidence1.provenance,
        observedAt: '2020-01-01T01:00:00.000Z',
        retrievedAt: '2026-09-19T12:00:00.000Z',
        freshnessMode: 'HISTORICAL_RECORD',
        freshnessWindowSeconds: undefined,
      },
    });

    expect(deriveEvidenceFreshness(historical, '2026-09-19T12:00:00.000Z')).toMatchObject({
      level: 'HISTORICAL',
      isStale: false,
    });
  });

  it('rejects missing derived lineage and incorrect ledger summaries', () => {
    const derivedWithoutSources: EvidenceV1 = {
      ...mockEvidence1,
      id: 'ev_derived_missing',
      nature: 'DERIVED',
      observation: {
        type: 'RELATIVE_RETURN',
        market: 'ETH/BTC',
        instrumentType: 'DERIVED_SPOT_PAIR',
        providerSymbol: 'ETHUSDT:BTCUSDT',
      },
      derivedFromEvidenceIds: [],
    };
    const ledger: EvidenceLedgerV1 = {
      id: 'led_bad_lineage',
      thesisId: 'th_123',
      items: [derivedWithoutSources],
      summary: {
        totalCount: 1,
        supportingCount: 1,
        contradictingCount: 0,
        neutralCount: 0,
        staleCountAtAssembly: 0,
        categoriesPresent: ['PRICE_ACTION'],
      },
      assembledAt: now,
      schemaVersion: 1,
    };

    expect(() => assertEvidenceLedgerIntegrity(ledger)).toThrow(DissentError);
    expect(() =>
      assertEvidenceLedgerIntegrity({
        ...ledger,
        items: [mockEvidence1],
        summary: { ...ledger.summary, supportingCount: 0, neutralCount: 1 },
      })
    ).toThrow(DissentError);
  });
});
