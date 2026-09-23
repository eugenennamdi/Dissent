import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { BriefView } from '@/components/BriefView';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import {
  saveResearchRun,
  loadStoredRuns,
  updateStoredDecision,
  deleteStoredRun,
  StoredResearchRunV1Schema,
  type StoredResearchRunV1,
} from '@/lib/storage/local-brief-store';

describe('BriefView Production Regression & Grounding Tests', () => {
  const now = '2026-09-21T18:00:00.000Z';

  const realEvidenceItem: EvidenceV1 = {
    id: 'ev_sol_real_01',
    thesisId: 'th_sol_test_01',
    claim: 'Bitget SOLUSDT 24h volume reached 850M USD',
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
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1,
  };

  const realAdvocateCase: ArgumentV1 = {
    id: 'arg_adv_sol',
    thesisId: 'th_sol_test_01',
    stance: 'ADVOCATE',
    summary: 'SOL demonstrates sustained spot volume growth and relative strength against BTC.',
    points: [
      {
        id: 'pt_adv_sol_1',
        title: 'Authentic Spot Volume Breakout',
        reasoning: 'Spot volume increased significantly on Bitget without speculative funding overheating.',
        evidenceIds: ['ev_sol_real_01'],
        targetAssumptionIds: ['asm_sol_1'],
        weight: 'PRIMARY',
      },
      {
        id: 'pt_adv_sol_2',
        title: 'Healthy Open Interest Expansion',
        reasoning: 'Derivatives open interest expanded moderately in support of the spot leg.',
        evidenceIds: ['ev_sol_real_01'],
        targetAssumptionIds: [],
        weight: 'SECONDARY',
      },
    ],
    risksOrCounterweightsConsidered: ['BTC high timeframe consolidation could limit upside'],
    createdAt: now,
    schemaVersion: 1,
  };

  const realBrief: DissentBriefV1 = {
    id: 'brf_sol_real',
    runId: 'run_sol_live_789',
    createdAt: now,
    originalThesis: 'I believe SOL will outperform BTC over the next 72 hours driven by real ecosystem volume.',
    structuredThesis: {
      id: 'th_sol_test_01',
      thesisInputId: 'inp_sol_test_01',
      originalThesis: 'I believe SOL will outperform BTC over the next 72 hours driven by real ecosystem volume.',
      market: 'SOL/BTC',
      baseAsset: 'SOL',
      quoteAsset: 'BTC',
      claim: 'SOL will outperform BTC over the next 72 hours',
      direction: 'RELATIVE_LONG',
      timeHorizon: { description: '72 hours', estimatedHours: 72 },
      catalysts: ['real ecosystem volume', 'spot liquidity breakout'],
      createdAt: now,
      schemaVersion: 1,
    },
    supportingEvidence: [realEvidenceItem],
    theDissent: {
      id: 'arg_diss_sol',
      thesisId: 'th_sol_test_01',
      stance: 'DISSENTER',
      summary: 'BTC capital concentration and shallow SOL orderbook depth pose structural rejection risks.',
      points: [
        {
          id: 'pt_diss_sol_1',
          title: 'BTC Liquidity Gravity Risk',
          reasoning: 'Bitcoin liquidity absorbs dominant exchange flow, capping altcoin outperformance duration.',
          evidenceIds: ['ev_sol_real_01'],
          targetAssumptionIds: ['asm_sol_1'],
          weight: 'PRIMARY',
        },
      ],
      risksOrCounterweightsConsidered: ['SOL spot volume remains temporarily elevated'],
      createdAt: now,
      schemaVersion: 1,
    },
    assumptions: [
      {
        id: 'asm_sol_1',
        thesisId: 'th_sol_test_01',
        type: 'EXPLICIT',
        category: 'MARKET_REGIME',
        claim: 'Ecosystem volume translates directly into sustained token price appreciation.',
        status: 'QUESTIONED',
        supportingEvidenceIds: ['ev_sol_real_01'],
        opposingEvidenceIds: [],
        challenge: 'Volume may represent wash trading or localized incentive churn rather than organic capital.',
        invalidationCondition: 'Volume drops sharply on non-incentivized pairs.',
        createdAt: now,
        schemaVersion: 1,
      },
    ],
    stressScenarios: [
      {
        id: 'sc_sol_1',
        thesisId: 'th_sol_test_01',
        name: 'Bitcoin Volatility Liquidity Drain',
        description: 'A sharp 5% Bitcoin intraday move drains orderbook depth across all altcoin pairs.',
        affectedAssumptionIds: ['asm_sol_1'],
        relevantEvidenceIds: ['ev_sol_real_01'],
        transmissionMechanism: 'Cross-pair rebalancing into primary reserves',
        scenarioType: 'LIQUIDITY_SHOCK',
        plausibility: 'HIGH',
        consequenceForThesis: 'SOL/BTC relative spread compresses sharply below key support.',
        uncertainties: ['Duration of drain regime is unquantified.'],
        schemaVersion: 1,
      },
    ],
    invalidationConditions: [
      {
        id: 'inv_sol_1',
        thesisId: 'th_sol_test_01',
        type: 'QUANTITATIVE',
        targetAssumptionIds: ['asm_sol_1'],
        relevantEvidenceIds: ['ev_sol_real_01'],
        statement: 'SOL/BTC daily close falls below 0.00215 ratio.',
        targetMetric: 'SOL/BTC daily ratio',
        triggerThreshold: '< 0.00215',
        timeframe: '72 hours',
        observableDataSource: 'Bitget Spot',
        urgency: 'THESIS_REVIEW',
        schemaVersion: 1,
      },
    ],
    evidenceLedger: {
      id: 'led_sol_real',
      thesisId: 'th_sol_test_01',
      items: [realEvidenceItem],
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
    },
    contradictions: [],
    unknowns: ['Institutional off-exchange OTC block volumes remain unmeasured.'],
    disclaimer:
      'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.',
    humanDecision: null,
    schemaVersion: 1,
  };

  const defaultTimings = {
    structuring: 500,
    marketResearch: 800,
    argumentation: 1200,
    stressTesting: 900,
    synthesis: 600,
    total: 4000,
  };

  it('renders supplied research data without hardcoded prototype fixture leakage', () => {
    const html = renderToString(
      React.createElement(BriefView, {
        brief: realBrief,
        advocateCase: realAdvocateCase,
        timingsMs: defaultTimings,
        storageError: null,
        onSubmitDecision: async () => {},
        isSubmittingDecision: false,
        decisionError: null,
      })
    );

    // 1. Verifies real data is rendered
    expect(html).toContain('SOL/BTC');
    expect(html).toContain('I believe SOL will outperform BTC over the next 72 hours');
    expect(html).toContain('Authentic Spot Volume Breakout');
    expect(html).toContain('BTC Liquidity Gravity Risk');
    expect(html).toContain('Bitcoin Volatility Liquidity Drain');
    expect(html).toContain('SOL/BTC daily close falls below 0.00215 ratio');

    // 2. Confirms NO prototype fixture text is leaked into production view
    expect(html).not.toContain('BTC dominance climbed to 57.8%');
    expect(html).not.toContain('Turnover on ETH spot pairs expanded to $1.42B');
    expect(html).not.toContain('BTC Dominance Expansion Surge');
    expect(html).not.toContain('ETH/BTC closes below 0.0405');
    expect(html).not.toContain('ETH exhibits expanding spot turnover');
  });

  it('enforces correct decision terminology: "Your Research Decision" and "Thesis Review Conditions"', () => {
    const html = renderToString(
      React.createElement(BriefView, {
        brief: realBrief,
        advocateCase: realAdvocateCase,
        timingsMs: defaultTimings,
        storageError: null,
        onSubmitDecision: async () => {},
        isSubmittingDecision: false,
        decisionError: null,
      })
    );

    // Decision section terminology
    expect(html).toContain('Your Research Decision');
    expect(html).not.toContain('Human Trader Attestation');

    // Invalidation condition terminology
    expect(html).toContain('Thesis Review Conditions');
    expect(html).not.toContain('Invalidation Tripwire');
    expect(html).not.toContain('Stop Loss');
    expect(html).not.toContain('Automated Exit');
  });

  it('verifies that referenced evidence IDs resolve to items in the evidence ledger', () => {
    const ledgerItemIds = new Set(realBrief.evidenceLedger.items.map((i) => i.id));

    // Advocate points
    for (const pt of realAdvocateCase.points) {
      for (const evId of pt.evidenceIds) {
        expect(ledgerItemIds.has(evId)).toBe(true);
      }
    }

    // Dissenter points
    for (const pt of realBrief.theDissent.points) {
      for (const evId of pt.evidenceIds) {
        expect(ledgerItemIds.has(evId)).toBe(true);
      }
    }

    // Assumptions
    for (const asm of realBrief.assumptions) {
      for (const evId of [...asm.supportingEvidenceIds, ...asm.opposingEvidenceIds]) {
        expect(ledgerItemIds.has(evId)).toBe(true);
      }
    }

    // Invalidation conditions
    for (const cond of realBrief.invalidationConditions) {
      for (const evId of cond.relevantEvidenceIds) {
        expect(ledgerItemIds.has(evId)).toBe(true);
      }
    }
  });

  it('renders recorded human decision state when a decision has been committed', () => {
    const decidedBrief: DissentBriefV1 = {
      ...realBrief,
      humanDecision: {
        id: 'dec_test_02',
        runId: realBrief.runId,
        thesisId: realBrief.structuredThesis.id,
        decision: 'PROCEED',
        notes: 'Conviction verified by spot volume; watching 0.00215 ratio boundary.',
        decidedAt: now,
        schemaVersion: 1,
        attribution: {
          actorType: 'HUMAN_OPERATOR',
          operatorId: 'operator_alpha_01',
        },
      },
    };

    const html = renderToString(
      React.createElement(BriefView, {
        brief: decidedBrief,
        advocateCase: realAdvocateCase,
        timingsMs: defaultTimings,
        storageError: null,
        onSubmitDecision: async () => {},
        isSubmittingDecision: false,
        decisionError: null,
      })
    );

    expect(html).toContain('Recorded Decision:');
    expect(html).toContain('PROCEED');
    expect(html).toContain('operator_alpha_01');
    expect(html).toContain('Conviction verified by spot volume');
    expect(html).toContain('Research decision recorded in browser session');
  });

  it('verifies the browser-local history store operations remain fully functional', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const k in store) delete store[k];
        },
      },
    });

    const runToStore: StoredResearchRunV1 = {
      runId: realBrief.runId,
      thesisId: realBrief.structuredThesis.id,
      brief: realBrief,
      advocateCase: realAdvocateCase,
      timingsMs: defaultTimings,
      savedAt: now,
    };

    // Save run
    const saveRes = saveResearchRun(runToStore);
    expect(saveRes.ok).toBe(true);
    try {
      fs.writeFileSync(
        '/Users/apple/.gemini/antigravity/brain/336067f4-ab19-4732-b76e-e3e157934bf2/scratch/verified-run.json',
        JSON.stringify(runToStore, null, 2)
      );
    } catch {
      // Non-fatal
    }
    let loaded = loadStoredRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.runId).toBe(realBrief.runId);
    expect(loaded[0]?.brief.humanDecision).toBeNull();

    // Update decision
    const updateRes = updateStoredDecision(realBrief.runId, realBrief.structuredThesis.id, {
      id: 'dec_test_01',
      runId: realBrief.runId,
      thesisId: realBrief.structuredThesis.id,
      decision: 'WATCH',
      notes: 'Monitoring support boundary.',
      decidedAt: now,
      schemaVersion: 1,
      attribution: {
        actorType: 'HUMAN_OPERATOR',
        operatorId: 'operator_beta_02',
      },
    });
    expect(updateRes.ok).toBe(true);

    loaded = loadStoredRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.brief.humanDecision?.decision).toBe('WATCH');
    expect(loaded[0]?.brief.humanDecision?.notes).toBe('Monitoring support boundary.');

    // Delete run
    deleteStoredRun(realBrief.runId);
    loaded = loadStoredRuns();
    expect(loaded).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});
