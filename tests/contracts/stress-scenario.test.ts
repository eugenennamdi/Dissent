import { describe, it, expect } from 'vitest';
import {
  StressScenarioV1Schema,
  InvalidationConditionV1Schema,
  ScenarioTypeV1Schema,
  type StressScenarioV1,
  type InvalidationConditionV1,
} from '@/core/contracts/stress-scenario';

describe('StressScenarioV1 & InvalidationConditionV1 Contracts', () => {
  const now = new Date().toISOString();

  it('supports domain-general scenario classifications', () => {
    const validTypes = [
      'MACRO_REGIME_CHANGE',
      'LIQUIDITY_SHOCK',
      'POSITIONING_REVERSAL',
      'LIQUIDATION_CASCADE',
      'VOLATILITY_EXPANSION',
      'CORRELATION_BREAKDOWN',
      'ASSET_SPECIFIC_EVENT',
      'MARKET_STRUCTURE_DETERIORATION',
      'OTHER',
    ];

    for (const t of validTypes) {
      expect(ScenarioTypeV1Schema.parse(t)).toBe(t);
    }
  });

  it('validates a domain-general StressScenarioV1', () => {
    const scenario: StressScenarioV1 = {
      id: 'sc_macro_01',
      thesisId: 'th_123',
      name: 'Hawkish Fed Rate Path Shift',
      description: 'Yield curves bear-flatten as inflation expectations rise, compressing high-beta multiples.',
      affectedAssumptionIds: ['as_01'],
      transmissionMechanism: 'USD strength drains liquidity from dollar-denominated speculative crypto pairs.',
      scenarioType: 'MACRO_REGIME_CHANGE',
      plausibility: 'MEDIUM',
      consequenceForThesis: 'Capital rotates defensively out of alts into BTC and cash.',
      schemaVersion: 1,
    };

    const parsed = StressScenarioV1Schema.parse(scenario);
    expect(parsed.scenarioType).toBe('MACRO_REGIME_CHANGE');
    expect(parsed.plausibility).toBe('MEDIUM');
  });

  it('validates quantitative invalidation condition with numeric threshold and metric', () => {
    const quantCond: InvalidationConditionV1 = {
      type: 'QUANTITATIVE',
      id: 'inv_q1',
      thesisId: 'th_123',
      statement: 'ETH/BTC 4H close drops below 0.0315',
      targetMetric: 'ETH/BTC 4H close',
      triggerThreshold: '< 0.0315',
      timeframe: '48 hours',
      observableDataSource: 'Bitget ETHBTC spot ticker',
      urgency: 'IMMEDIATE_EXIT',
      schemaVersion: 1,
    };

    const parsed = InvalidationConditionV1Schema.parse(quantCond);
    expect(parsed.type).toBe('QUANTITATIVE');
    if (parsed.type === 'QUANTITATIVE') {
      expect(parsed.targetMetric).toBe('ETH/BTC 4H close');
      expect(parsed.triggerThreshold).toBe('< 0.0315');
    }
  });

  it('validates qualitative / event-based invalidation condition with verifiable source', () => {
    const qualCond: InvalidationConditionV1 = {
      type: 'QUALITATIVE',
      id: 'inv_ql1',
      thesisId: 'th_123',
      statement: 'Key protocol governance proposal fails quorum',
      observableEvent: 'On-chain snapshot vote closes below 60% quorum threshold',
      verificationSource: 'Tally / Snapshot proposal governance portal',
      expectedWindow: 'Before Sunday 23:59 UTC',
      urgency: 'THESIS_REVIEW',
      schemaVersion: 1,
    };

    const parsed = InvalidationConditionV1Schema.parse(qualCond);
    expect(parsed.type).toBe('QUALITATIVE');
    if (parsed.type === 'QUALITATIVE') {
      expect(parsed.observableEvent).toContain('quorum');
      expect(parsed.verificationSource).toContain('Snapshot');
    }
  });

  it('rejects invalidation conditions missing discriminated union type or observable fields', () => {
    // Missing type discriminator
    const missingType = {
      id: 'inv_bad',
      thesisId: 'th_123',
      statement: 'Some vague condition',
      urgency: 'IMMEDIATE_EXIT',
      schemaVersion: 1,
    };
    expect(() => InvalidationConditionV1Schema.parse(missingType)).toThrow();

    // Qualitative missing verificationSource
    const missingSource = {
      type: 'QUALITATIVE',
      id: 'inv_bad2',
      thesisId: 'th_123',
      statement: 'Protocol delay',
      observableEvent: 'Upgrade delayed',
      // verificationSource omitted
      urgency: 'IMMEDIATE_EXIT',
      schemaVersion: 1,
    };
    expect(() => InvalidationConditionV1Schema.parse(missingSource)).toThrow();
  });
});
