import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { ArgumentStanceV1, ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import type { StructuredThesisV1, ThesisInputV1 } from '@/core/contracts/thesis';
import { DissentError } from '@/core/errors/domain-errors';
import type {
  StructuredModelPort,
  StructuredModelRequest,
  StructuredModelResult,
} from '@/server/ai/structured-model.port';
import type { z } from 'zod';

export const FIXED_AT = '2026-09-19T12:00:00.000Z';

export const thesisInput: ThesisInputV1 = {
  id: 'inp_ai_1',
  rawText:
    '  I think ETH will outperform BTC over the next forty eight hours because risk appetite is improving.  ',
  submittedAt: FIXED_AT,
  schemaVersion: 1,
};

export const extractionOutput = {
  supported: true,
  unsupportedReason: null,
  market: 'ETH/BTC',
  baseAsset: 'ETH',
  quoteAsset: 'BTC',
  claim: 'ETH will outperform BTC over the stated horizon',
  direction: 'RELATIVE_LONG',
  timeHorizon: { description: 'the next forty eight hours', estimatedHours: 48 },
  catalysts: ['improving risk appetite'],
  assumptions: [
    {
      claim: 'Risk appetite is improving',
      type: 'EXPLICIT',
      category: 'MARKET_REGIME',
      challenge: 'Risk appetite may weaken during the horizon',
      invalidationCondition: 'Broad risk conditions visibly deteriorate',
    },
    {
      claim: 'Improving risk appetite benefits ETH more than BTC',
      type: 'INFERRED',
      category: 'CORRELATION',
      challenge: 'BTC may capture the same risk demand more strongly',
      invalidationCondition: 'ETH fails to strengthen relative to BTC',
    },
  ],
} as const;

export class QueueModel implements StructuredModelPort {
  readonly requests: Array<StructuredModelRequest<z.ZodTypeAny>> = [];
  private readonly outputs: Array<
    unknown | ((request: StructuredModelRequest<z.ZodTypeAny>) => unknown)
  >;

  constructor(
    outputs: Array<unknown | ((request: StructuredModelRequest<z.ZodTypeAny>) => unknown)>
  ) {
    this.outputs = [...outputs];
  }

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: StructuredModelRequest<TSchema>
  ): Promise<StructuredModelResult<z.infer<TSchema>>> {
    this.requests.push(request);
    const queued = this.outputs.shift();
    const output = typeof queued === 'function' ? queued(request) : queued;
    const parsed = request.schema.safeParse(output);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map(String).join('.'),
        ...(issue.code === 'invalid_type'
          ? { expected: issue.expected, received: issue.received }
          : {}),
      }));
      const arrayIssue = parsed.error.issues.find(
        (issue) =>
          (issue.code === 'too_big' || issue.code === 'too_small') &&
          issue.type === 'array' &&
          issue.path.length === 1
      );
      const arrayKey = typeof arrayIssue?.path[0] === 'string' ? arrayIssue.path[0] : undefined;
      const modelArray =
        arrayKey &&
        output !== null &&
        typeof output === 'object' &&
        arrayKey in output &&
        Array.isArray((output as Record<string, unknown>)[arrayKey])
          ? ((output as Record<string, unknown>)[arrayKey] as unknown[])
          : undefined;
      const providerProperties = request.jsonSchema.properties;
      const providerArrayProperty =
        arrayKey &&
        providerProperties !== null &&
        typeof providerProperties === 'object' &&
        !Array.isArray(providerProperties) &&
        arrayKey in providerProperties &&
        (providerProperties as Record<string, unknown>)[arrayKey] !== null &&
        typeof (providerProperties as Record<string, unknown>)[arrayKey] === 'object' &&
        !Array.isArray((providerProperties as Record<string, unknown>)[arrayKey])
          ? ((providerProperties as Record<string, unknown>)[arrayKey] as Record<string, unknown>)
          : undefined;
      throw DissentError.modelOutputInvalid(
        request.operation,
        'Structured output did not match its application schema.',
        {
          validationCategory: 'APPLICATION_SCHEMA_VALIDATION',
          issues,
          ...(arrayIssue && arrayKey && modelArray
            ? {
                issuePath: arrayKey,
                actualArrayLength: modelArray.length,
                permittedMinimum: providerArrayProperty?.minItems as number | undefined,
                permittedMaximum: providerArrayProperty?.maxItems as number | undefined,
              }
            : {}),
        }
      );
    }
    return {
      data: parsed.data,
      metadata: {
        provider: 'DeepSeek',
        requestedModel: 'test-model',
        model: 'test-model',
        latencyMs: 12,
        configuredOutputTokenBudget: request.maxOutputTokens,
        configuredReasoningEffort: request.reasoningEffort ?? 'low',
      },
    };
  }
}

