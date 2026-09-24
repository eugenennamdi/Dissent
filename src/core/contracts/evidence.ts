import { z } from 'zod';

export const EvidenceCategoryV1Schema = z.enum([
  'PRICE_ACTION',
  'ORDERBOOK_DEPTH',
  'FUNDING_RATE',
  'OPEN_INTEREST',
  'LIQUIDATION_FLOW',
  'VOLATILITY_SURFACE',
  'ON_CHAIN_ACTIVITY',
  'MACRO_METRIC',
  'SENTIMENT_METRIC',
  'VALUATION_METRIC',
  'CORRELATION',
  'OTHER',
]);
export type EvidenceCategoryV1 = z.infer<typeof EvidenceCategoryV1Schema>;

export const EvidenceStanceV1Schema = z.enum([
  'SUPPORTING',
  'CONTRADICTING',
  'NEUTRAL',
]);
export type EvidenceStanceV1 = z.infer<typeof EvidenceStanceV1Schema>;

export const EvidenceNatureV1Schema = z.enum([
  'NUMERIC',
  'QUALITATIVE',
  'DERIVED',
]);
export type EvidenceNatureV1 = z.infer<typeof EvidenceNatureV1Schema>;

export const SourceTypeV1Schema = z.enum([
  'EXCHANGE_API',
  'ON_CHAIN_INDEXER',
  'NEWS_WIRE',
  'DERIVED_ANALYTICS',
  'PRIMARY_DOCUMENT',
]);
export type SourceTypeV1 = z.infer<typeof SourceTypeV1Schema>;

export const FreshnessLevelV1Schema = z.enum([
  'REALTIME',
  'RECENT',
  'DELAYED',
  'HISTORICAL',
  'STALE',
  'UNKNOWN',
]);
export type FreshnessLevelV1 = z.infer<typeof FreshnessLevelV1Schema>;

export const EvidenceObservationTypeV1Schema = z.enum([
  'LAST_PRICE',
  'PRICE_CHANGE_24H',
  'BASE_VOLUME_24H',
  'CANDLE_OPEN',
  'CANDLE_CLOSE',
  'INTERVAL_PRICE_CHANGE',
  'RETURN_SPREAD',
  'RELATIVE_RETURN',
  'FUNDING_RATE',
  'OPEN_INTEREST',
  'SESSION_PRICE_CHANGE',
  'SESSION_VOLUME',
  'MARKET_CAPITALIZATION',
  'VALUATION_PE_TTM',
  'VALUATION_PE_LYR',
  'VALUATION_PB_RATIO',
  'VALUATION_EV_EBITDA',
  'VALUATION_PS_TTM',
]);
export type EvidenceObservationTypeV1 = z.infer<
  typeof EvidenceObservationTypeV1Schema
>;

export const MarketInstrumentTypeV1Schema = z.enum([
  'SPOT',
  'PERPETUAL_FUTURES',
  'DERIVED_SPOT_PAIR',
  'EQUITY_CASH',
]);
export type MarketInstrumentTypeV1 = z.infer<typeof MarketInstrumentTypeV1Schema>;

/**
 * Typed market identity and measurement semantics. Provider-specific identifiers
 * remain data rather than becoming part of the provider-independent core model.
 */
export const EvidenceObservationV1Schema = z
  .object({
    type: EvidenceObservationTypeV1Schema,
    market: z
      .string()
      .regex(/^[A-Z0-9]+\/[A-Z0-9]+$/, 'Market must use BASE/QUOTE notation'),
    instrumentType: MarketInstrumentTypeV1Schema,
    providerSymbol: z.string().min(1),
    interval: z.string().min(1).optional(),
    periodStartAt: z.string().datetime().optional(),
    periodEndAt: z.string().datetime().optional(),
    reportingPeriod: z.string().min(1).optional(),
  })
  .refine(
    (observation) =>
      (observation.periodStartAt === undefined) ===
      (observation.periodEndAt === undefined),
    'periodStartAt and periodEndAt must be supplied together'
  )
  .refine(
    (observation) =>
      observation.periodStartAt === undefined ||
      new Date(observation.periodStartAt).getTime() <
        new Date(observation.periodEndAt as string).getTime(),
    'Observation period must end after it starts'
  );
