import { z } from 'zod';

export const ArgumentStanceV1Schema = z.enum(['ADVOCATE', 'DISSENTER']);
export type ArgumentStanceV1 = z.infer<typeof ArgumentStanceV1Schema>;

export const ArgumentWeightV1Schema = z.enum([
  'PRIMARY',
  'SECONDARY',
  'CONTEXTUAL',
]);
export type ArgumentWeightV1 = z.infer<typeof ArgumentWeightV1Schema>;

export const ArgumentPointV1Schema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  reasoning: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1, 'Each argument point must reference at least one evidence item'),
  targetAssumptionIds: z.array(z.string()).default([]),
  weight: ArgumentWeightV1Schema.default('PRIMARY'),
});
export type ArgumentPointV1 = z.infer<typeof ArgumentPointV1Schema>;

/**
 * ArgumentV1
 * Structured case FOR (Advocate) or AGAINST (Dissenter) the trade thesis.
 * Mandates evidence linkage to prevent ungrounded assertions.
 */
export const ArgumentV1Schema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  stance: ArgumentStanceV1Schema,
  summary: z.string().min(1, 'Argument summary is required'),
  points: z.array(ArgumentPointV1Schema).min(1, 'At least one structured point required'),
  risksOrCounterweightsConsidered: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type ArgumentV1 = z.infer<typeof ArgumentV1Schema>;
