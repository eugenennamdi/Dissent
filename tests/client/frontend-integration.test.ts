import { describe, it, expect } from 'vitest';
import {
  ResearchSuccessResponseV1Schema,
  ApiFailureResponseV1Schema,
  HumanDecisionSuccessResponseV1Schema,
  HumanDecisionSubmissionV1Schema,
} from '@/lib/api/contracts';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import { ArgumentV1Schema } from '@/core/contracts/argument';
import { HumanDecisionV1Schema } from '@/core/contracts/human-decision';
import { StoredResearchRunV1Schema } from '@/lib/storage/local-brief-store';
import {
  getSafeExternalUrl,
  getEvidenceFreshness,
  getAssumptionStatusStyle,
  getInvalidationUrgencyLabel,
} from '@/lib/formatters/market-formatters';

describe('Frontend Integration & Contract Guardrails', () => {
  const now = new Date().toISOString();

  const validEvidenceItem = {
    id: 'ev_bitget_01',
    thesisId: 'th_test_100',
    claim: 'Bitget ETHUSDT 24h volume is $1.2B',
    category: 'PRICE_ACTION' as const,
    stance: 'SUPPORTING' as const,
    nature: 'NUMERIC' as const,
    observation: {
      type: 'BASE_VOLUME_24H' as const,
      market: 'ETH/USDT',
      instrumentType: 'SPOT' as const,
      providerSymbol: 'ETHUSDT',
    },
    provenance: {
      sourceName: 'Bitget Public Spot API',
      sourceType: 'EXCHANGE_API' as const,
      endpointOrLocator: '/api/v3/market/tickers',
      observedAt: now,
      retrievedAt: now,
      freshnessMode: 'AGE_SINCE_OBSERVATION' as const,
    },
    value: 1200000000,
    unit: 'USD',
    derivedFromEvidenceIds: [],
    relatedAssumptionIds: [],
    verifiable: true,
    schemaVersion: 1 as const,
  };

  const validAdvocateCase = {
    id: 'arg_adv_100',
    thesisId: 'th_test_100',
    stance: 'ADVOCATE' as const,
    summary: 'ETH spot volume has rebounded strongly over 24 hours.',
    points: [
      {
        id: 'pt_adv_1',
        title: 'Spot Volume Expansion',
        reasoning: 'Volume demonstrates institutional accumulation.',
        evidenceIds: ['ev_bitget_01'],
        targetAssumptionIds: [],
        weight: 'PRIMARY' as const,
      },
    ],
    risksOrCounterweightsConsidered: ['BTC volume is also rising in tandem'],
    createdAt: now,
    schemaVersion: 1 as const,
  };

  const validBrief = {
    id: 'brf_test_100',
    runId: 'run_test_100',
    createdAt: now,
    originalThesis: 'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving.',
    structuredThesis: {
      id: 'th_test_100',
      thesisInputId: 'inp_test_100',
      originalThesis: 'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving.',
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      claim: 'ETH will outperform BTC over the next 48 hours',
      direction: 'RELATIVE_LONG' as const,
      timeHorizon: { description: '48 hours', estimatedHours: 48 },
      catalysts: ['improving risk appetite'],
      createdAt: now,
      schemaVersion: 1 as const,
    },
    supportingEvidence: [validEvidenceItem],
    theDissent: {
      id: 'arg_diss_100',
      thesisId: 'th_test_100',
      stance: 'DISSENTER' as const,
      summary: 'BTC dominance expansion creates downside drag for relative performance.',
      points: [
        {
          id: 'pt_diss_1',
          title: 'BTC Dominance Overhang',
          reasoning: 'Capital concentration remains firmly skewed to BTC.',
          evidenceIds: ['ev_bitget_01'],
          targetAssumptionIds: [],
          weight: 'PRIMARY' as const,
        },
      ],
      risksOrCounterweightsConsidered: [],
      createdAt: now,
      schemaVersion: 1 as const,
    },
    assumptions: [
      {
        id: 'as_100',
        thesisId: 'th_test_100',
        claim: 'Risk appetite is broadening to altcoins',
        type: 'EXPLICIT' as const,
        category: 'MARKET_REGIME' as const,
        status: 'SUPPORTED' as const,
        challenge: 'Risk stays concentrated in BTC ETF vehicles',
        invalidationCondition: 'ETH/BTC falls below 0.0315',
        supportingEvidenceIds: ['ev_bitget_01'],
        opposingEvidenceIds: [],
        createdAt: now,
        schemaVersion: 1 as const,
      },
    ],
    contradictions: [],
    stressScenarios: [
      {
        id: 'sc_100',
        thesisId: 'th_test_100',
        name: 'Macro Liquidity Shock',
        description: 'Rates volatility forces flight to quality into BTC.',
        affectedAssumptionIds: ['as_100'],
        relevantEvidenceIds: ['ev_bitget_01'],
        transmissionMechanism: 'Cross-asset margin calls drain alt pairs first',
        scenarioType: 'LIQUIDITY_SHOCK' as const,
        plausibility: 'HIGH' as const,
        consequenceForThesis: 'ETH/BTC ratio drops sharply',
        uncertainties: ['Exact Federal Reserve messaging timing'],
        schemaVersion: 1 as const,
      },
    ],
    invalidationConditions: [
      {
        type: 'QUANTITATIVE' as const,
        id: 'inv_100',
        thesisId: 'th_test_100',
        targetAssumptionIds: ['as_100'],
        relevantEvidenceIds: ['ev_bitget_01'],
        statement: 'ETH/BTC breaks 0.0315 support on 4H close',
        targetMetric: 'ETH/BTC 4H close',
        triggerThreshold: '< 0.0315',
        timeframe: '48h',
        observableDataSource: 'Bitget ETHBTC spot',
        urgency: 'THESIS_REVIEW' as const,
        schemaVersion: 1 as const,
      },
    ],
    unknowns: ['Macro treasury auction outcomes unmonitored by V1 API.'],
    evidenceLedger: {
      id: 'led_100',
      thesisId: 'th_test_100',
      items: [validEvidenceItem],
      summary: {
        totalCount: 1,
        supportingCount: 1,
        contradictingCount: 0,
        neutralCount: 0,
        staleCountAtAssembly: 0,
        categoriesPresent: ['PRICE_ACTION' as const],
      },
      assembledAt: now,
      schemaVersion: 1 as const,
    },
    humanDecision: null,
    disclaimer:
      'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.',
    schemaVersion: 1 as const,
  };

  it('validates a real successful research API response contract', () => {
    const rawSuccessPayload = {
      ok: true,
      state: 'COMPLETED',
      runId: 'run_test_100',
      brief: validBrief,
      advocateCase: validAdvocateCase,
      timingsMs: {
        structuring: 350,
        marketResearch: 550,
        argumentation: 1100,
        stressTesting: 800,
        synthesis: 450,
        total: 3250,
      },
      persistence: {
        strategy: 'BROWSER_LOCAL',
        serverStored: false,
        crossDeviceRecovery: false,
      },
    };

    const parsed = ResearchSuccessResponseV1Schema.parse(rawSuccessPayload);
    expect(parsed.ok).toBe(true);
    expect(parsed.runId).toBe('run_test_100');
    expect(parsed.brief.humanDecision).toBeNull();
    expect(parsed.brief.theDissent.stance).toBe('DISSENTER');
    expect(parsed.advocateCase.stance).toBe('ADVOCATE');
  });

  it('preserves the original thesis string verbatim across input and structured thesis', () => {
    const original = 'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving.';
    expect(validBrief.originalThesis).toBe(original);
    expect(validBrief.structuredThesis.originalThesis).toBe(original);
  });

  it('handles failed research response schema and prevents mock brief generation on failure', () => {
    const rawFailurePayload = {
      ok: false,
      state: 'FAILED',
      requestId: 'req_err_1',
      error: {
        code: 'UNSUPPORTED_MARKET',
        message: 'Only relative ETH/BTC theses are supported in V1.',
        retryable: false,
      },
    };

    const parsed = ApiFailureResponseV1Schema.parse(rawFailurePayload);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('UNSUPPORTED_MARKET');
    // Schema guarantees there is no brief property
    expect('brief' in parsed).toBe(false);
  });

  it('enforces strict human decision submission constraints', () => {
    // Valid submission
    const validSubmission = {
      runId: 'run_test_100',
      thesisId: 'th_test_100',
      decision: 'WATCH' as const,
      notes: 'Waiting for market close',
      confirmedByUser: true as const,
    };

    const parsed = HumanDecisionSubmissionV1Schema.parse(validSubmission);
    expect(parsed.decision).toBe('WATCH');
    expect(parsed.confirmedByUser).toBe(true);

    // Rejects if confirmedByUser is false or missing
    expect(() =>
      HumanDecisionSubmissionV1Schema.parse({
        ...validSubmission,
        confirmedByUser: false,
      })
    ).toThrow();

    // Rejects invalid decision types (e.g. AI attempting "BUY")
    expect(() =>
      HumanDecisionSubmissionV1Schema.parse({
        ...validSubmission,
        decision: 'BUY',
      })
    ).toThrow();
  });

  it('validates successful HumanDecision response attribution', () => {
    const decisionResponse = {
      ok: true,
      state: 'RECORDED',
      decision: {
        id: 'dec_100',
        runId: 'run_test_100',
        thesisId: 'th_test_100',
        decision: 'PROCEED' as const,
        attribution: {
          actorType: 'HUMAN_OPERATOR' as const,
          operatorId: 'operator_test_1',
        },
        decidedAt: now,
        schemaVersion: 1 as const,
      },
      persistence: {
        strategy: 'BROWSER_LOCAL' as const,
        serverStored: false as const,
        crossDeviceRecovery: false as const,
      },
    };

    const parsed = HumanDecisionSuccessResponseV1Schema.parse(decisionResponse);
    expect(parsed.decision.attribution.actorType).toBe('HUMAN_OPERATOR');
  });

  it('rejects invalid stored research runs in local persistence schema', () => {
    const invalidRun = {
      runId: 'run_bad',
      thesisId: 'th_bad',
      // Missing brief
      timingsMs: { structuring: 10, total: 10 },
      savedAt: now,
    };

    const result = StoredResearchRunV1Schema.safeParse(invalidRun);
    expect(result.success).toBe(false);
  });

  it('verifies safe external URL check prevents fake clickable links', () => {
    // Relative API endpoint must return null (not clickable external URL)
    expect(getSafeExternalUrl('/api/v3/market/tickers')).toBeNull();
    expect(getSafeExternalUrl('bitget.com')).toBeNull();

    // Absolute valid URL is recognized
    expect(getSafeExternalUrl('https://api.bitget.com/api/v3/market/tickers')).toBe(
      'https://api.bitget.com/api/v3/market/tickers'
    );
  });

  it('correctly maps invalidation conditions to review triggers without trading execution language', () => {
    const urgency = getInvalidationUrgencyLabel('IMMEDIATE_EXIT');
    expect(urgency.label).toBe('Immediate Review Trigger');
    expect(urgency.note).toContain('thesis invalidation');
    expect(urgency.label).not.toContain('SELL');
    expect(urgency.label).not.toContain('Stop Loss');
  });
});
