import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AssumptionDistribution } from '@/components/AssumptionDistribution';
import { StressScenarioCausalFlow } from '@/components/StressScenarioCausalFlow';
import { ThesisReviewConditions } from '@/components/ThesisReviewConditions';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { formatEvidenceCitation } from '@/lib/formatters/market-formatters';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { StressScenarioV1, InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceV1, EvidenceLedgerV1 } from '@/core/contracts/evidence';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

describe('Research Visualizations & Data Transformations', () => {
  const now = '2026-09-22T06:00:00.000Z';

  const testEvidence: EvidenceV1 = {
    id: 'ev_vis_01',
    thesisId: 'th_vis_test',
    claim: 'Bitget SOL/USDT 24h volume reached 850M USD',
    category: 'PRICE_ACTION',
    stance: 'SUPPORTING',
    nature: 'NUMERIC',
    observation: {
      type: 'BASE_VOLUME_24H',
      market: 'SOL/USDT',
      instrumentType: 'SPOT',
      providerSymbol: 'SOLUSDT',
    },
    provenance: {
      sourceName: 'Bitget Public Spot API',
      sourceType: 'EXCHANGE_API',
      endpointOrLocator: '/api/v2/spot/market/tickers',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION',
    },
    value: 850000000,
    unit: 'USD',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: ['asm_vis_1'],
    verifiable: true,
    schemaVersion: 1,
  };

  const testLedger: EvidenceLedgerV1 = {
    id: 'led_vis_test',
    thesisId: 'th_vis_test',
    items: [testEvidence],
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

  const testAssumptions: AssumptionV1[] = [
    {
      id: 'asm_vis_1',
      thesisId: 'th_vis_test',
      type: 'EXPLICIT',
      category: 'MARKET_REGIME',
      claim: 'Spot volume accumulation reflects organic institutional demand.',
      status: 'SUPPORTED',
      supportingEvidenceIds: ['ev_vis_01'],
      opposingEvidenceIds: [],
      challenge: 'Volume may represent incentive-driven algorithmic churn.',
      invalidationCondition: 'Spot turnover drops >35% over consecutive sessions.',
      createdAt: now,
      schemaVersion: 1,
    },
    {
      id: 'asm_vis_2',
      thesisId: 'th_vis_test',
      type: 'EXPLICIT',
      category: 'POSITIONING',
      claim: 'Futures open interest expansion is non-speculative.',
      status: 'QUESTIONED',
      supportingEvidenceIds: [],
      opposingEvidenceIds: ['ev_vis_01'],
      challenge: 'Leverage buildup without deep spot bids risks liquidation cascades.',
      invalidationCondition: 'Funding rate exceeds 0.04% with negative delta.',
      createdAt: now,
      schemaVersion: 1,
    },
    {
      id: 'asm_vis_3',
      thesisId: 'th_vis_test',
      type: 'INFERRED',
      category: 'CORRELATION',
      claim: 'BTC consolidation supports relative outperformance.',
      status: 'UNTESTED',
      supportingEvidenceIds: [],
      opposingEvidenceIds: [],
      challenge: 'BTC dominance gravity drains altcoin liquidity.',
      invalidationCondition: 'BTC dominance rises >1.5% during consolidation.',
      createdAt: now,
      schemaVersion: 1,
    },
  ];

  const testScenarios: StressScenarioV1[] = [
    {
      id: 'sc_vis_1',
      thesisId: 'th_vis_test',
      name: 'Bitcoin Volatility Liquidity Drain',
      description: 'A sudden 5% BTC move drains orderbook bids across altcoin pairs.',
      affectedAssumptionIds: ['asm_vis_1', 'asm_vis_3'],
      relevantEvidenceIds: ['ev_vis_01'],
      transmissionMechanism: 'Cross-pair rebalancing into BTC collateral reserves',
      scenarioType: 'LIQUIDITY_SHOCK',
      plausibility: 'HIGH',
      consequenceForThesis: 'Relative spread compresses sharply below key support ratio.',
      uncertainties: ['Duration of cross-margined liquidity drain'],
      suggestedMitigationOrHedge: 'Monitor spread thresholds dynamically.',
      schemaVersion: 1,
    },
    {
      id: 'sc_vis_2',
      thesisId: 'th_vis_test',
      name: 'Perpetual Leverage Flush',
      description: 'Speculative long positions are liquidated through sparse books.',
      affectedAssumptionIds: ['asm_vis_2'],
      relevantEvidenceIds: ['ev_vis_01'],
      transmissionMechanism: 'Forced liquidation into thin resting bids',
      scenarioType: 'POSITIONING_REVERSAL',
      plausibility: 'MEDIUM',
      consequenceForThesis: 'Intraday drawdown invalidates continuation before organic recovery.',
      uncertainties: ['External exchange aggregate leverage'],
      schemaVersion: 1,
    },
  ];

  const testConditions: InvalidationConditionV1[] = [
    {
      id: 'inv_vis_1',
      thesisId: 'th_vis_test',
      type: 'QUANTITATIVE',
      targetAssumptionIds: ['asm_vis_1'],
      relevantEvidenceIds: ['ev_vis_01'],
      statement: 'SOL/BTC daily ratio close falls below 0.00215 boundary.',
      targetMetric: 'SOL/BTC daily ratio',
      triggerThreshold: '< 0.00215',
      timeframe: '72 hours',
      observableDataSource: 'Bitget Spot API',
      urgency: 'THESIS_REVIEW',
      schemaVersion: 1,
    },
    {
      id: 'inv_vis_2',
      thesisId: 'th_vis_test',
      type: 'QUALITATIVE',
      targetAssumptionIds: ['asm_vis_2'],
      relevantEvidenceIds: [],
      statement: 'Funding rate prints sustained premium > 0.04% with negative volume delta.',
      observableEvent: 'Sustained divergence of derivatives funding and spot book flow.',
      verificationSource: 'Bitget Futures API',
      expectedWindow: '48 hours',
      urgency: 'IMMEDIATE_EXIT',
      schemaVersion: 1,
    },
  ];

  describe('AssumptionDistribution', () => {
    it('accurately computes categorical distribution counts and proportions', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(AssumptionDistribution, {
            assumptions: testAssumptions,
            evidenceLedger: testLedger,
          })
        )
      );

      // Total count
      expect(html).toContain('3 Total');
      expect(html).toContain('Share of 3 assessed assumptions');

      // Categories and counts in unified legend
      expect(html).toContain('Supported');
      expect(html).toContain('(1)');
      expect(html).toContain('Questioned');
      expect(html).toContain('Untested');
      expect(html).toContain('Contradicted');
      expect(html).toContain('(0)');

      // Displays selected category assumptions
      expect(html).toContain('Futures open interest expansion is non-speculative.');
      expect(html).toContain('Leverage buildup without deep spot bids');
      expect(html).toContain('Funding rate exceeds 0.04% with negative delta.');

      // Labels explicitly clarify categorical share, not thesis confidence
      expect(html).toContain('categorical, not probability');
      expect(html).not.toContain('Confidence:');
      expect(html).not.toContain('Win Rate:');
    });

    it('renders empty fallback safely when assumptions array is empty', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(AssumptionDistribution, {
            assumptions: [],
            evidenceLedger: null,
          })
        )
      );
      expect(html).toContain('No underlying thesis assumptions recorded');
    });
  });

  describe('StressScenarioCausalFlow', () => {
    it('renders the bespoke 3-step causal sequence using actual validated fields', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(StressScenarioCausalFlow, {
            scenarios: testScenarios,
            evidenceLedger: testLedger,
          })
        )
      );

      // Step 1: Hypothetical Shock
      expect(html).toContain('1. Hypothetical Shock');
      expect(html).toContain('Bitcoin Volatility Liquidity Drain');
      expect(html).toContain('A sudden 5% BTC move drains orderbook bids');
      expect(html).toContain('LIQUIDITY SHOCK');
      expect(html).toContain('HIGH Plausibility');

      // Step 2: Transmission Mechanism
      expect(html).toContain('2. Transmission Mechanism');
      expect(html).toContain('Cross-pair rebalancing into BTC collateral reserves');

      // Step 3: Potential Thesis Consequence
      expect(html).toContain('3. Potential Thesis Consequence');
      expect(html).toContain('Relative spread compresses sharply below key support ratio.');

      // Multi-scenario selector without priority bias
      expect(html).toContain('Scenario 1');
      expect(html).toContain('Scenario 2');

      // Progressive disclosure trigger
      expect(html).toContain('Inspect Scenario Uncertainties &amp; Evidence');
    });

    it('renders empty notice when scenarios array is empty', () => {
      const html = renderToString(
        React.createElement(StressScenarioCausalFlow, {
          scenarios: [],
          evidenceLedger: null,
        })
      );
      expect(html).toContain('No stress scenarios evaluated');
    });
  });

  describe('ThesisReviewConditions', () => {
    it('renders conditions as compact inspectable rows with established requirements', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(ThesisReviewConditions, {
            conditions: testConditions,
            evidenceLedger: testLedger,
          })
        )
      );

      // 2 conditions established
      expect(html).toContain('2 Established');

      // Quantitative condition
      expect(html).toContain('SOL/BTC daily ratio close falls below 0.00215 boundary.');
      expect(html).toContain('QUANTITATIVE');
      expect(html).toContain('SOL/BTC daily ratio');
      expect(html).toContain('&lt; 0.00215');
      expect(html).toContain('72 hours');
      expect(html).toContain('Bitget Spot API');

      // Qualitative condition
      expect(html).toContain('Funding rate prints sustained premium &gt; 0.04%');
      expect(html).toContain('QUALITATIVE');
      expect(html).toContain('Bitget Futures API');
      expect(html).toContain('48 hours');

      // Strict neutral review trigger language (no trade execution signals)
      expect(html).toContain('Immediate Review Trigger');
      expect(html).toContain('Thesis Review Trigger');
      expect(html).not.toContain('SELL');
      expect(html).not.toContain('Stop Loss');
      expect(html).not.toContain('Automated Exit');
    });
  });

  describe('EvidenceCitationAccuracy', () => {
    it('respects exact source, market, observation type, value, and unit', () => {
      const citation = formatEvidenceCitation(testEvidence);
      expect(citation.source).toBe('Bitget');
      expect(citation.market).toBe('SOL/USDT');
      expect(citation.observationTypeLabel).toBe('24h Vol');
      expect(citation.valueText).toBe('850000000 USD');
      expect(citation.displayLabel).toBe('Bitget: SOL/USDT 24h Vol (850000000 USD)');
    });

    it('does not infer USD values from base-asset volumes or invent unknown units', () => {
      const baseAssetVolEvidence: EvidenceV1 = {
        ...testEvidence,
        id: 'ev_base_vol',
        value: 125000,
        unit: 'SOL',
      };
      const citation = formatEvidenceCitation(baseAssetVolEvidence);
      expect(citation.valueText).toBe('125000 SOL');
      expect(citation.valueText).not.toContain('USD');
      expect(citation.valueText).not.toContain('$');
    });

    it('renders EvidenceCitationBadge with quiet monochromatic styling and status dot', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(EvidenceCitationBadge, {
            evidenceId: testEvidence.id,
            evidence: testEvidence,
            ledger: testLedger,
            onInspect: () => {},
          })
        )
      );
      // Light publication theme border and background
      expect(html).toContain('border-stone-200');
      expect(html).toContain('bg-stone-100');
      expect(html).toContain('bg-emerald-600'); // Supporting stance indicator dot
      expect(html).toContain('Bitget');
      expect(html).toContain('SOL/USDT');
    });

    it('gracefully renders missing evidence badge fallback without throwing', () => {
      const html = cleanHtml(
        renderToString(
          React.createElement(EvidenceCitationBadge, {
            evidenceId: 'ev_missing_999',
            evidence: null,
            ledger: testLedger,
            onInspect: () => {},
          })
        )
      );
      expect(html).toContain('#ev_missi…');
    });
  });
});