export function makeStructuredThesis(id = 'th_ai_1'): StructuredThesisV1 {
  return {
    id,
    thesisInputId: thesisInput.id,
    originalThesis: thesisInput.rawText,
    market: 'ETH/BTC',
    baseAsset: 'ETH',
    quoteAsset: 'BTC',
    claim: 'ETH will outperform BTC over the stated horizon',
    direction: 'RELATIVE_LONG',
    timeHorizon: { description: 'the next forty eight hours', estimatedHours: 48 },
    catalysts: ['improving risk appetite'],
    createdAt: FIXED_AT,
    schemaVersion: 1,
  };
}

export function makeAssumptions(thesisId = 'th_ai_1'): AssumptionV1[] {
  return extractionOutput.assumptions.map((item, index) => ({
    id: `asm_${index}`,
    thesisId,
    ...item,
    status: 'UNTESTED',
    supportingEvidenceIds: [],
    opposingEvidenceIds: [],
    createdAt: FIXED_AT,
    schemaVersion: 1,
  }));
}

export function makeEvidenceLedger(thesisId = 'th_ai_1'): EvidenceLedgerV1 {
  const items: EvidenceV1[] = [
    {
      id: 'ev_return',
      thesisId,
      claim: 'ETH/USDT spot changed 5% over the aligned interval.',
      category: 'PRICE_ACTION',
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation: {
        type: 'INTERVAL_PRICE_CHANGE',
        market: 'ETH/USDT',
        instrumentType: 'SPOT',
        providerSymbol: 'ETHUSDT',
        interval: '1H',
        periodStartAt: '2026-09-19T10:00:00.000Z',
        periodEndAt: '2026-09-19T11:00:00.000Z',
      },
      provenance: {
        sourceName: 'Bitget V3 Market API',
        sourceType: 'EXCHANGE_API',
        endpointOrLocator: 'https://api.bitget.com/api/v3/market/candles',
        observedAt: '2026-09-19T11:00:00.000Z',
        retrievedAt: FIXED_AT,
        freshnessMode: 'HISTORICAL_RECORD',
      },
      value: '5',
      unit: '%',
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    },
    {
      id: 'ev_last',
      thesisId,
      claim: 'ETH/USDT last price was 2500 USDT per ETH.',
      category: 'PRICE_ACTION',
      stance: 'NEUTRAL',
      nature: 'NUMERIC',
      observation: {
        type: 'LAST_PRICE',
        market: 'ETH/USDT',
        instrumentType: 'SPOT',
        providerSymbol: 'ETHUSDT',
      },
      provenance: {
        sourceName: 'Bitget V3 Market API',
        sourceType: 'EXCHANGE_API',
        endpointOrLocator: 'https://api.bitget.com/api/v3/market/tickers',
        observedAt: FIXED_AT,
        retrievedAt: FIXED_AT,
        freshnessMode: 'AGE_SINCE_OBSERVATION',
        freshnessWindowSeconds: 60,
      },
      value: '2500',
      unit: 'USDT per ETH',
      derivedFromEvidenceIds: [],
      relatedAssumptionIds: [],
      verifiable: true,
      schemaVersion: 1,
    },
  ];
  return {
    id: 'led_ai_1',
    thesisId,
    items,
    summary: {
      totalCount: 2,
      supportingCount: 0,
      contradictingCount: 0,
      neutralCount: 2,
      staleCountAtAssembly: 0,
      categoriesPresent: ['PRICE_ACTION'],
    },
    assembledAt: FIXED_AT,
    schemaVersion: 1,
  };
}

export function makeArgument(
  stance: ArgumentStanceV1,
  thesisId = 'th_ai_1'
): ArgumentV1 {
  const pointId = stance === 'ADVOCATE' ? 'argp_advocate' : 'argp_dissent';
  return {
    id: stance === 'ADVOCATE' ? 'arg_advocate' : 'arg_dissent',
    thesisId,
    stance,
    summary:
      stance === 'ADVOCATE'
        ? 'Evidence-bound support remains limited'
        : 'Evidence does not establish forward persistence',
    points: [
      {
        id: pointId,
        title: stance === 'ADVOCATE' ? 'Relative evidence' : 'Persistence limitation',
        reasoning:
          'Evidence:\n[ev_return] ETH/USDT spot changed 5% over the aligned interval.\nInterpretation: This suggests relative evidence remains bounded',
        evidenceIds: ['ev_return'],
        targetAssumptionIds: ['asm_1'],
        weight: 'PRIMARY',
      },
    ],
    risksOrCounterweightsConsidered: [],
    createdAt: FIXED_AT,
    schemaVersion: 1,
  };
}

