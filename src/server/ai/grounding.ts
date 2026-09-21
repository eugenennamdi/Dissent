import { createHash } from 'node:crypto';
import { ArgumentV1Schema, type ArgumentStanceV1, type ArgumentV1 } from '@/core/contracts/argument';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import {
  deriveEvidenceFreshness,
  type EvidenceLedgerV1,
  type EvidenceNatureV1,
  type EvidenceObservationTypeV1,
  type MarketInstrumentTypeV1,
} from '@/core/contracts/evidence';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertArgumentEvidenceGrounding } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import type { z } from 'zod';
import { ArgumentDraftOutputSchema } from './ai-output.schemas';

type ArgumentDraft = z.infer<typeof ArgumentDraftOutputSchema>;

interface ArgumentDiagnosticContext {
  argumentStance?: ArgumentStanceV1;
}

interface ArgumentViolationInput {
  operation: string;
  stance: ArgumentStanceV1;
  validationCategory: string;
  invariantCode: string;
  issuePath: string;
  safeExplanation: string;
  argumentPointIndex?: number;
  evidenceId?: string;
  evidenceIds?: string[];
  assumptionId?: string;
  extra?: Record<string, unknown>;
}

function argumentViolation(input: ArgumentViolationInput): DissentError {
  return DissentError.modelOutputInvalid(input.operation, input.safeExplanation, {
    validationCategory: input.validationCategory,
    invariantCode: input.invariantCode,
    issuePath: input.issuePath,
    issues: [{ code: input.invariantCode, path: input.issuePath }],
    argumentStance: input.stance,
    safeExplanation: input.safeExplanation,
    ...(input.argumentPointIndex === undefined
      ? {}
      : { argumentPointIndex: input.argumentPointIndex }),
    ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
    ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
    ...(input.assumptionId ? { assumptionId: input.assumptionId } : {}),
    ...input.extra,
  });
}

const NUMERIC_FACT_PATTERN = /(?:[$€£¥]|\b\d+(?:[.,]\d+)?\b|%)/;
const PROHIBITED_TRADING_LANGUAGE_PATTERNS: readonly RegExp[] = [
  // Direct imperatives aimed at taking or closing an ETH/BTC position. Requiring
  // a trading object keeps descriptive nouns such as "sell-off" and "buy-side" valid.
  /^\s*(?:please\s+)?(?:buy|sell)\s+(?:(?:your|the|this)\s+(?:position|asset)|ETH|BTC)\b/i,
  /^\s*(?:please\s+)?(?:exit|close|open|enter)\s+(?:(?:your|the|this)\s+)?position\b/i,
  // Advice directed at the reader remains prohibited even when it is phrased politely.
  /\b(?:you|the user|the trader|the investor)\s+(?:should|must|need(?:s)?\s+to|ought\s+to|(?:are|is)\s+advised\s+to)\s+(?:buy|sell|exit|close|open|enter)\b/i,
  /\b(?:recommend|advise|urge)\s+(?:(?:that\s+)?you\s+)?(?:to\s+)?(?:buy|sell|buying|selling|exit|exiting|close|closing|open|opening)\b/i,
  /\b(?:correct|best|recommended)\s+(?:trade|action|decision|position)\s+(?:is|would\s+be)\s+(?:to\s+)?(?:buy|sell|exit|close|open|enter|PROCEED|WATCH|PASS)\b/i,
  // PROCEED/WATCH/PASS are human-decision values only when selected as a verdict.
  /^\s*(?:PROCEED|WATCH|PASS)\s*[.!]?\s*$/i,
  /\b(?:decision|verdict|recommendation)\s+(?:is|:)\s*(?:PROCEED|WATCH|PASS)\b/i,
  /\b(?:should|must|need(?:s)?\s+to|ought\s+to)\s+(?:select\s+|choose\s+)?(?:PROCEED|WATCH|PASS)\b/i,
  /\b(?:select|choose|pick)\s+(?:PROCEED|WATCH|PASS)\b/i,
  /\b(?:AI|model|system|I|we)\s+(?:(?:has|have)\s+)?(?:chosen|selected|decided(?:\s+on)?|recommend(?:s|ed)?)\s+(?:PROCEED|WATCH|PASS)\b/i,
  /^\s*PROCEED\s+(?:with|on)\b/i,
  /^\s*PASS\s+on\b/i,
  /^\s*WATCH\s+(?:this|the|your)\b/i,
];

