import { z } from 'zod';

export const HumanDecisionTypeV1Schema = z.enum(['PROCEED', 'WATCH', 'PASS']);
export type HumanDecisionTypeV1 = z.infer<typeof HumanDecisionTypeV1Schema>;

/**
 * HumanAttributionV1
 * Enforces strict attribution to a human operator.
 * The actorType is structurally restricted to 'HUMAN_OPERATOR'.
 * AI or automated systems cannot author a valid HumanDecisionV1.
 */
export const HumanAttributionV1Schema = z.object({
  actorType: z.literal('HUMAN_OPERATOR'),
  operatorId: z.string().min(1, 'Operator ID must be provided'),
  clientSessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type HumanAttributionV1 = z.infer<typeof HumanAttributionV1Schema>;

/**
 * HumanDecisionV1
 * The final decision on the thesis.
 * STRICT INVARIANT: AI analysis never selects PROCEED / WATCH / PASS.
 * This artifact is created ONLY upon human submission.
 */
export const HumanDecisionV1Schema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  thesisId: z.string().min(1),
  decision: HumanDecisionTypeV1Schema,
  attribution: HumanAttributionV1Schema,
  notes: z.string().optional(),
  decidedAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type HumanDecisionV1 = z.infer<typeof HumanDecisionV1Schema>;
