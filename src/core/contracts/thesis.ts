import { z } from 'zod';

/**
 * ThesisInputV1
 * Raw, un-opinionated trader submission. Preserved verbatim.
 */
export const ThesisInputV1Schema = z.object({
  id: z.string().min(1, 'Thesis input ID cannot be empty'),
  rawText: z.string().trim().min(3, 'Thesis must be at least 3 characters long'),
  traderId: z.string().optional(),
  submittedAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type ThesisInputV1 = z.infer<typeof ThesisInputV1Schema>;

/**
 * Market direction for the structured thesis.
 */
export const ThesisDirectionV1Schema = z.enum([
  'LONG',
  'SHORT',
  'RELATIVE_LONG',
  'RELATIVE_SHORT',
  'NEUTRAL',
  'VOLATILITY_EXPANSION',
  'VOLATILITY_COMPRESSION',
]);

export type ThesisDirectionV1 = z.infer<typeof ThesisDirectionV1Schema>;

/**
 * Time horizon for the trade thesis.
 */
export const TimeHorizonV1Schema = z.object({
  description: z.string().min(1),
  estimatedHours: z.number().positive().optional(),
});

export type TimeHorizonV1 = z.infer<typeof TimeHorizonV1Schema>;

/**
 * StructuredThesisV1
 * Normalized, parsed market hypothesis extracted from the raw thesis.
 * Strictly separates the original input from the structured interpretation.
 */
export const StructuredThesisV1Schema = z.object({
  id: z.string().min(1),
  thesisInputId: z.string().min(1),
  originalThesis: z.string().min(1),
  market: z.string().min(1), // e.g. "ETH/BTC", "SOL/USDT"
  baseAsset: z.string().min(1), // e.g. "ETH"
  quoteAsset: z.string().min(1), // e.g. "BTC"
  claim: z.string().min(1), // concise normalized thesis claim
  direction: ThesisDirectionV1Schema,
  timeHorizon: TimeHorizonV1Schema,
  catalysts: z.array(z.string().min(1)).min(1, 'At least one catalyst required'),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type StructuredThesisV1 = z.infer<typeof StructuredThesisV1Schema>;