function containsProhibitedTradingLanguage(value: string): boolean {
  return PROHIBITED_TRADING_LANGUAGE_PATTERNS.some((pattern) => pattern.test(value));
}

const SEMANTIC_EVIDENCE_RULES: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  absencePattern: RegExp;
  allowedTypes: ReadonlySet<EvidenceObservationTypeV1>;
}> = [
  {
    label: 'funding',
    pattern: /\b(?:funding|funding rate)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bfunding\b|\bfunding(?: rate)?(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['FUNDING_RATE']),
  },
  {
    label: 'open-interest',
    pattern: /\bopen interest\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bopen interest\b|\bopen interest(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['OPEN_INTEREST']),
  },
  {
    label: 'directional-positioning',
    pattern:
      /\b(?:directional (?:positioning|exposure)|traders? (?:are|is) net (?:long|short)(?:\s+(?:ETH|BTC))?)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bdirectional positioning\b|\bdirectional positioning(?: data| evidence| observations?| coverage)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set<EvidenceObservationTypeV1>(),
  },
  {
    label: 'institutional-participation',
    pattern: /\binstitutional (?:participation|positioning)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\binstitutional participation\b|\binstitutional participation(?: data| evidence| observations?| coverage)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set<EvidenceObservationTypeV1>(),
  },
  {
    label: 'crowding',
    pattern: /\b(?:crowding|crowded)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bcrowding\b|\bcrowding(?: data| evidence| observations?| coverage)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set<EvidenceObservationTypeV1>(),
  },
  {
    label: 'positioning',
    pattern: /\bpositioning\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bpositioning\b|\bpositioning(?: data| evidence| observations?| coverage)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['FUNDING_RATE', 'OPEN_INTEREST']),
  },
  {
    label: 'relative-return',
    pattern: /\brelative return\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\brelative return\b|\brelative return(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['RELATIVE_RETURN']),
  },
  {
    label: 'return-spread',
    pattern: /\breturn spread\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\breturn spread\b|\breturn spread(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['RETURN_SPREAD']),
  },
  {
    label: 'relative-performance',
    pattern: /\b(?:relative performance|outperform|underperform|relative momentum)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\b(?:relative performance|relative momentum)\b|\b(?:relative performance|relative momentum)(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['RELATIVE_RETURN', 'RETURN_SPREAD']),
  },
  {
    label: 'volume',
    pattern: /\bvolume\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\bvolume\b|\bvolume(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['BASE_VOLUME_24H']),
  },
];

const FORWARD_PERFORMANCE_ASSERTION_PATTERN =
  /\b(?:will|should|is expected to|is likely to|is certain to)\s+(?:outperform|underperform)\b/i;

const QUALIFIED_NON_ESTABLISHMENT_PATTERN =
  /\b(?:(?:do|does|did)\s+not\s+(?:(?:independently|alone|reliably)\s+|by itself\s+|on its own\s+)?(?:establish|prove|confirm|demonstrate|show)|(?:cannot|can't|could not|couldn't)\s+(?:(?:independently|alone|reliably)\s+|by itself\s+|on its own\s+)?(?:establish|prove|confirm|demonstrate|show)|(?:is|are|remain|remains)\s+(?:not\s+(?:established|proven|confirmed|demonstrated|shown)|unestablished|unknown|uncertain))\b/i;