export type EvidenceObservationV1 = z.infer<typeof EvidenceObservationV1Schema>;

export const EvidenceFreshnessModeV1Schema = z.enum([
  'AGE_SINCE_OBSERVATION',
  'HISTORICAL_RECORD',
  'UNKNOWN_OBSERVATION_TIME',
]);
export type EvidenceFreshnessModeV1 = z.infer<typeof EvidenceFreshnessModeV1Schema>;

/**
 * EvidenceProvenanceV1
 * Immutable origin, locator, and timing information for an observation.
 * Contains the timestamps and window parameters required to deterministically
 * evaluate freshness at any future point without mutating the evidence.
 */
export const EvidenceProvenanceV1Schema = z
  .object({
    sourceName: z.string().min(1, 'Source name is required'),
    sourceType: SourceTypeV1Schema,
    endpointOrLocator: z.string().min(1, 'Endpoint or locator is required'),
    observedAt: z
      .string()
      .datetime({ message: 'observedAt must be ISO 8601 datetime' })
      .nullable(),
    retrievedAt: z.string().datetime({ message: 'retrievedAt must be ISO 8601 datetime' }),
    validUntil: z.string().datetime().optional(),
    freshnessWindowSeconds: z.number().int().positive().optional(),
    freshnessMode: EvidenceFreshnessModeV1Schema.default('AGE_SINCE_OBSERVATION'),
    contentHash: z.string().optional(),
    rawSnapshot: z.record(z.unknown()).optional(),
  })
  .refine(
    (provenance) =>
      provenance.freshnessMode === 'UNKNOWN_OBSERVATION_TIME'
        ? provenance.observedAt === null
        : provenance.observedAt !== null,
    'observedAt must be null if and only if freshnessMode is UNKNOWN_OBSERVATION_TIME'
  );
export type EvidenceProvenanceV1 = z.infer<typeof EvidenceProvenanceV1Schema>;

/**
 * EvidenceV1
 * Normalized, sourced market observation.
 * Strictly separates factual market observations from model interpretations.
 * Freshness is NOT stored as an immutable static boolean/enum; it is derived
 * from provenance timestamps and bounded windows.
 */
export const EvidenceV1Schema = z.object({
  id: z.string().min(1, 'Evidence ID cannot be empty'),
  thesisId: z.string().min(1),
  claim: z.string().min(1, 'Factual observation claim cannot be empty'),
  category: EvidenceCategoryV1Schema,
  stance: EvidenceStanceV1Schema,
  nature: EvidenceNatureV1Schema,
  observation: EvidenceObservationV1Schema,
  provenance: EvidenceProvenanceV1Schema,
  value: z.union([z.number().finite(), z.string().min(1)]).optional(),
  unit: z.string().optional(),
  derivedFromEvidenceIds: z.array(z.string()).default([]),
  relatedAssumptionIds: z.array(z.string()).default([]),
  verifiable: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
  schemaVersion: z.literal(1).default(1),
});

export type EvidenceV1 = z.infer<typeof EvidenceV1Schema>;

/**
 * EvidenceLedgerV1
 * An immutable ledger collection of normalized evidence supporting an analysis run.
 */
export const EvidenceLedgerV1Schema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  items: z.array(EvidenceV1Schema),
  summary: z.object({
    totalCount: z.number().int().nonnegative(),
    supportingCount: z.number().int().nonnegative(),
    contradictingCount: z.number().int().nonnegative(),
    neutralCount: z.number().int().nonnegative(),
    staleCountAtAssembly: z.number().int().nonnegative(),
    categoriesPresent: z.array(EvidenceCategoryV1Schema),
  }),
  assembledAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type EvidenceLedgerV1 = z.infer<typeof EvidenceLedgerV1Schema>;

export interface FreshnessEvaluationV1 {
  level: FreshnessLevelV1;
  ageSeconds: number | null;
  isStale: boolean;
}

