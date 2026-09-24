import { createHash } from 'node:crypto';
import { ArgumentV1Schema, type ArgumentStanceV1, type ArgumentV1 } from '@/core/contracts/argument';
import type { AssumptionCategoryV1, AssumptionV1 } from '@/core/contracts/assumption';
import {
  deriveEvidenceFreshness,
  EvidenceObservationTypeV1Schema,
  type EvidenceLedgerV1,
  type EvidenceNatureV1,
  type EvidenceObservationTypeV1,
  type EvidenceStanceV1,
  type MarketInstrumentTypeV1,
} from '@/core/contracts/evidence';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertArgumentEvidenceGrounding } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import type { z } from 'zod';
import {
  ARGUMENT_SELECTION_SLOT_NAMES,
  ArgumentDraftOutputSchema,
  type ArgumentSelectionPlan,
} from './ai-output.schemas';

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
  // Direct imperatives aimed at taking or closing a supported-asset position. Requiring
  // a trading object keeps descriptive nouns such as "sell-off" and "buy-side" valid.
  /^\s*(?:please\s+)?(?:buy|sell)\s+(?:(?:your|the|this)\s+(?:position|asset)|ETH|BTC|SOL|NVDA)\b/i,
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
      /\b(?:directional (?:positioning|exposure)|traders? (?:are|is) net (?:long|short)(?:\s+(?:ETH|BTC|SOL))?)\b/i,
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
    allowedTypes: new Set(['BASE_VOLUME_24H', 'SESSION_VOLUME']),
  },
  {
    label: 'market-capitalization',
    pattern: /\b(?:market capitalization|market cap)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\b(?:market capitalization|market cap)\b|\b(?:market capitalization|market cap)(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set(['MARKET_CAPITALIZATION']),
  },
  {
    label: 'valuation-multiple',
    pattern:
      /\b(?:valuation multiple|price-to-earnings|trailing P\/E|last year reported P\/E|price-to-book|EV\/EBITDA|enterprise multiple|price-to-sales)\b/i,
    absencePattern:
      /(?:\b(?:no|missing|absent|unavailable)\b[^.]{0,50}\b(?:valuation multiple|earnings multiple|P\/E|price-to-earnings)\b|\b(?:valuation multiple|earnings multiple|P\/E|price-to-earnings)(?: data| evidence| observations?)?\b[^.]{0,30}\b(?:missing|absent|unavailable)\b)/i,
    allowedTypes: new Set([
      'VALUATION_PE_TTM',
      'VALUATION_PE_LYR',
      'VALUATION_PB_RATIO',
      'VALUATION_EV_EBITDA',
      'VALUATION_PS_TTM',
    ]),
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
    limitations: ['Does not independently establish cross-asset relative performance or a future outcome'],
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
    limitations: ['Does not independently establish cross-asset relative performance or a future outcome'],
  },
  RETURN_SPREAD: {
    supports: ['Aligned historical return difference between two researched assets'],
    limitations: ['Does not establish funding, open interest, sentiment, or a future outcome'],
  },
  RELATIVE_RETURN: {
    supports: ['Aligned historical relative performance between two researched assets'],
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
  SESSION_PRICE_CHANGE: {
    supports: ['Source-reported session price change for one equity market relative to previous close'],
    limitations: [
      'Does not verify live trade execution or regular-session closing status, and does not establish fair value, forward continuation, or a future stock return',
    ],
  },
  SESSION_VOLUME: {
    supports: ['Source-reported session trading volume for one equity market'],
    limitations: [
      'Does not establish market liquidity depth, buyer accumulation, institutional participation, investor positioning, or a future outcome',
    ],
  },
  MARKET_CAPITALIZATION: {
    supports: ['Source-reported total market capitalization for one equity issuer'],
    limitations: [
      'Reflects aggregate equity valuation scale but does not establish market liquidity, trading depth, institutional participation, investor positioning, or future returns',
    ],
  },
  VALUATION_PE_TTM: {
    supports: ['Trailing twelve-month price-to-earnings multiple for one equity issuer based on source-reported period'],
    limitations: [
      'Does not independently prove SEC filing dates, financial-report provenance, fair value, forward earnings growth, data-center demand, or future stock returns',
    ],
  },
  VALUATION_PE_LYR: {
    supports: ['Last year reported price-to-earnings multiple for one equity issuer based on source-reported period'],
    limitations: [
      'Historical backward-looking accounting ratio; does not independently prove SEC filing dates, fair value, forward earnings growth, recent quarterly changes, or future stock returns',
    ],
  },
  VALUATION_PB_RATIO: {
    supports: ['Price-to-book multiple for one equity issuer based on source-reported period'],
    limitations: [
      'Does not independently prove SEC filing dates, fair value, intangible asset value, return on capital, or future stock returns',
    ],
  },
  VALUATION_EV_EBITDA: {
    supports: ['Enterprise value to EBITDA multiple for one equity issuer based on source-reported period'],
    limitations: [
      'Provides capital-structure-neutral operating valuation but does not independently prove SEC filing dates, fair value, future free cash flow, capital expenditure demands, or future stock returns',
    ],
  },
  VALUATION_PS_TTM: {
    supports: ['Trailing twelve-month price-to-sales multiple for one equity issuer based on source-reported period'],
    limitations: [
      'Reflects top-line valuation scale but does not independently prove SEC filing dates, fair value, operating margins, gross-margin expansion, bottom-line profitability, or forward growth',
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
  observedAt: string | null;
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

export interface EvidenceObservationCoverage {
  observationType: EvidenceObservationTypeV1;
  present: boolean;
  observationCount: number;
  markets: string[];
  repeatedObservationMarkets: string[];
}

/**
 * Server-owned coverage facts for model-facing research-gap analysis. A type can
 * be present while still lacking repeated observations for every individual
 * market; these are deliberately separate facts.
 */
export function evidenceObservationCoverage(
  ledger: EvidenceLedgerV1
): EvidenceObservationCoverage[] {
  return EvidenceObservationTypeV1Schema.options.map((observationType) => {
    const matchingItems = ledger.items.filter(
      (item) => item.observation.type === observationType
    );
    const observationInstancesByMarket = new Map<string, Set<string>>();
    for (const item of matchingItems) {
      const observationInstance = item.observation.periodStartAt
        ? `${item.observation.periodStartAt}/${item.observation.periodEndAt}`
        : item.provenance.observedAt ?? item.provenance.retrievedAt;
      const marketInstances =
        observationInstancesByMarket.get(item.observation.market) ?? new Set<string>();
      marketInstances.add(observationInstance);
      observationInstancesByMarket.set(item.observation.market, marketInstances);
    }
    return {
      observationType,
      present: matchingItems.length > 0,
      observationCount: matchingItems.length,
      markets: [...observationInstancesByMarket.keys()].sort(),
      repeatedObservationMarkets: [...observationInstancesByMarket.entries()]
        .filter(([, instances]) => instances.size > 1)
        .map(([market]) => market)
        .sort(),
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

  const unknownObservationTimeClaimIds = ledger.items
    .filter((item) => item.provenance.freshnessMode === 'UNKNOWN_OBSERVATION_TIME')
    .map((item) => item.id);
  if (unknownObservationTimeClaimIds.length > 0) {
    addLimitation(
      'NOT_ACQUIRED',
      'OBSERVATION_TIMESTAMP',
      'Exchange quote observations lack an authentic execution timestamp and reflect only retrieval time, without verifying live trade execution or regular-session closing status.',
      unknownObservationTimeClaimIds
    );
  }

  if (categories.has('VALUATION_METRIC')) {
    const valuationClaimIds = ledger.items
      .filter((item) => item.category === 'VALUATION_METRIC')
      .map((item) => item.id);
    addLimitation(
      'INFERENCE_NOT_ESTABLISHED',
      'VALUATION_PROVENANCE',
      'Source-provided valuation dates and metrics reflect external provider reporting periods and do not independently verify SEC filing dates, specific accounting statement provenance, or forward business catalysts.',
      valuationClaimIds
    );
  }

  const historicalClaimIds = ledger.items
    .filter(
      (item) =>
        (item.observation.periodStartAt && item.observation.periodEndAt) ||
        item.provenance.freshnessMode === 'HISTORICAL_RECORD'
    )
    .map((item) => item.id);
  if (historicalClaimIds.length > 0) {
    addLimitation(
      'INFERENCE_NOT_ESTABLISHED',
      'FORWARD_PERSISTENCE',
      'Historical observations do not establish that the observed behavior or relationship will persist into the thesis horizon.',
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

export const ARGUMENT_OPTION_CATALOG_MAX_ITEMS = 12;

export type ArgumentInterpretationKind =
  | 'RELATIVE_RETURN_OBSERVATION'
  | 'RETURN_SPREAD_OBSERVATION'
  | 'SINGLE_MARKET_PRICE_CONTEXT'
  | 'SINGLE_ASSET_HISTORICAL_PRICE_OBSERVATION'
  | 'FUNDING_RATE_CONTEXT'
  | 'OPEN_INTEREST_CONTEXT'
  | 'VOLUME_CONTEXT'
  | 'POINT_IN_TIME_PRICE_CONTEXT'
  | 'VALUATION_METRIC_CONTEXT'
  | 'DIRECTIONAL_POSITIONING_NOT_ESTABLISHED'
  | 'FORWARD_PERSISTENCE_NOT_ESTABLISHED'
  | 'RESEARCH_LIMITATION';

export interface AuthorizedArgumentPointOption {
  optionId: string;
  targetAssumptionId: string;
  interpretationKind: ArgumentInterpretationKind;
  allowedStance: ArgumentStanceV1;
  evidenceClaimIds: string[];
  relation: 'SUPPORTS' | 'CHALLENGES' | 'CONTEXT_ONLY' | 'LIMITS_CONFIDENCE';
  title: string;
  qualitativeInterpretation: string;
}

const OBSERVATION_ASSUMPTION_PREFERENCES: Record<
  EvidenceObservationTypeV1,
  readonly AssumptionCategoryV1[]
> = {
  LAST_PRICE: ['MARKET_REGIME', 'OTHER'],
  PRICE_CHANGE_24H: ['MARKET_REGIME', 'CORRELATION', 'OTHER'],
  BASE_VOLUME_24H: ['LIQUIDITY', 'MICROSTRUCTURE', 'OTHER'],
  CANDLE_OPEN: ['MARKET_REGIME', 'OTHER'],
  CANDLE_CLOSE: ['MARKET_REGIME', 'OTHER'],
  INTERVAL_PRICE_CHANGE: ['MARKET_REGIME', 'CORRELATION', 'OTHER'],
  RETURN_SPREAD: ['CORRELATION', 'MARKET_REGIME', 'OTHER'],
  RELATIVE_RETURN: ['CORRELATION', 'MARKET_REGIME', 'OTHER'],
  FUNDING_RATE: ['POSITIONING', 'MICROSTRUCTURE', 'OTHER'],
  OPEN_INTEREST: ['POSITIONING', 'LIQUIDITY', 'OTHER'],
  SESSION_PRICE_CHANGE: ['MARKET_REGIME', 'CORRELATION', 'OTHER'],
  SESSION_VOLUME: ['LIQUIDITY', 'MICROSTRUCTURE', 'OTHER'],
  MARKET_CAPITALIZATION: ['MARKET_REGIME', 'OTHER'],
  VALUATION_PE_TTM: ['MARKET_REGIME', 'OTHER'],
  VALUATION_PE_LYR: ['MARKET_REGIME', 'OTHER'],
  VALUATION_PB_RATIO: ['MARKET_REGIME', 'OTHER'],
  VALUATION_EV_EBITDA: ['MARKET_REGIME', 'OTHER'],
  VALUATION_PS_TTM: ['MARKET_REGIME', 'OTHER'],
};

const LIMITATION_ASSUMPTION_PREFERENCES: Record<
  string,
  readonly AssumptionCategoryV1[]
> = {
  MACRO_RESEARCH: ['MACRO', 'MARKET_REGIME', 'OTHER'],
  NEWS_RESEARCH: ['CATALYST_TIMING', 'MARKET_REGIME', 'OTHER'],
  SENTIMENT_RESEARCH: ['MARKET_REGIME', 'OTHER'],
  DIRECTIONAL_POSITIONING: ['POSITIONING', 'MICROSTRUCTURE', 'OTHER'],
  DERIVATIVES_POSITIONING: ['POSITIONING', 'MICROSTRUCTURE', 'OTHER'],
  FORWARD_PERSISTENCE: ['CATALYST_TIMING', 'MARKET_REGIME', 'OTHER'],
  EVIDENCE_FRESHNESS: ['CATALYST_TIMING', 'MARKET_REGIME', 'OTHER'],
  OBSERVATION_TIMESTAMP: ['MARKET_REGIME', 'OTHER'],
  VALUATION_PROVENANCE: ['MARKET_REGIME', 'OTHER'],
};

function selectBoundAssumption(
  assumptions: readonly AssumptionV1[],
  preferredCategories: readonly AssumptionCategoryV1[],
  relatedAssumptionIds: readonly string[] = []
): AssumptionV1 {
  const relatedIds = new Set(relatedAssumptionIds);
  const explicitlyRelated = assumptions.find((assumption) => relatedIds.has(assumption.id));
  if (explicitlyRelated) return explicitlyRelated;
  for (const category of preferredCategories) {
    const matching = assumptions.find((assumption) => assumption.category === category);
    if (matching) return matching;
  }
  const fallback = assumptions[0];
  if (!fallback) {
    throw DissentError.invalidInput('Argument option construction requires an assumption.');
  }
  return fallback;
}

function observationInterpretation(
  observationType: EvidenceObservationTypeV1,
  thesis: StructuredThesisV1
): Pick<AuthorizedArgumentPointOption, 'interpretationKind' | 'title'> & {
  measurementText: string;
} {
  const relative = thesis.direction === 'RELATIVE_LONG' || thesis.direction === 'RELATIVE_SHORT';
  const comparison = thesis.market;
  switch (observationType) {
    case 'RELATIVE_RETURN':
      return {
        interpretationKind: 'RELATIVE_RETURN_OBSERVATION',
        title: `Observed ${comparison} relative return`,
        measurementText:
          `The aligned historical ${comparison} relative return measures relative performance directly while remaining historical evidence.`,
      };
    case 'RETURN_SPREAD':
      return {
        interpretationKind: 'RETURN_SPREAD_OBSERVATION',
        title: `Observed ${thesis.baseAsset} and ${thesis.quoteAsset} return spread`,
        measurementText:
          `The aligned historical return spread measures the difference between ${thesis.baseAsset} and ${thesis.quoteAsset} returns in percentage points, not the percentage change of the ${comparison} ratio.`,
      };
    case 'PRICE_CHANGE_24H':
    case 'INTERVAL_PRICE_CHANGE':
      return {
        interpretationKind: relative
          ? 'SINGLE_MARKET_PRICE_CONTEXT'
          : 'SINGLE_ASSET_HISTORICAL_PRICE_OBSERVATION',
        title: relative
          ? 'Single-market historical price context'
          : `Observed ${thesis.baseAsset} historical price behavior`,
        measurementText:
          relative
            ? `The single-market historical price change provides context but does not establish ${comparison} relative performance or a future outcome.`
            : `The historical ${thesis.baseAsset} price change measures past behavior but does not establish future direction or persistence.`,
      };
    case 'SESSION_PRICE_CHANGE':
      return {
        interpretationKind: relative
          ? 'SINGLE_MARKET_PRICE_CONTEXT'
          : 'SINGLE_ASSET_HISTORICAL_PRICE_OBSERVATION',
        title: `Observed ${thesis.baseAsset} session price change`,
        measurementText:
          `The observed ${thesis.baseAsset} session price change reflects source-reported price change relative to previous close, but does not verify live trade execution, regular-session closing status, future price continuation, or fundamental valuation.`,
      };
    case 'FUNDING_RATE':
      return {
        interpretationKind: 'FUNDING_RATE_CONTEXT',
        title: 'Observed funding-rate context',
        measurementText:
          'The funding-rate observation provides derivatives context but does not establish directional positioning, institutional participation, crowding, relative performance, or a future outcome.',
      };
    case 'OPEN_INTEREST':
      return {
        interpretationKind: 'OPEN_INTEREST_CONTEXT',
        title: 'Observed open-interest context',
        measurementText:
          'The open-interest observation provides derivatives context but does not establish directional positioning, institutional participation, crowding, relative performance, or a future outcome.',
      };
    case 'BASE_VOLUME_24H':
      return {
        interpretationKind: 'VOLUME_CONTEXT',
        title: 'Observed trading-volume context',
        measurementText:
          'The historical volume observation provides market-activity context and does not establish relative performance or a future outcome.',
      };
    case 'SESSION_VOLUME':
      return {
        interpretationKind: 'VOLUME_CONTEXT',
        title: `Observed ${thesis.baseAsset} session trading volume`,
        measurementText:
          `The observed ${thesis.baseAsset} session volume reflects source-reported trading volume but does not establish buyer accumulation, liquidity depth, institutional participation, or investor positioning.`,
      };
    case 'LAST_PRICE':
    case 'CANDLE_OPEN':
    case 'CANDLE_CLOSE':
      return {
        interpretationKind: 'POINT_IN_TIME_PRICE_CONTEXT',
        title: 'Observed market-price context',
        measurementText:
          'The observed market price provides bounded context and does not establish price change, relative performance, or a future outcome.',
      };
    case 'MARKET_CAPITALIZATION':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} market capitalization`,
        measurementText:
          `The observed ${thesis.baseAsset} total market capitalization reflects aggregate equity valuation scale but does not establish market liquidity, trading depth, institutional participation, investor positioning, or future returns.`,
      };
    case 'VALUATION_PE_TTM':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} trailing twelve-month P/E multiple`,
        measurementText:
          `The trailing twelve-month P/E multiple measures current equity price relative to past net income for the source-reported period, but does not independently verify SEC filing dates, fair value, forward earnings growth, data-center demand, or future stock returns.`,
      };
    case 'VALUATION_PE_LYR':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} last year reported P/E multiple`,
        measurementText:
          `The last year reported P/E ratio measures valuation against historical fiscal-year earnings for the source-reported period, but does not independently verify SEC filing dates, fair value, forward earnings growth, recent quarterly changes, or future stock returns.`,
      };
    case 'VALUATION_PB_RATIO':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} price-to-book multiple`,
        measurementText:
          `The observed price-to-book multiple measures equity price relative to balance-sheet net assets for the source-reported period, but does not independently verify SEC filing dates, fair value, intangible asset value, return on capital, or future stock returns.`,
      };
    case 'VALUATION_EV_EBITDA':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} enterprise value multiple`,
        measurementText:
          `The observed enterprise value to EBITDA multiple provides capital-structure-neutral operating valuation for the source-reported period, but does not independently verify SEC filing dates, fair value, future free cash flow, capital expenditure intensity, or future stock returns.`,
      };
    case 'VALUATION_PS_TTM':
      return {
        interpretationKind: 'VALUATION_METRIC_CONTEXT',
        title: `Observed ${thesis.baseAsset} price-to-sales multiple`,
        measurementText:
          `The observed trailing twelve-month price-to-sales multiple reflects top-line valuation scale for the source-reported period, but does not independently verify SEC filing dates, fair value, operating margins, gross-margin expansion, bottom-line profitability, or forward growth.`,
      };
  }
}

function optionRelation(
  stance: ArgumentStanceV1,
  evidenceStance: EvidenceStanceV1,
  supportsRelativeThesis: boolean
): AuthorizedArgumentPointOption['relation'] {
  if (!supportsRelativeThesis) {
    return stance === 'DISSENTER' ? 'LIMITS_CONFIDENCE' : 'CONTEXT_ONLY';
  }
  if (stance === 'ADVOCATE') {
    return evidenceStance === 'SUPPORTING'
      ? 'SUPPORTS'
      : evidenceStance === 'CONTRADICTING'
        ? 'LIMITS_CONFIDENCE'
        : 'CONTEXT_ONLY';
  }
  return evidenceStance === 'CONTRADICTING'
    ? 'CHALLENGES'
    : evidenceStance === 'SUPPORTING'
      ? 'LIMITS_CONFIDENCE'
      : 'CONTEXT_ONLY';
}

function relationInterpretation(
  measurementText: string,
  relation: AuthorizedArgumentPointOption['relation']
): string {
  switch (relation) {
    case 'SUPPORTS':
      return `${measurementText} It is consistent with the selected thesis assumption but does not prove persistence.`;
    case 'CHALLENGES':
      return `${measurementText} It creates evidence-bounded tension with the selected thesis assumption without proving the opposite outcome.`;
    case 'LIMITS_CONFIDENCE':
      return `${measurementText} Its scope therefore limits confidence in the selected thesis assumption.`;
    case 'CONTEXT_ONLY':
      return `${measurementText} It remains contextual rather than independently probative for the selected thesis assumption.`;
  }
}

function createAuthorizedOption(input: Omit<AuthorizedArgumentPointOption, 'optionId'> & {
  thesisId: string;
}): AuthorizedArgumentPointOption {
  const { thesisId, ...option } = input;
  assertSafeModelAuthoredText(
    input.allowedStance === 'ADVOCATE' ? 'buildAdvocateCase' : 'buildDissentCase',
    [
      { field: 'serverOption.title', value: option.title },
      {
        field: 'serverOption.qualitativeInterpretation',
        value: option.qualitativeInterpretation,
      },
    ],
    { argumentStance: input.allowedStance }
  );
  if (option.title.length > 120 || option.qualitativeInterpretation.length > 500) {
    throw DissentError.analysisFailed(
      'ARGUING',
      'A server-issued argument option exceeded its bounded prose contract.'
    );
  }
  return {
    optionId: deterministicId('argopt', { thesisId, ...option }),
    ...option,
  };
}

function catalogRelationPriority(
  stance: ArgumentStanceV1,
  relation: AuthorizedArgumentPointOption['relation']
): number {
  const priorities =
    stance === 'ADVOCATE'
      ? { SUPPORTS: 0, CONTEXT_ONLY: 1, LIMITS_CONFIDENCE: 2, CHALLENGES: 3 }
      : { CHALLENGES: 0, LIMITS_CONFIDENCE: 1, CONTEXT_ONLY: 2, SUPPORTS: 3 };
  return priorities[relation];
}

export function authorizedArgumentPointCatalog(input: {
  thesis: StructuredThesisV1;
  ledger: EvidenceLedgerV1;
  assumptions: AssumptionV1[];
  stance: ArgumentStanceV1;
}): AuthorizedArgumentPointOption[] {
  if (input.assumptions.length === 0) {
    throw DissentError.invalidInput('Argument option construction requires assumptions.');
  }
  const relativeThesis =
    input.thesis.direction === 'RELATIVE_LONG' ||
    input.thesis.direction === 'RELATIVE_SHORT';
  const factualClaims = evidenceCatalog(input.ledger).filter(
    (claim) =>
      relativeThesis ||
      (claim.observationType !== 'RELATIVE_RETURN' &&
        claim.observationType !== 'RETURN_SPREAD')
  );
  const authorizedFactualClaimIds = new Set(
    factualClaims.map((claim) => claim.claimId)
  );
  const evidenceById = new Map(input.ledger.items.map((item) => [item.id, item]));
  const options = factualClaims.map((claim) => {
    const evidence = evidenceById.get(claim.evidenceId);
    if (!evidence) {
      throw DissentError.invalidInput(
        `Authorized claim ${claim.claimId} has no matching ledger evidence.`
      );
    }
    const semantics = observationInterpretation(claim.observationType, input.thesis);
    const supportsRelativeThesis =
      relativeThesis
        ? claim.observationType === 'RELATIVE_RETURN' ||
          claim.observationType === 'RETURN_SPREAD'
        : claim.observationType === 'PRICE_CHANGE_24H' ||
          claim.observationType === 'INTERVAL_PRICE_CHANGE' ||
          claim.observationType === 'SESSION_PRICE_CHANGE';
    const relation = optionRelation(input.stance, evidence.stance, supportsRelativeThesis);
    const targetAssumption = selectBoundAssumption(
      input.assumptions,
      OBSERVATION_ASSUMPTION_PREFERENCES[claim.observationType],
      evidence.relatedAssumptionIds
    );
    return createAuthorizedOption({
      thesisId: input.thesis.id,
      targetAssumptionId: targetAssumption.id,
      interpretationKind: semantics.interpretationKind,
      allowedStance: input.stance,
      evidenceClaimIds: [claim.claimId],
      relation,
      title: semantics.title,
      qualitativeInterpretation: relationInterpretation(
        semantics.measurementText,
        relation
      ),
    });
  });

  if (input.stance === 'DISSENTER') {
    for (const limitation of authorizedResearchLimitationCatalog(input.ledger)) {
      const relatedEvidenceClaimIds = limitation.relatedEvidenceClaimIds
        .filter((claimId) => authorizedFactualClaimIds.has(claimId))
        .slice(0, 4);
      if (relatedEvidenceClaimIds.length === 0) continue;
      const targetAssumption = selectBoundAssumption(
        input.assumptions,
        LIMITATION_ASSUMPTION_PREFERENCES[limitation.dimension] ?? ['OTHER']
      );
      const interpretationKind: ArgumentInterpretationKind =
        limitation.dimension === 'DIRECTIONAL_POSITIONING'
          ? 'DIRECTIONAL_POSITIONING_NOT_ESTABLISHED'
          : limitation.dimension === 'FORWARD_PERSISTENCE'
            ? 'FORWARD_PERSISTENCE_NOT_ESTABLISHED'
            : 'RESEARCH_LIMITATION';
      const title =
        limitation.dimension === 'DIRECTIONAL_POSITIONING'
          ? 'Directional positioning remains unestablished'
          : limitation.dimension === 'FORWARD_PERSISTENCE'
            ? 'Forward persistence remains unestablished'
            : 'Authorized research limitation';
      options.push(
        createAuthorizedOption({
          thesisId: input.thesis.id,
          targetAssumptionId: targetAssumption.id,
          interpretationKind,
          allowedStance: input.stance,
          evidenceClaimIds: relatedEvidenceClaimIds,
          relation: 'LIMITS_CONFIDENCE',
          title,
          qualitativeInterpretation: limitation.exactWording,
        })
      );
    }
  }

  return options
    .sort((left, right) => {
      const relationDifference =
        catalogRelationPriority(input.stance, left.relation) -
        catalogRelationPriority(input.stance, right.relation);
      if (relationDifference !== 0) return relationDifference;
      const kindDifference = left.interpretationKind.localeCompare(
        right.interpretationKind
      );
      return kindDifference !== 0
        ? kindDifference
        : left.optionId.localeCompare(right.optionId);
    })
    .slice(0, ARGUMENT_OPTION_CATALOG_MAX_ITEMS);
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

const ARGUMENT_SLOT_WEIGHTS = {
  primary: 'PRIMARY',
  secondaryA: 'SECONDARY',
  secondaryB: 'SECONDARY',
  contextualA: 'CONTEXTUAL',
  contextualB: 'CONTEXTUAL',
} as const;

function interpretationKindLabel(kind: ArgumentInterpretationKind): string {
  switch (kind) {
    case 'RELATIVE_RETURN_OBSERVATION':
      return 'aligned relative-return evidence';
    case 'RETURN_SPREAD_OBSERVATION':
      return 'aligned return-spread evidence';
    case 'SINGLE_MARKET_PRICE_CONTEXT':
      return 'single-market price context';
    case 'SINGLE_ASSET_HISTORICAL_PRICE_OBSERVATION':
      return 'single-asset historical price evidence';
    case 'FUNDING_RATE_CONTEXT':
      return 'funding-rate context';
    case 'OPEN_INTEREST_CONTEXT':
      return 'open-interest context';
    case 'VOLUME_CONTEXT':
      return 'trading-volume context';
    case 'POINT_IN_TIME_PRICE_CONTEXT':
      return 'point-in-time price context';
    case 'VALUATION_METRIC_CONTEXT':
      return 'valuation-metric context';
    case 'DIRECTIONAL_POSITIONING_NOT_ESTABLISHED':
      return 'the directional-positioning evidence limitation';
    case 'FORWARD_PERSISTENCE_NOT_ESTABLISHED':
      return 'the forward-persistence evidence limitation';
    case 'RESEARCH_LIMITATION':
      return 'an authorized research limitation';
  }
}

export function materializeArgumentSelection(input: {
  operation: string;
  stance: ArgumentStanceV1;
  thesis: StructuredThesisV1;
  ledger: EvidenceLedgerV1;
  assumptions: AssumptionV1[];
  options: AuthorizedArgumentPointOption[];
  plan: ArgumentSelectionPlan;
  createdAt: string;
}): ArgumentV1 {
  const optionById = new Map(input.options.map((option) => [option.optionId, option]));
  const evidenceById = new Map(input.ledger.items.map((item) => [item.id, item]));
  const assumptionById = new Map(
    input.assumptions.map((assumption) => [assumption.id, assumption])
  );
  const selectedOptionIds = new Set<string>();
  const selected = ARGUMENT_SELECTION_SLOT_NAMES.flatMap((slot) => {
    const optionId = input.plan[slot];
    if (optionId === null) return [];
    if (selectedOptionIds.has(optionId)) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_SELECTION_VALIDATION',
        invariantCode: 'ARGUMENT_OPTIONS_MUST_BE_UNIQUE',
        issuePath: slot,
        safeExplanation: 'An argument option was selected more than once.',
      });
    }
    selectedOptionIds.add(optionId);
    const option = optionById.get(optionId);
    if (!option || option.allowedStance !== input.stance) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_SELECTION_VALIDATION',
        invariantCode: 'ARGUMENT_OPTION_UNKNOWN_OR_ROLE_INELIGIBLE',
        issuePath: slot,
        safeExplanation:
          'An argument selection referenced an option outside the authorized role catalog.',
      });
    }
    const assumption = assumptionById.get(option.targetAssumptionId);
    if (!assumption) {
      throw argumentViolation({
        operation: input.operation,
        stance: input.stance,
        validationCategory: 'ARGUMENT_SELECTION_VALIDATION',
        invariantCode: 'ARGUMENT_OPTION_ASSUMPTION_UNKNOWN_REFERENCE',
        issuePath: slot,
        safeExplanation:
          'A server-issued argument option referenced an unknown thesis assumption.',
        assumptionId: option.targetAssumptionId,
      });
    }
    return [{ slot, option, assumption }];
  });

  if (selected.length === 0 || input.plan.primary === null) {
    throw argumentViolation({
      operation: input.operation,
      stance: input.stance,
      validationCategory: 'ARGUMENT_SELECTION_VALIDATION',
      invariantCode: 'ARGUMENT_REQUIRES_PRIMARY_OPTION',
      issuePath: 'primary',
      safeExplanation: 'An argument selection requires one authorized primary option.',
    });
  }

  const relationLabels = {
    SUPPORTS: 'Supportive interpretation, not proof:',
    CHALLENGES: 'Challenging interpretation, not observed contradiction:',
    CONTEXT_ONLY: 'Contextual interpretation:',
    LIMITS_CONFIDENCE: 'Uncertainty interpretation:',
  } as const;

  const points = selected.map(({ slot, option }, pointIndex) => {
    const claims = option.evidenceClaimIds.map((evidenceId) => {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence) {
        throw argumentViolation({
          operation: input.operation,
          stance: input.stance,
          validationCategory: 'ARGUMENT_REFERENCE_VALIDATION',
          invariantCode: 'ARGUMENT_CLAIM_UNKNOWN_REFERENCE',
          issuePath: slot,
          safeExplanation:
            'A server-issued argument option referenced evidence outside the ledger.',
          argumentPointIndex: pointIndex,
          evidenceId,
          evidenceIds: option.evidenceClaimIds,
          assumptionId: option.targetAssumptionId,
        });
      }
      return evidence;
    });
    assertSemanticEvidenceMatch({
      operation: input.operation,
      stance: input.stance,
      pointIndex,
      measurementText: option.qualitativeInterpretation,
      interpretation: option.qualitativeInterpretation,
      evidenceTypes: new Set(claims.map((claim) => claim.observation.type)),
      ledgerEvidenceTypes: new Set(
        input.ledger.items.map((item) => item.observation.type)
      ),
      evidenceIds: option.evidenceClaimIds,
      targetAssumptionIds: [option.targetAssumptionId],
    });
    const exactEvidence = claims
      .map((evidence) => `[${evidence.id}] ${evidence.claim}`)
      .join('\n');
    return {
      id: deterministicId('argp', {
        thesisId: input.thesis.id,
        stance: input.stance,
        slot,
        optionId: option.optionId,
      }),
      title: option.title,
      reasoning: `Evidence:\n${exactEvidence}\nInterpretation: ${relationLabels[option.relation]} ${option.qualitativeInterpretation}`,
      evidenceIds: [...option.evidenceClaimIds],
      targetAssumptionIds: [option.targetAssumptionId],
      weight: ARGUMENT_SLOT_WEIGHTS[slot],
    };
  });

  const primaryOption = optionById.get(input.plan.primary);
  const primaryAssumption = primaryOption
    ? assumptionById.get(primaryOption.targetAssumptionId)
    : undefined;
  if (!primaryOption || !primaryAssumption) {
    throw DissentError.analysisFailed(
      'ARGUING',
      'The validated primary argument option could not be materialized.'
    );
  }
  const additionalFrameLabels = [
    '',
    ' alongside one additional authorized semantic frame.',
    ' alongside two additional authorized semantic frames.',
    ' alongside three additional authorized semantic frames.',
    ' alongside four additional authorized semantic frames.',
  ] as const;
  const summary = `Evidence-bound interpretation prioritizes ${interpretationKindLabel(primaryOption.interpretationKind)} for the selected ${primaryAssumption.category.toLowerCase().replaceAll('_', ' ')} assumption${selected.length === 1 ? '.' : additionalFrameLabels[selected.length - 1]}`;
  const assembledArgument = {
    id: deterministicId('arg', {
      thesisId: input.thesis.id,
      stance: input.stance,
      selectedOptionIds: selected.map(({ option }) => option.optionId),
    }),
    thesisId: input.thesis.id,
    stance: input.stance,
    summary,
    points,
    risksOrCounterweightsConsidered: authorizedResearchLimitationCatalog(
      input.ledger
    ).map((limitation) => `Research limitation: ${limitation.exactWording}`),
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