function isQualifiedNonEstablishment(text: string, measurementPattern: RegExp): boolean {
  return text
    .split(/(?:[.;!?]|\bbut\b|\bhowever\b)/i)
    .some(
      (clause) =>
        measurementPattern.test(clause) &&
        QUALIFIED_NON_ESTABLISHMENT_PATTERN.test(clause)
    );
}

const EVIDENCE_CAPABILITIES: Record<
  EvidenceObservationTypeV1,
  { supports: string[]; limitations: string[] }
> = {
  LAST_PRICE: {
    supports: ['A point-in-time price for one market'],
    limitations: ['Does not establish price change, relative performance, or a future outcome'],
  },
  PRICE_CHANGE_24H: {
    supports: ['Historical price change for one market over its stated window'],
    limitations: ['Does not independently establish ETH/BTC relative performance or a future outcome'],
  },
  BASE_VOLUME_24H: {
    supports: ['Historical base-asset trading volume for one market'],
    limitations: ['Does not establish funding, open interest, relative performance, or a future outcome'],
  },
  CANDLE_OPEN: {
    supports: ['A historical candle-open price for one market and interval'],
    limitations: ['Does not independently establish a return, relative performance, or a future outcome'],
  },
  CANDLE_CLOSE: {
    supports: ['A historical candle-close price for one market and interval'],
    limitations: ['Does not independently establish a return, relative performance, or a future outcome'],
  },
  INTERVAL_PRICE_CHANGE: {
    supports: ['Historical price change for one market over the stated interval'],
    limitations: ['Does not independently establish ETH/BTC relative performance or a future outcome'],
  },
  RETURN_SPREAD: {
    supports: ['Aligned historical return difference between ETH and BTC'],
    limitations: ['Does not establish funding, open interest, sentiment, or a future outcome'],
  },
  RELATIVE_RETURN: {
    supports: ['Aligned historical ETH/BTC relative performance'],
    limitations: ['Does not establish funding, open interest, sentiment, or persistence into the future'],
  },
  FUNDING_RATE: {
    supports: ['A funding-rate snapshot for one perpetual-futures market'],
    limitations: [
      'Does not independently establish directional positioning, institutional participation, crowding, open interest, relative performance, or a future outcome',
    ],
  },
  OPEN_INTEREST: {
    supports: ['An open-interest snapshot for one perpetual-futures market'],
    limitations: [
      'Does not independently establish funding, directional positioning, institutional participation, crowding, or a future outcome',
    ],
  },
};

export type AuthorizedObservationSemantics = 'POINT_IN_TIME' | 'HISTORICAL_INTERVAL';

export interface AuthorizedFactualClaim {
  id: string;
  claimId: string;
  evidenceId: string;
  exactClaim: string;
  category: string;
  nature: EvidenceNatureV1;
  observationType: EvidenceObservationTypeV1;
  supportedMeasurement: EvidenceObservationTypeV1;
  market: string;
  instrumentType: MarketInstrumentTypeV1;
  observationSemantics: AuthorizedObservationSemantics;
  interval: string | null;
  periodStartAt: string | null;
  periodEndAt: string | null;
  value: string | number | undefined;
  unit: string | undefined;
  derivation: 'DIRECT' | 'DERIVED';
  derivedFromEvidenceIds: string[];
  supportsMeasurements: string[];
  measurementLimitations: string[];
  observedAt: string;
  retrievedAt: string;
  sourceName: string;
}

export type AuthorizedResearchLimitationKind =
  | 'NOT_ACQUIRED'
  | 'INFERENCE_NOT_ESTABLISHED'
  | 'STALE_OR_HORIZON_INSUFFICIENT';

export interface AuthorizedResearchLimitation {
  id: string;
  kind: AuthorizedResearchLimitationKind;
  dimension: string;
  exactWording: string;
  relatedEvidenceClaimIds: string[];
}