export function argumentDraft(
  qualitativeRationale = 'The selected observation is consistent with the thesis while remaining inconclusive'
) {
  return {
    summaryRationale: 'Available market evidence may support the thesis while remaining limited',
    points: [
      {
        pointKind: 'EVIDENCE_INTERPRETATION',
        title: 'Observed price action',
        evidenceClaimIds: ['ev_return'],
        targetAssumptionIds: ['asm_1'],
        relation: 'SUPPORTS',
        qualitativeRationale,
        weight: 'PRIMARY',
      },
    ],
  } as const;
}

export function argumentPointSemanticRepair(
  draft: {
    points: ReadonlyArray<{
      title: string;
      evidenceClaimIds: readonly string[];
      relation: 'SUPPORTS' | 'CHALLENGES' | 'CONTEXT_ONLY' | 'LIMITS_CONFIDENCE';
      qualitativeRationale: string;
    }>;
  }
) {
  const point = draft.points[0];
  if (!point) throw new Error('Argument draft requires a point for semantic repair.');
  return {
    title: point.title,
    evidenceClaimIds: [...point.evidenceClaimIds],
    relation: point.relation,
    qualitativeRationale: point.qualitativeRationale,
  };
}

export function stressDraft(input: {
  assumptionIds?: string[];
  argumentPointIds?: string[];
  evidenceIds?: string[];
} = {}) {
  const assumptionIds = input.assumptionIds ?? ['asm_0', 'asm_1'];
  const argumentPointIds = input.argumentPointIds ?? ['argp_advocate', 'argp_dissent'];
  const evidenceIds = input.evidenceIds ?? ['ev_return', 'ev_last'];
  return {
    assumptionAssessments: assumptionIds.map((assumptionId, index) =>
      index === assumptionIds.length - 1
        ? {
            assumptionId,
            status: 'SUPPORTED',
            supportingEvidenceIds: [evidenceIds[0]],
            opposingEvidenceIds: [],
          }
        : {
            assumptionId,
            status: 'INSUFFICIENT_EVIDENCE',
            supportingEvidenceIds: [],
            opposingEvidenceIds: [],
          }
    ),
    scenarios: [
      {
        name: 'Relative momentum reversal',
        hypotheticalChange: 'ETH relative strength reverses while BTC recovers leadership',
        affectedAssumptionIds: [assumptionIds[assumptionIds.length - 1]],
        relevantEvidenceIds: [evidenceIds[0]],
        relevantArgumentPointIds: [argumentPointIds[0]],
        transmissionMechanism: 'A reversal would break the continuation premise behind the relative thesis',
        scenarioType: 'ASSET_SPECIFIC_EVENT',
        plausibility: 'MEDIUM',
        consequenceForThesis: 'The expected relative outperformance may fail to persist',
        uncertainties: ['The evidence cannot establish whether a reversal will occur'],
      },
      {
        name: 'Risk regime deterioration',
        hypotheticalChange: 'Broader risk appetite deteriorates during the stated horizon',
        affectedAssumptionIds: [assumptionIds[0]],
        relevantEvidenceIds: [evidenceIds[1] ?? evidenceIds[0]],
        relevantArgumentPointIds: [argumentPointIds[1] ?? argumentPointIds[0]],
        transmissionMechanism: 'A weaker regime may favor defensive relative positioning over ETH strength',
        scenarioType: 'MACRO_REGIME_CHANGE',
        plausibility: 'LOW',
        consequenceForThesis: 'The thesis catalyst would no longer provide support',
        uncertainties: ['The supplied ledger contains no direct macro observation'],
      },
    ],
    invalidationConditions: [
      {
        targetAssumptionIds: [assumptionIds[assumptionIds.length - 1]],
        relevantEvidenceIds: [evidenceIds[0]],
        statement: 'ETH relative strength reverses across aligned market observations',
        observableEvent: 'Bitget evidence shows ETH no longer outperforming BTC over aligned intervals',
        verificationSourceKind: 'BITGET_MARKET_DATA',
        expectedWindow: 'Within the stated thesis horizon',
      },
      {
        targetAssumptionIds: [assumptionIds[0]],
        relevantEvidenceIds: [evidenceIds[1] ?? evidenceIds[0]],
        statement: 'Independent regime evidence no longer supports improving risk appetite',
        observableEvent: 'A primary macro or sentiment source records broad risk deterioration',
        verificationSourceKind: 'FUTURE_PRIMARY_SOURCE_REQUIRED',
        expectedWindow: 'Within the stated thesis horizon',
      },
    ],
  };
}

