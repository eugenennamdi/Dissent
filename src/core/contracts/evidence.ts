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
]);
export type FreshnessLevelV1 = z.infer<typeof FreshnessLevelV1Schema>;

/**
 * EvidenceProvenanceV1
 * Immutable origin, locator, and timing information for an observation.
 * Contains the timestamps and window parameters required to deterministically
 * evaluate freshness at any future point without mutating the evidence.
 */
export const EvidenceProvenanceV1Schema = z.object({
  sourceName: z.string().min(1, 'Source name is required'),
  sourceType: SourceTypeV1Schema,
  endpointOrLocator: z.string().min(1, 'Endpoint or locator is required'),
  observedAt: z.string().datetime({ message: 'observedAt must be ISO 8601 datetime' }),
  retrievedAt: z.string().datetime({ message: 'retrievedAt must be ISO 8601 datetime' }),
  validUntil: z.string().datetime().optional(),
  freshnessWindowSeconds: z.number().int().positive().optional(),
  contentHash: z.string().optional(),
  rawSnapshot: z.record(z.unknown()).optional(),
});
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
  provenance: EvidenceProvenanceV1Schema,
  value: z.union([z.number(), z.string()]).optional(),
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
  ageSeconds: number;
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
  const observedMs = new Date(evidence.provenance.observedAt).getTime();
  const ageSeconds = Math.max(0, Math.floor((referenceMs - observedMs) / 1000));

  // If explicit validUntil is defined, check hard expiration
  if (evidence.provenance.validUntil) {
    const validUntilMs = new Date(evidence.provenance.validUntil).getTime();
    if (referenceMs > validUntilMs) {
      return { level: 'STALE', ageSeconds, isStale: true };
    }
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