export function deterministicId(prefix: string, value: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${prefix}_${digest}`;
}

export function assertSafeModelAuthoredText(
  operation: string,
  values: Array<{ field: string; value: string }>,
  diagnosticContext: ArgumentDiagnosticContext = {}
): void {
  for (const { field, value } of values) {
    const pointIndexMatch = /^points\[(\d+)]/.exec(field);
    const argumentPointIndex = pointIndexMatch ? Number(pointIndexMatch[1]) : undefined;
    const argumentDetails = diagnosticContext.argumentStance
      ? {
          argumentStance: diagnosticContext.argumentStance,
          ...(argumentPointIndex === undefined ? {} : { argumentPointIndex }),
        }
      : {};
    if (NUMERIC_FACT_PATTERN.test(value)) {
      throw DissentError.modelOutputInvalid(
        operation,
        'Model-authored argument text contains numeric content; numeric facts must come from deterministic evidence quotations.',
        {
          validationCategory: 'MODEL_AUTHORED_TEXT_VALIDATION',
          invariantCode: 'MODEL_AUTHORED_TEXT_MUST_NOT_CONTAIN_NUMERIC_FACTS',
          issuePath: field,
          issues: [
            {
              code: 'MODEL_AUTHORED_TEXT_MUST_NOT_CONTAIN_NUMERIC_FACTS',
              path: field,
            },
          ],
          safeExplanation:
            'Model-authored text contained numeric content outside a deterministic evidence quotation.',
          ...argumentDetails,
        }
      );
    }
    if (containsProhibitedTradingLanguage(value)) {
      throw DissentError.modelOutputInvalid(
        operation,
        'Model-authored text contains prohibited trading-decision language.',
        {
          validationCategory: 'MODEL_AUTHORED_TEXT_VALIDATION',
          invariantCode: 'MODEL_AUTHORED_TEXT_MUST_NOT_CONTAIN_TRADING_DECISIONS',
          issuePath: field,
          issues: [
            {
              code: 'MODEL_AUTHORED_TEXT_MUST_NOT_CONTAIN_TRADING_DECISIONS',
              path: field,
            },
          ],
          safeExplanation: 'Model-authored text contained prohibited trading-decision language.',
          ...argumentDetails,
        }
      );
    }
  }
}

export function evidenceCatalog(ledger: EvidenceLedgerV1): AuthorizedFactualClaim[] {
  return ledger.items.map((item) => {
    const capabilities = EVIDENCE_CAPABILITIES[item.observation.type];
    const unitLimitation =
      item.metadata && typeof item.metadata.unitLimitation === 'string'
        ? [item.metadata.unitLimitation]
        : [];
    return {
      id: item.id,
      claimId: item.id,
      evidenceId: item.id,
      exactClaim: item.claim,
      category: item.category,
      nature: item.nature,
      observationType: item.observation.type,
      supportedMeasurement: item.observation.type,
      market: item.observation.market,
      instrumentType: item.observation.instrumentType,
      observationSemantics:
        item.observation.periodStartAt && item.observation.periodEndAt
          ? ('HISTORICAL_INTERVAL' as const)
          : ('POINT_IN_TIME' as const),
      interval: item.observation.interval ?? null,
      periodStartAt: item.observation.periodStartAt ?? null,
      periodEndAt: item.observation.periodEndAt ?? null,
      value: item.value,
      unit: item.unit,
      derivation: item.nature === 'DERIVED' ? ('DERIVED' as const) : ('DIRECT' as const),
      derivedFromEvidenceIds: [...item.derivedFromEvidenceIds],
      supportsMeasurements: capabilities.supports,
      measurementLimitations: [...capabilities.limitations, ...unitLimitation],
      observedAt: item.provenance.observedAt,
      retrievedAt: item.provenance.retrievedAt,
      sourceName: item.provenance.sourceName,
    };
  });
}

export function authorizedResearchLimitationCatalog(
  ledger: EvidenceLedgerV1
): AuthorizedResearchLimitation[] {
  const categories = new Set(ledger.items.map((item) => item.category));
  const sourceTypes = new Set(ledger.items.map((item) => item.provenance.sourceType));
  const observationTypes = new Set(ledger.items.map((item) => item.observation.type));
  const limitations: AuthorizedResearchLimitation[] = [];
  const addLimitation = (
    kind: AuthorizedResearchLimitationKind,
    dimension: string,
    exactWording: string,
    relatedEvidenceClaimIds: string[] = []
  ) => {
    limitations.push({
      id: deterministicId('lim', { kind, dimension, relatedEvidenceClaimIds }),
      kind,
      dimension,
      exactWording,
      relatedEvidenceClaimIds: [...relatedEvidenceClaimIds],
    });
  };

  if (!categories.has('MACRO_METRIC')) {
    addLimitation(
      'NOT_ACQUIRED',
      'MACRO_RESEARCH',
      'The evidence ledger contains no independent macroeconomic observations.'
    );
  }
  if (!sourceTypes.has('NEWS_WIRE')) {
    addLimitation(
      'NOT_ACQUIRED',
      'NEWS_RESEARCH',
      'The evidence ledger contains no independently sourced news-wire observations.'
    );
  }
  if (!categories.has('SENTIMENT_METRIC')) {
    addLimitation(
      'NOT_ACQUIRED',
      'SENTIMENT_RESEARCH',
      'The evidence ledger contains no independent sentiment observations.'
    );
  }
  if (observationTypes.has('FUNDING_RATE') || observationTypes.has('OPEN_INTEREST')) {
    const relatedEvidenceClaimIds = ledger.items
      .filter((item) =>
        ['FUNDING_RATE', 'OPEN_INTEREST'].includes(item.observation.type)
      )
      .map((item) => item.id);
    addLimitation(
      'INFERENCE_NOT_ESTABLISHED',
      'DIRECTIONAL_POSITIONING',
      'Available funding-rate and open-interest snapshots do not independently establish directional positioning, institutional participation, or crowding.',
      relatedEvidenceClaimIds
    );
  } else {
    addLimitation(
      'NOT_ACQUIRED',
      'DERIVATIVES_POSITIONING',
      'The evidence ledger contains no funding-rate or open-interest observations.'
    );
  }

  const historicalClaimIds = ledger.items
    .filter((item) => item.observation.periodStartAt && item.observation.periodEndAt)
    .map((item) => item.id);
  if (historicalClaimIds.length > 0) {
    addLimitation(
      'INFERENCE_NOT_ESTABLISHED',
      'FORWARD_PERSISTENCE',
      'Historical observations do not establish that the observed relationship will persist into the thesis horizon.',
      historicalClaimIds
    );
  }

  const staleClaimIds = ledger.items
    .filter((item) => deriveEvidenceFreshness(item, ledger.assembledAt).isStale)
    .map((item) => item.id);
  if (staleClaimIds.length > 0) {
    addLimitation(
      'STALE_OR_HORIZON_INSUFFICIENT',
      'EVIDENCE_FRESHNESS',
      'Some acquired observations are stale at ledger assembly and cannot establish current market conditions.',
      staleClaimIds
    );
  }

  return limitations;
}

export function deriveResearchLimitations(ledger: EvidenceLedgerV1): string[] {
  return authorizedResearchLimitationCatalog(ledger).map(
    (limitation) => `Research limitation: ${limitation.exactWording}`
  );
}

function assertSemanticEvidenceMatch(input: {
  operation: string;
  stance: ArgumentStanceV1;
  pointIndex: number;
  measurementText: string;
  interpretation: string;
  evidenceTypes: Set<EvidenceObservationTypeV1>;
  ledgerEvidenceTypes: Set<EvidenceObservationTypeV1>;
  evidenceIds: string[];
  targetAssumptionIds: string[];
}): void {
  if (FORWARD_PERFORMANCE_ASSERTION_PATTERN.test(input.interpretation)) {
    throw argumentViolation({
      operation: input.operation,
      stance: input.stance,
      validationCategory: 'ARGUMENT_TEMPORAL_GROUNDING',
      invariantCode: 'HISTORICAL_EVIDENCE_MUST_NOT_ESTABLISH_FORWARD_PERFORMANCE',
      issuePath: `points.${input.pointIndex}.qualitativeRationale`,
      safeExplanation:
        'A historical observation cannot establish a future relative-performance outcome.',
      argumentPointIndex: input.pointIndex,
      evidenceId: input.evidenceIds[0],
      evidenceIds: input.evidenceIds,
      assumptionId: input.targetAssumptionIds[0],
    });
  }

  for (const rule of SEMANTIC_EVIDENCE_RULES) {
    if (!rule.pattern.test(input.measurementText)) continue;
    const selectedEvidenceSupportsMeasurement = [...input.evidenceTypes].some((type) =>
      rule.allowedTypes.has(type)
    );
    const ledgerContainsMeasurement = [...input.ledgerEvidenceTypes].some((type) =>
      rule.allowedTypes.has(type)
    );
    if (rule.absencePattern.test(input.interpretation) && ledgerContainsMeasurement) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_RESEARCH_LIMITATION_VALIDATION',
        invariantCode: 'ARGUMENT_MUST_NOT_CLAIM_AVAILABLE_MEASUREMENT_IS_MISSING',
        issuePath: `points.${input.pointIndex}.qualitativeRationale`,
        safeExplanation:
          'An argument limitation claimed a measurement was unavailable even though the ledger contains it.',
        argumentPointIndex: input.pointIndex,
        evidenceId: input.evidenceIds[0],
        evidenceIds: input.evidenceIds,
        assumptionId: input.targetAssumptionIds[0],
        extra: { measurementRule: rule.label },
      });
    }
    if (isQualifiedNonEstablishment(input.interpretation, rule.pattern)) {
      continue;
    }
    if (!selectedEvidenceSupportsMeasurement) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_SEMANTIC_GROUNDING',
        invariantCode: 'ARGUMENT_MEASUREMENT_REQUIRES_MATCHING_EVIDENCE_TYPE',
        issuePath: `points.${input.pointIndex}.qualitativeRationale`,
        safeExplanation:
          'An argument interpretation named a measurement not supported by its selected evidence types.',
        argumentPointIndex: input.pointIndex,
        evidenceId: input.evidenceIds[0],
        evidenceIds: input.evidenceIds,
        assumptionId: input.targetAssumptionIds[0],
        extra: {
          measurementRule: rule.label,
          selectedEvidenceTypes: [...input.evidenceTypes].sort(),
          allowedEvidenceTypes: [...rule.allowedTypes].sort(),
        },
      });
    }
  }
}

export function materializeGroundedArgument(input: {
  operation: string;
  stance: ArgumentStanceV1;
  thesis: StructuredThesisV1;
  ledger: EvidenceLedgerV1;
  assumptions: AssumptionV1[];
  draft: ArgumentDraft;
  createdAt: string;
}): ArgumentV1 {
  const claimCatalog = evidenceCatalog(input.ledger);
  const claimById = new Map(claimCatalog.map((claim) => [claim.claimId, claim]));
  const evidenceById = new Map(input.ledger.items.map((item) => [item.id, item]));
  const limitationCatalog = authorizedResearchLimitationCatalog(input.ledger);
  const limitationById = new Map(
    limitationCatalog.map((limitation) => [limitation.id, limitation])
  );
  const assumptionIds = new Set(input.assumptions.map((item) => item.id));
  const modelText = [
    { field: 'summaryRationale', value: input.draft.summaryRationale },
    ...input.draft.points.flatMap((point, index) => [
      { field: `points[${index}].title`, value: point.title },
      {
        field: `points[${index}].qualitativeRationale`,
        value: point.qualitativeRationale,
      },
    ]),
  ];
  assertSafeModelAuthoredText(input.operation, modelText, {
    argumentStance: input.stance,
  });

  for (const [index, point] of input.draft.points.entries()) {
    for (const assumptionId of point.targetAssumptionIds) {
      if (!assumptionIds.has(assumptionId)) {
        throw argumentViolation({
          operation: input.operation,
          stance: input.stance,
          validationCategory: 'ARGUMENT_REFERENCE_VALIDATION',
          invariantCode: 'ARGUMENT_ASSUMPTION_UNKNOWN_REFERENCE',
          issuePath: `points.${index}.targetAssumptionIds`,
          safeExplanation:
            'An argument point referenced an assumption outside the supplied thesis assumptions.',
          argumentPointIndex: index,
          assumptionId,
        });
      }
    }
  }

  const evidenceDraftPoints = input.draft.points.flatMap((point, draftIndex) =>
    point.pointKind === 'EVIDENCE_INTERPRETATION' ? [{ point, draftIndex }] : []
  );
  if (evidenceDraftPoints.length === 0) {
    throw argumentViolation({
      operation: input.operation,
      stance: input.stance,
      validationCategory: 'ARGUMENT_STRUCTURAL_GROUNDING',
      invariantCode: 'ARGUMENT_REQUIRES_EVIDENCE_INTERPRETATION',
      issuePath: 'points',
      safeExplanation: 'An argument requires at least one evidence-interpretation point.',
    });
  }

  const relationLabels = {
    SUPPORTS: 'Supportive interpretation, not proof:',
    CHALLENGES: 'Challenging interpretation, not observed contradiction:',
    CONTEXT_ONLY: 'Contextual interpretation:',
    LIMITS_CONFIDENCE: 'Uncertainty interpretation:',
  } as const;

  const points = evidenceDraftPoints.map(({ point, draftIndex }, pointIndex) => {
    const claims = point.evidenceClaimIds.map((claimId) => {
      const claim = claimById.get(claimId);
      const evidence = evidenceById.get(claimId);
      if (!claim || !evidence) {
        throw argumentViolation({
          operation: input.operation,
          stance: input.stance,
          validationCategory: 'ARGUMENT_REFERENCE_VALIDATION',
          invariantCode: 'ARGUMENT_CLAIM_UNKNOWN_REFERENCE',
          issuePath: `points.${draftIndex}.evidenceClaimIds`,
          safeExplanation: 'An argument point referenced a claim outside the authorized catalog.',
          argumentPointIndex: draftIndex,
          evidenceId: claimId,
          evidenceIds: point.evidenceClaimIds,
        });
      }
      return { claim, evidence };
    });
    if (
      point.relation === 'SUPPORTS' &&
      claims.every(({ evidence }) => evidence.stance === 'CONTRADICTING')
    ) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_RELATION_VALIDATION',
        invariantCode: 'SUPPORTS_RELATION_REQUIRES_NON_CONTRADICTING_EVIDENCE',
        issuePath: `points.${draftIndex}.relation`,
        safeExplanation:
          'A supportive interpretation cannot rely exclusively on explicitly contradicting evidence.',
        argumentPointIndex: draftIndex,
        evidenceId: point.evidenceClaimIds[0],
        evidenceIds: point.evidenceClaimIds,
        assumptionId: point.targetAssumptionIds[0],
      });
    }
    assertSemanticEvidenceMatch({
      operation: input.operation,
      stance: input.stance,
      pointIndex: draftIndex,
      measurementText: point.qualitativeRationale,
      interpretation: point.qualitativeRationale,
      evidenceTypes: new Set(
        claims.map(({ claim }) => claim.supportedMeasurement)
      ),
      ledgerEvidenceTypes: new Set(
        input.ledger.items.map((item) => item.observation.type)
      ),
      evidenceIds: point.evidenceClaimIds,
      targetAssumptionIds: point.targetAssumptionIds,
    });

    const exactEvidence = claims
      .map(({ claim }) => `[${claim.evidenceId}] ${claim.exactClaim}`)
      .join('\n');
    return {
      id: deterministicId('argp', {
        thesisId: input.thesis.id,
        stance: input.stance,
        pointIndex,
        evidenceClaimIds: point.evidenceClaimIds,
        relation: point.relation,
        qualitativeRationale: point.qualitativeRationale,
      }),
      title: point.title,
      reasoning: `Evidence:\n${exactEvidence}\nInterpretation: ${relationLabels[point.relation]} ${point.qualitativeRationale}`,
      evidenceIds: [...point.evidenceClaimIds],
      targetAssumptionIds: [...point.targetAssumptionIds],
      weight: point.weight,
    };
  });

  const selectedLimitations = input.draft.points.flatMap((point, index) => {
    if (point.pointKind !== 'RESEARCH_LIMITATION') return [];
    const limitation = limitationById.get(point.researchLimitationId);
    if (!limitation) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_REFERENCE_VALIDATION',
        invariantCode: 'ARGUMENT_LIMITATION_UNKNOWN_REFERENCE',
        issuePath: `points.${index}.researchLimitationId`,
        safeExplanation:
          'An argument point referenced a limitation outside the authorized catalog.',
        argumentPointIndex: index,
        assumptionId: point.targetAssumptionIds[0],
      });
    }
    return [
      {
        id: limitation.id,
        text: `Research limitation (${limitation.kind}; ${point.weight}): ${limitation.exactWording}\nRelevance: ${point.qualitativeRationale}`,
      },
    ];
  });
  const selectedLimitationIds = new Set(selectedLimitations.map((item) => item.id));
  const unselectedLimitations = limitationCatalog
    .filter((limitation) => !selectedLimitationIds.has(limitation.id))
    .map((limitation) => `Research limitation: ${limitation.exactWording}`);

  const assembledArgument = {
    id: deterministicId('arg', {
      thesisId: input.thesis.id,
      stance: input.stance,
      points: points.map((point) => point.id),
      summary: input.draft.summaryRationale,
    }),
    thesisId: input.thesis.id,
    stance: input.stance,
    summary: `Evidence-bound interpretation: ${input.draft.summaryRationale}`,
    points,
    risksOrCounterweightsConsidered: [
      ...selectedLimitations.map((item) => item.text),
      ...unselectedLimitations,
    ],
    createdAt: input.createdAt,
    schemaVersion: 1,
  };
  const parsedArgument = ArgumentV1Schema.safeParse(assembledArgument);
  if (!parsedArgument.success) {
    const issues = parsedArgument.error.issues.map((issue) => ({
      code: issue.code,
      path: ['argument', ...issue.path.map(String)].join('.'),
    }));
    throw DissentError.modelOutputInvalid(
      input.operation,
      'The server-assembled argument violated the authoritative ArgumentV1 contract.',
      {
        validationCategory: 'ARGUMENT_DOMAIN_CONTRACT_VALIDATION',
        invariantCode: 'SERVER_ASSEMBLED_ARGUMENT_MUST_SATISFY_ARGUMENT_V1',
        issuePath: issues[0]?.path ?? 'argument',
        issues,
        argumentStance: input.stance,
        safeExplanation:
          'The server-assembled argument violated the authoritative argument contract.',
      }
    );
  }
  const argument = parsedArgument.data;
  try {
    assertArgumentEvidenceGrounding(argument, input.ledger);
  } catch (cause) {
    throw DissentError.modelOutputInvalid(
      input.operation,
      'The server-assembled argument failed evidence-grounding validation.',
      {
        validationCategory: 'ARGUMENT_DOMAIN_VALIDATION',
        invariantCode: 'ARGUMENT_MUST_REFERENCE_LEDGER_EVIDENCE',
        issuePath: 'argument.points',
        issues: [
          { code: 'ARGUMENT_MUST_REFERENCE_LEDGER_EVIDENCE', path: 'argument.points' },
        ],
        argumentStance: input.stance,
        safeExplanation:
          'The server-assembled argument did not remain grounded in the supplied evidence ledger.',
        causeCode: cause instanceof DissentError ? cause.code : 'UNKNOWN',
      }
    );
  }
  return argument;
}