/**
 * Deterministically derives the freshness of an EvidenceV1 observation
 * relative to an explicit reference timestamp (defaults to current time).
 *
 * Invariant: An EvidenceV1 object does not become semantically false merely because
 * time passes; its freshness is always evaluated relative to a given point in time.
 */
export function deriveEvidenceFreshness(
  evidence: EvidenceV1,
  asOf: Date | string = new Date()
): FreshnessEvaluationV1 {
  const referenceMs = typeof asOf === 'string' ? new Date(asOf).getTime() : asOf.getTime();

  // If explicit validUntil is defined, check hard expiration
  if (evidence.provenance.validUntil) {
    const validUntilMs = new Date(evidence.provenance.validUntil).getTime();
    if (referenceMs > validUntilMs) {
      const observedMs = evidence.provenance.observedAt
        ? new Date(evidence.provenance.observedAt).getTime()
        : null;
      const ageSeconds =
        observedMs !== null
          ? Math.max(0, Math.floor((referenceMs - observedMs) / 1000))
          : null;
      return { level: 'STALE', ageSeconds, isStale: true };
    }
  }

  // Unknown observation time mode: does not fabricate a realtime or session-close freshness.
  // It is never classified as verified LIVE or as a confirmed regular-session close.
  if (
    evidence.provenance.freshnessMode === 'UNKNOWN_OBSERVATION_TIME' ||
    evidence.provenance.observedAt === null
  ) {
    return { level: 'UNKNOWN', ageSeconds: null, isStale: false };
  }

  const observedMs = new Date(evidence.provenance.observedAt).getTime();
  const ageSeconds = Math.max(0, Math.floor((referenceMs - observedMs) / 1000));

  // Closed historical records do not become false merely because their
  // observation interval is old. Their age remains visible and categorical.
  if (evidence.provenance.freshnessMode === 'HISTORICAL_RECORD') {
    return { level: 'HISTORICAL', ageSeconds, isStale: false };
  }

  // If custom freshnessWindowSeconds is defined, scale bands accordingly
  const windowSec = evidence.provenance.freshnessWindowSeconds;
  if (windowSec !== undefined) {
    if (ageSeconds <= windowSec) {
      return { level: 'REALTIME', ageSeconds, isStale: false };
    }
    if (ageSeconds <= windowSec * 2) {
      return { level: 'RECENT', ageSeconds, isStale: false };
    }
    if (ageSeconds <= windowSec * 5) {
      return { level: 'DELAYED', ageSeconds, isStale: false };
    }
    return { level: 'STALE', ageSeconds, isStale: true };
  }

  // Standard market observation thresholds:
  // < 60s: REALTIME
  // < 900s (15m): RECENT
  // < 3600s (1h): DELAYED
  // < 86400s (24h): HISTORICAL
  // >= 86400s: STALE
  if (ageSeconds < 60) {
    return { level: 'REALTIME', ageSeconds, isStale: false };
  }
  if (ageSeconds < 900) {
    return { level: 'RECENT', ageSeconds, isStale: false };
  }
  if (ageSeconds < 3600) {
    return { level: 'DELAYED', ageSeconds, isStale: false };
  }
  if (ageSeconds < 86400) {
    return { level: 'HISTORICAL', ageSeconds, isStale: false };
  }
  return { level: 'STALE', ageSeconds, isStale: true };
}

export function isEvidenceStale(
  evidence: EvidenceV1,
  asOf: Date | string = new Date()
): boolean {
  return deriveEvidenceFreshness(evidence, asOf).isStale;
}

export const MINIMUM_USABLE_EQUITY_OBSERVATION_TYPES: readonly EvidenceObservationTypeV1[] = [
  'LAST_PRICE',
  'SESSION_PRICE_CHANGE',
] as const;

export const OPTIONAL_EQUITY_VALUATION_OBSERVATION_TYPES: readonly EvidenceObservationTypeV1[] = [
  'SESSION_VOLUME',
  'MARKET_CAPITALIZATION',
  'VALUATION_PE_TTM',
  'VALUATION_PE_LYR',
  'VALUATION_PB_RATIO',
  'VALUATION_EV_EBITDA',
  'VALUATION_PS_TTM',
] as const;
