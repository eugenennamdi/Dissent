import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { HumanDecisionV1 } from '@/core/contracts/human-decision';
import {
  saveResearchRun,
  loadStoredRuns,
  getActiveRun,
  getActiveOrLatestRun,
  setActiveRunId,
  updateStoredDecision,
  deleteStoredRun,
  clearAllStoredRuns,
  type StoredResearchRunV1,
} from '@/lib/storage/local-brief-store';

describe('LocalBriefStore', () => {
  const now = new Date().toISOString();

  // In-memory mock for window.localStorage
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
      },
    });
  });

  const mockBrief: DissentBriefV1 = {
    id: 'brf_test_1',
    runId: 'run_test_1',
    createdAt: now,
    originalThesis: 'ETH will outperform BTC over the next 48 hours',
    structuredThesis: {
      id: 'th_test_1',
      thesisInputId: 'inp_test_1',
      originalThesis: 'ETH will outperform BTC over the next 48 hours',
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
      id: 'arg_diss_1',
      thesisId: 'th_test_1',
      stance: 'DISSENTER',
      summary: 'BTC dominance surge poses risk to relative ETH alpha.',
      points: [
        {
          id: 'pt_1',
          title: 'BTC Dominance Trend',
          reasoning: 'Dominance remains upward trending.',
          evidenceIds: ['ev_1'],
          targetAssumptionIds: [],
          weight: 'PRIMARY',
        },
      ],
      risksOrCounterweightsConsidered: [],
      createdAt: now,
      schemaVersion: 1,
    },
    assumptions: [
      {
        id: 'as_1',
        thesisId: 'th_test_1',
        claim: 'Risk appetite favors alts',
        type: 'EXPLICIT',
        category: 'MARKET_REGIME',
        status: 'QUESTIONED',
        challenge: 'Capital concentrated in BTC',
        invalidationCondition: 'BTC dominance > 58%',
        supportingEvidenceIds: [],
        opposingEvidenceIds: ['ev_1'],
        createdAt: now,
        schemaVersion: 1,
      },
    ],
    contradictions: [],
    stressScenarios: [
      {
        id: 'sc_1',
        thesisId: 'th_test_1',
        name: 'Liquidity drain to BTC',
        description: 'Macro flight into BTC leaves ETH behind.',
        affectedAssumptionIds: ['as_1'],
        relevantEvidenceIds: ['ev_1'],
        transmissionMechanism: 'Cross-pair rebalancing',
        scenarioType: 'LIQUIDITY_SHOCK',
        plausibility: 'HIGH',
        consequenceForThesis: 'ETH underperforms BTC',
        uncertainties: ['Duration is unknown'],
        schemaVersion: 1,
      },
    ],
    invalidationConditions: [
      {
        type: 'QUANTITATIVE',
        id: 'inv_1',
        thesisId: 'th_test_1',
        targetAssumptionIds: ['as_1'],
        relevantEvidenceIds: ['ev_1'],
        statement: 'ETH/BTC closes below 0.0315',
        targetMetric: 'ETH/BTC 4H close',
        triggerThreshold: '< 0.0315',
        timeframe: '48h',
        observableDataSource: 'Bitget Spot',
        urgency: 'THESIS_REVIEW',
        schemaVersion: 1,
      },
    ],
    unknowns: ['Institutional OTC flow remains unmonitored.'],
    evidenceLedger: {
      id: 'led_test_1',
      thesisId: 'th_test_1',
      items: [
        {
          id: 'ev_1',
          thesisId: 'th_test_1',
          claim: 'ETH/BTC 24h volume down 12%',
          category: 'PRICE_ACTION',
          stance: 'CONTRADICTING',
          nature: 'NUMERIC',
          observation: {
            type: 'PRICE_CHANGE_24H',
            market: 'ETH/BTC',
            instrumentType: 'SPOT',
            providerSymbol: 'ETHBTC',
          },
          provenance: {
            sourceName: 'Bitget Spot API',
            sourceType: 'EXCHANGE_API',
            endpointOrLocator: '/api/v3/market/tickers',
            observedAt: now,
            retrievedAt: now,
            freshnessMode: 'AGE_SINCE_OBSERVATION',
          },
          value: -12,
          unit: '%',
          derivedFromEvidenceIds: [],
          relatedAssumptionIds: [],
          verifiable: true,
          schemaVersion: 1,
        },
      ],
      summary: {
        totalCount: 1,
        supportingCount: 0,
        contradictingCount: 1,
        neutralCount: 0,
        staleCountAtAssembly: 0,
        categoriesPresent: ['PRICE_ACTION'],
      },
      assembledAt: now,
      schemaVersion: 1,
    },
    humanDecision: null,
    disclaimer:
      'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.',
    schemaVersion: 1,
  };

  const mockAdvocateCase: ArgumentV1 = {
    id: 'arg_adv_1',
    thesisId: 'th_test_1',
    stance: 'ADVOCATE',
    summary: 'ETH relative momentum is showing early stabilization signs.',
    points: [
      {
        id: 'pt_adv_1',
        title: 'Stabilizing Relative Base',
        reasoning: 'ETH has formed a short-term consolidation shelf.',
        evidenceIds: ['ev_1'],
        targetAssumptionIds: [],
        weight: 'PRIMARY',
      },
    ],
    risksOrCounterweightsConsidered: ['BTC ETF inflows may overpower altcoin momentum'],
    createdAt: now,
    schemaVersion: 1,
  };

  const sampleRun: StoredResearchRunV1 = {
    runId: 'run_test_1',
    thesisId: 'th_test_1',
    brief: mockBrief,
    advocateCase: mockAdvocateCase,
    timingsMs: {
      structuring: 400,
      marketResearch: 600,
      argumentation: 1200,
      stressTesting: 900,
      synthesis: 500,
      total: 3600,
    },
    savedAt: now,
  };

  it('saves and restores a completed research run correctly', () => {
    const result = saveResearchRun(sampleRun);
    expect(result.ok).toBe(true);

    const loaded = loadStoredRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.runId).toBe('run_test_1');
    expect(loaded[0]!.brief.originalThesis).toBe(sampleRun.brief.originalThesis);
    expect(loaded[0]!.advocateCase.stance).toBe('ADVOCATE');
  });

  it('updates a stored research run with an explicit human decision', () => {
    saveResearchRun(sampleRun);

    const humanDecision: HumanDecisionV1 = {
      id: 'dec_test_1',
      runId: 'run_test_1',
      thesisId: 'th_test_1',
      decision: 'WATCH',
      notes: 'Waiting for BTC dominance to top out.',
      attribution: {
        actorType: 'HUMAN_OPERATOR',
        operatorId: 'operator_local_1',
      },
      decidedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    const updateRes = updateStoredDecision('run_test_1', 'th_test_1', humanDecision);
    expect(updateRes.ok).toBe(true);

    const latest = getActiveOrLatestRun();
    expect(latest).not.toBeNull();
    expect(latest?.brief.humanDecision?.decision).toBe('WATCH');
    expect(latest?.brief.humanDecision?.attribution.actorType).toBe('HUMAN_OPERATOR');
  });

  it('safely rejects and filters out corrupted or malformed localStorage records', () => {
    // Inject corrupt record alongside valid record
    store['dissent_research_history_v1'] = JSON.stringify([
      { invalid: 'corrupted payload' },
      sampleRun,
    ]);

    const loaded = loadStoredRuns();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.runId).toBe('run_test_1');
  });

  it('handles delete and clear operations without corrupting storage', () => {
    saveResearchRun(sampleRun);
    expect(loadStoredRuns()).toHaveLength(1);

    deleteStoredRun('run_test_1');
    expect(loadStoredRuns()).toHaveLength(0);

    saveResearchRun(sampleRun);
    clearAllStoredRuns();
    expect(loadStoredRuns()).toHaveLength(0);
  });

  it('returns active run when activeRunId is set and null when cleared for compose mode', () => {
    saveResearchRun(sampleRun);
    expect(getActiveRun()?.runId).toBe('run_test_1');

    // When user returns to compose mode / new thesis
    setActiveRunId(null);
    expect(getActiveRun()).toBeNull();

    // Historical runs remain preserved in storage
    expect(loadStoredRuns()).toHaveLength(1);

    // Explicit getActiveOrLatestRun still finds it if requested
    expect(getActiveOrLatestRun()?.runId).toBe('run_test_1');
  });

  it('handles QuotaExceededError gracefully without silent deletion', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string) => {
          if (key === '__dissent_storage_test__') {
            return;
          }
          const quotaErr = new DOMException('QuotaExceededError', 'QuotaExceededError');
          throw quotaErr;
        },
        removeItem: () => {},
      },
    });

    const res = saveResearchRun(sampleRun);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('quota exceeded');
  });

  it('handles storage-disabled environments gracefully', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('Access denied');
        },
        setItem: () => {
          throw new Error('Access denied');
        },
        removeItem: () => {},
      },
    });

    const res = saveResearchRun(sampleRun);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Browser local storage is not available');
  });
});
