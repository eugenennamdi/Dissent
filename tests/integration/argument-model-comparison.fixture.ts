import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import {
  FIXED_AT,
  makeAssumptions,
  makeEvidenceLedger,
  makeStructuredThesis,
} from '../server/ai/fixtures';

const HISTORICAL_START = '2026-09-19T10:00:00.000Z';
const HISTORICAL_END = '2026-09-19T11:00:00.000Z';

function deterministicSource(locator: string): EvidenceV1['provenance'] {
  return {
    sourceName: 'Dissent deterministic historical comparison fixture',
    sourceType: 'PRIMARY_DOCUMENT',
    endpointOrLocator: `fixture://argument-model-comparison/${locator}`,
    observedAt: HISTORICAL_END,
    retrievedAt: FIXED_AT,
    freshnessMode: 'HISTORICAL_RECORD',
  };
}

function derivedSource(locator: string): EvidenceV1['provenance'] {
  return {
    sourceName: 'Dissent deterministic comparison analytics',
    sourceType: 'DERIVED_ANALYTICS',
    endpointOrLocator: `fixture://argument-model-comparison/${locator}`,
    observedAt: HISTORICAL_END,
    retrievedAt: FIXED_AT,
    freshnessMode: 'HISTORICAL_RECORD',
  };
}

export function makeArgumentModelComparisonFixture() {
  const thesis = makeStructuredThesis();
  const assumptions = makeAssumptions();
  const baseEthReturn = makeEvidenceLedger().items.find(
    (item) => item.id === 'ev_return'
  );
  if (!baseEthReturn) throw new Error('Comparison fixture requires ev_return.');

  const items: EvidenceV1[] = [
    {
      ...baseEthReturn,
      claim: 'ETH/USDT spot changed 5% over the fixed historical interval.',
      provenance: deterministicSource('eth-interval-return'),
    },
    {
      id: 'ev_btc_return',
      thesisId: thesis.id,
      claim: 'BTC/USDT spot changed 2% over the fixed historical interval.',
      category: 'PRICE_ACTION',
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation: {
        type: 'INTERVAL_PRICE_CHANGE',
        market: 'BTC/USDT',
        instrumentType: 'SPOT',
        providerSymbol: 'BTCUSDT',
        interval: '1H',
        periodStartAt: HISTORICAL_START,
        periodEndAt: HISTORICAL_END,
      },
      provenance: deterministicSource('btc-interval-return'),
      value: '2',
      unit: '%',
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    },
    {
      id: 'ev_return_spread',
      thesisId: thesis.id,
      claim:
        'The aligned historical ETH/USDT return minus the BTC/USDT return was 3 percentage points.',
      category: 'CORRELATION',
      stance: 'NEUTRAL',
      nature: 'DERIVED',
      observation: {
        type: 'RETURN_SPREAD',
        market: 'ETH/BTC',
        instrumentType: 'DERIVED_SPOT_PAIR',
        providerSymbol: 'ETHUSDT:BTCUSDT',
        interval: '1H',
        periodStartAt: HISTORICAL_START,
        periodEndAt: HISTORICAL_END,
      },
      provenance: derivedSource('return-spread'),
      value: '3',
      unit: 'percentage points',
      derivedFromEvidenceIds: ['ev_return', 'ev_btc_return'],
      relatedAssumptionIds: ['asm_1'],
      verifiable: true,
      schemaVersion: 1,
    },
    {
      id: 'ev_relative_return',
      thesisId: thesis.id,
      claim: 'The aligned historical ETH/BTC relative return was 2.94117647%.',
      category: 'CORRELATION',
      stance: 'NEUTRAL',
      nature: 'DERIVED',
      observation: {
        type: 'RELATIVE_RETURN',
        market: 'ETH/BTC',
        instrumentType: 'DERIVED_SPOT_PAIR',
        providerSymbol: 'ETHUSDT:BTCUSDT',
        interval: '1H',
        periodStartAt: HISTORICAL_START,
        periodEndAt: HISTORICAL_END,
      },
      provenance: derivedSource('relative-return'),
      value: '2.94117647',
      unit: '%',
      derivedFromEvidenceIds: ['ev_return', 'ev_btc_return'],
      relatedAssumptionIds: ['asm_1'],
      verifiable: true,
      schemaVersion: 1,
    },
    ...(['ETH', 'BTC'] as const).flatMap((asset): EvidenceV1[] => {
      const lowerAsset = asset.toLowerCase();
      const fundingValue = asset === 'ETH' ? '0.01' : '-0.005';
      const openInterestValue = asset === 'ETH' ? '1234.5678' : '2345.6789';
      return [
        {
          id: `ev_${lowerAsset}_funding`,
          thesisId: thesis.id,
          claim: `${asset}/USDT perpetual funding rate was ${fundingValue}% in the fixed historical fixture.`,
          category: 'FUNDING_RATE',
          stance: 'NEUTRAL',
          nature: 'NUMERIC',
          observation: {
            type: 'FUNDING_RATE',
            market: `${asset}/USDT`,
            instrumentType: 'PERPETUAL_FUTURES',
            providerSymbol: `${asset}USDT`,
          },
          provenance: deterministicSource(`${lowerAsset}-funding`),
          value: fundingValue,
          unit: '%',
          derivedFromEvidenceIds: [],
          relatedAssumptionIds: [],
          verifiable: true,
          schemaVersion: 1,
        },
        {
          id: `ev_${lowerAsset}_open_interest`,
          thesisId: thesis.id,
          claim: `${asset}/USDT perpetual open interest was ${openInterestValue} in fixture-native units.`,
          category: 'OPEN_INTEREST',
          stance: 'NEUTRAL',
          nature: 'NUMERIC',
          observation: {
            type: 'OPEN_INTEREST',
            market: `${asset}/USDT`,
            instrumentType: 'PERPETUAL_FUTURES',
            providerSymbol: `${asset}USDT`,
          },
          provenance: deterministicSource(`${lowerAsset}-open-interest`),
          value: openInterestValue,
          unit: 'FIXTURE_NATIVE_OPEN_INTEREST',
          derivedFromEvidenceIds: [],
          relatedAssumptionIds: [],
          verifiable: true,
          metadata: {
            unitLimitation:
              'The deterministic fixture unit is intentionally non-economic and must not be interpreted as contracts, coins, or notional value.',
          },
          schemaVersion: 1,
        },
      ];
    }),
  ];

  const ledger: EvidenceLedgerV1 = {
    id: 'led_argument_model_comparison',
    thesisId: thesis.id,
    items,
    summary: {
      totalCount: items.length,
      supportingCount: 0,
      contradictingCount: 0,
      neutralCount: items.length,
      staleCountAtAssembly: 0,
      categoriesPresent: [
        ...new Set(items.map((item) => item.category)),
      ],
    },
    assembledAt: FIXED_AT,
    schemaVersion: 1,
  };

  return { thesis, assumptions, ledger };
}
