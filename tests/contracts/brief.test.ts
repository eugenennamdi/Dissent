import { describe, it, expect } from 'vitest';
import { DissentBriefV1Schema, type DissentBriefV1 } from '@/core/contracts/brief';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { assertBriefInvariants } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';

describe('DissentBriefV1 Contracts & Invariants', () => {
  const now = new Date().toISOString();

  const mockEvidence: EvidenceV1 = {
    id: 'ev_01',
    thesisId: 'th_123',
    claim: 'Bitget BTC open interest increased by $350M in 6 hours',
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
      sourceName: 'Bitget Futures',
      sourceType: 'EXCHANGE_API',
      endpointOrLocator: '/api/v2/mix/market/open-interest',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1,
  };

  const mockLedger: EvidenceLedgerV1 = {
    id: 'led_123',
    thesisId: 'th_123',
    items: [mockEvidence],
    summary: {
      totalCount: 1,
      supportingCount: 0,
      contradictingCount: 1,
      neutralCount: 0,
      staleCountAtAssembly: 0,
      categoriesPresent: ['OPEN_INTEREST'],
    },
    assembledAt: now,
    schemaVersion: 1,
  };

  const mockValidBrief: DissentBriefV1 = {
    id: 'brf_001',
    runId: 'run_001',
    createdAt: now,
    originalThesis: 'ETH will outperform BTC over the next 48h',
    structuredThesis: {
      id: 'th_123',
      thesisInputId: 'inp_123',
      originalThesis: 'ETH will outperform BTC over the next 48h',
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      claim: 'ETH will outperform BTC',
      direction: 'RELATIVE_LONG',
      timeHorizon: { description: '48h', estimatedHours: 48 },
      catalysts: ['momentum expansion'],
      createdAt: now,
      schemaVersion: 1,
    },
    supportingEvidence: [],
    theDissent: {
      id: 'arg_dissent_01',
      thesisId: 'th_123',
      stance: 'DISSENTER',
      summary: 'BTC dominance and open interest expansion threaten ETH relative performance.',
      points: [
        {
          id: 'pt_01',
          title: 'BTC Open Interest Spike',
          reasoning: 'Aggressive capital influx into BTC futures creates liquidation risk for alts.',
          evidenceIds: ['ev_01'],
          targetAssumptionIds: [],
          weight: 'PRIMARY',
        },
      ],
      risksOrCounterweightsConsidered: ['ETH L2 volume remains resilient'],
      createdAt: now,
      schemaVersion: 1,
    },
    assumptions: [
      {
        id: 'as_01',
        thesisId: 'th_123',
        claim: 'BTC volatility remains muted allowing ETH to capture alpha',
        type: 'INFERRED',
        category: 'MARKET_REGIME',
        status: 'QUESTIONED',
        challenge: 'BTC sudden directional breakout',
        invalidationCondition: 'BTC 1H volatility > 4.5%',
        supportingEvidenceIds: [],
        opposingEvidenceIds: ['ev_01'],
        createdAt: now,
        schemaVersion: 1,
      },
    ],
    contradictions: [
      {
        id: 'cnt_01',
        targetType: 'ASSUMPTION',
        targetId: 'as_01',
        statement: 'BTC volatility muted assumption clashes with $350M OI surge',
        contradictingEvidenceId: 'ev_01',
        explanation: 'Rapid OI expansion precedes sharp volatility expansions.',
        severity: 'CRITICAL',
      },
    ],
    stressScenarios: [
      {
        id: 'sc_01',
        thesisId: 'th_123',
        name: 'BTC Flash Squeeze / Dominance Surge',
        description: 'Aggressive short squeeze in BTC drains liquidity from ETH pairs.',
        affectedAssumptionIds: ['as_01'],
        relevantEvidenceIds: ['ev_01'],
        transmissionMechanism: 'Cross-margin rebalancing shifts collateral from ETH into BTC.',
        scenarioType: 'LIQUIDITY_SHOCK',
        plausibility: 'HIGH',
        consequenceForThesis: 'ETH/BTC ratio collapses despite USD price appreciation.',
        uncertainties: ['The duration of any relative move remains unknown.'],
        schemaVersion: 1,
      },
    ],
    invalidationConditions: [
      {
        type: 'QUANTITATIVE',
        id: 'inv_01',
        thesisId: 'th_123',
        targetAssumptionIds: ['as_01'],
        relevantEvidenceIds: ['ev_01'],
        statement: 'ETH/BTC closes below 0.0318 on 4H candle',
        targetMetric: 'ETH/BTC 4H close',
        triggerThreshold: '< 0.0318',
        timeframe: '48 hours',
        observableDataSource: 'Bitget ETHBTC spot ticker',
        urgency: 'IMMEDIATE_EXIT',
        schemaVersion: 1,
      },
      {
        type: 'QUALITATIVE',
        id: 'inv_02',
        thesisId: 'th_123',
        targetAssumptionIds: ['as_01'],
        relevantEvidenceIds: ['ev_01'],
        statement: 'Scheduled catalyst upgrade is delayed by core developers',
        observableEvent: 'Core developer consensus call announces upgrade delay',
        verificationSource: 'Official developer broadcast or client release notes',
        expectedWindow: 'Within trade horizon',
        urgency: 'THESIS_REVIEW',
        schemaVersion: 1,
      },
    ],
    unknowns: ['Institutional OTC flow ratio ahead of upcoming options expiry'],
    evidenceLedger: mockLedger,
    humanDecision: null, // Initial synthesis must have null humanDecision
    disclaimer:
      'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.',
    schemaVersion: 1,
  };

  it('validates a complete, compliant DissentBriefV1', () => {
    const parsed = DissentBriefV1Schema.parse(mockValidBrief);
    expect(parsed.humanDecision).toBeNull();
    expect(parsed.theDissent.stance).toBe('DISSENTER');
    expect(parsed.invalidationConditions.length).toBe(2);
    expect(parsed.invalidationConditions[0]?.type).toBe('QUANTITATIVE');
    expect(parsed.invalidationConditions[1]?.type).toBe('QUALITATIVE');
    expect(() => assertBriefInvariants(parsed)).not.toThrow();
  });

  it('rejects brief if theDissent has stance ADVOCATE', () => {
    const invalidBrief = {
      ...mockValidBrief,
      theDissent: {
        ...mockValidBrief.theDissent,
        stance: 'ADVOCATE',
      },
    };

    expect(() => DissentBriefV1Schema.parse(invalidBrief)).toThrow();
  });

  it('rejects brief when an argument references an evidence ID missing from the ledger', () => {
    const ungroundedBrief = {
      ...mockValidBrief,
      theDissent: {
        ...mockValidBrief.theDissent,
        points: [
          {
            id: 'pt_ungrounded',
            title: 'Fabricated Point',
            reasoning: 'Claiming something without evidence in ledger',
            evidenceIds: ['ev_hallucinated_999'],
            targetAssumptionIds: [],
            weight: 'PRIMARY' as const,
          },
        ],
      },
    };

    expect(() => assertBriefInvariants(ungroundedBrief)).toThrow(DissentError);
  });

  it('rejects a human decision attached to a different run or thesis', () => {
    const mismatchedDecision = {
      ...mockValidBrief,
      humanDecision: {
        id: 'dec_wrong',
        runId: 'run_wrong',
        thesisId: 'th_wrong',
        decision: 'WATCH' as const,
        attribution: {
          actorType: 'HUMAN_OPERATOR' as const,
          operatorId: 'human_1',
        },
        decidedAt: now,
        schemaVersion: 1 as const,
      },
    };

    expect(() => assertBriefInvariants(mismatchedDecision)).toThrow(DissentError);
  });
});
