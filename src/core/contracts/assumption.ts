import { z } from 'zod';

export const AssumptionTypeV1Schema = z.enum(['EXPLICIT', 'INFERRED']);
export type AssumptionTypeV1 = z.infer<typeof AssumptionTypeV1Schema>;

export const AssumptionCategoryV1Schema = z.enum([
  'MARKET_REGIME',
  'CORRELATION',
  'POSITIONING',
  'MACRO',
  'LIQUIDITY',
  'CATALYST_TIMING',
  'MICROSTRUCTURE',
  'OTHER',
]);
export type AssumptionCategoryV1 = z.infer<typeof AssumptionCategoryV1Schema>;

/**
 * Categorical status representing real evidentiary stance:
 * - UNTESTED: Not investigated yet.
 * - SUPPORTED: Evidence currently supports the assumption.
 * - QUESTIONED: Evidence raises material questions.
 * - CONTRADICTED: Evidence contradicts the assumption.
 * - INSUFFICIENT_EVIDENCE: Research performed, but available evidence is insufficient.
 *
 * Epistemically grounded; strictly avoids fake 0-100% precision or premature "VALIDATED" claims.
 */
export const AssumptionStatusV1Schema = z.enum([
  'UNTESTED',
  'SUPPORTED',
  'QUESTIONED',
  'CONTRADICTED',
  'INSUFFICIENT_EVIDENCE',
]);
export type AssumptionStatusV1 = z.infer<typeof AssumptionStatusV1Schema>;

/**
 * AssumptionV1
 * First-class entity analyzing the trader's underlying reasoning.
 */
export const AssumptionV1Schema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  claim: z.string().min(1, 'Assumption claim cannot be empty'),
  type: AssumptionTypeV1Schema,
  category: AssumptionCategoryV1Schema,
  status: AssumptionStatusV1Schema.default('UNTESTED'),
  challenge: z.string().min(1, 'Specific challenge scenario is required'),
  invalidationCondition: z.string().min(1, 'Invalidation condition is required'),
  supportingEvidenceIds: z.array(z.string()).default([]),
  opposingEvidenceIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type AssumptionV1 = z.infer<typeof AssumptionV1Schema>;