export function assumptionAssessmentDraft(input: {
  assumptionIds?: string[];
  evidenceIds?: string[];
} = {}) {
  const draft = stressDraft(input);
  return { assumptionAssessments: draft.assumptionAssessments };
}

export function stressResearchDraft(input: {
  assumptionIds?: string[];
  argumentPointIds?: string[];
  evidenceIds?: string[];
} = {}) {
  const draft = stressDraft(input);
  return {
    scenarios: draft.scenarios,
    invalidationConditions: draft.invalidationConditions,
  };
}

export function stressResearchDraftWithScenarioCount(
  count: number,
  input: {
    assumptionIds?: string[];
    argumentPointIds?: string[];
    evidenceIds?: string[];
  } = {}
) {
  const base = stressResearchDraft(input);
  const scenarioTypes = [
    'ASSET_SPECIFIC_EVENT',
    'MACRO_REGIME_CHANGE',
    'LIQUIDITY_SHOCK',
    'POSITIONING_REVERSAL',
    'VOLATILITY_EXPANSION',
    'CORRELATION_BREAKDOWN',
    'LIQUIDATION_CASCADE',
    'MARKET_STRUCTURE_DETERIORATION',
    'OTHER',
  ] as const;
  const scenarios = Array.from({ length: count }, (_, index) => {
    const template = base.scenarios[index % base.scenarios.length]!;
    const scenarioType = scenarioTypes[index % scenarioTypes.length]!;
    return {
      ...template,
      name: `Distinct scenario name ${index + 1}`,
      hypotheticalChange: `Distinct hypothetical change condition ${index + 1}`,
      transmissionMechanism: `Distinct scenario transmission mechanism explanation ${index + 1}`,
      consequenceForThesis: `Distinct potential consequence for the thesis ${index + 1}`,
      scenarioType,
    };
  });
  return {
    scenarios,
    invalidationConditions: base.invalidationConditions,
  };
}

export function stressOutputs(input: {
  assumptionIds?: string[];
  argumentPointIds?: string[];
  evidenceIds?: string[];
} = {}) {
  return [assumptionAssessmentDraft(input), stressResearchDraft(input)];
}

export function assumptionAssessmentDraftFromRequest(
  request: StructuredModelRequest<z.ZodTypeAny>
) {
  const assumptions = request.userPayload.assumptions as Array<{ id: string }>;
  const evidence = request.userPayload.evidenceCatalog as Array<{ id: string }>;
  return assumptionAssessmentDraft({
    assumptionIds: assumptions.map((item) => item.id),
    evidenceIds: evidence.map((item) => item.id),
  });
}

export function stressResearchDraftFromRequest(
  request: StructuredModelRequest<z.ZodTypeAny>
) {
  const assumptions = request.userPayload.testedAssumptions as Array<{ id: string }>;
  const argumentsValue = request.userPayload.arguments as Array<{
    points: Array<{ id: string }>;
  }>;
  const evidence = request.userPayload.evidenceCatalog as Array<{ id: string }>;
  return stressResearchDraft({
    assumptionIds: assumptions.map((item) => item.id),
    argumentPointIds: argumentsValue.flatMap((item) => item.points.map((point) => point.id)),
    evidenceIds: evidence.map((item) => item.id),
  });
}

export function synthesisDraft(input: {
  dissentPointId?: string;
  evidenceId?: string;
  targetId?: string;
} = {}) {
  return {
    dissentPointClassifications: [
      {
        dissentPointId: input.dissentPointId ?? 'argp_dissent',
        classification: 'EVIDENCE_LIMITATION',
        targetType: 'THESIS_CLAIM',
        targetId: input.targetId ?? 'th_ai_1',
        evidenceId: input.evidenceId ?? 'ev_return',
        explanation: 'Historical relative performance does not establish forward persistence',
        severity: null,
      },
    ],
    unknowns: [
      'Whether observed relative strength will persist through the stated horizon remains unknown',
    ],
  };
}

export function synthesisDraftFromRequest(request: StructuredModelRequest<z.ZodTypeAny>) {
  const thesis = request.userPayload.thesis as { id: string };
  const dissent = request.userPayload.dissentCase as {
    points: Array<{ id: string; evidenceIds: string[] }>;
  };
  return {
    dissentPointClassifications: dissent.points.map((point) => ({
      dissentPointId: point.id,
      classification: 'EVIDENCE_LIMITATION',
      targetType: 'THESIS_CLAIM',
      targetId: thesis.id,
      evidenceId: point.evidenceIds[0],
      explanation: 'Historical market evidence does not establish forward persistence',
      severity: null,
    })),
    unknowns: [
      'Whether observed relative strength will persist through the stated horizon remains unknown',
    ],
  };
}
