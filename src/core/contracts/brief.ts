import { z } from 'zod';
import { StructuredThesisV1Schema } from './thesis';
import { AssumptionV1Schema } from './assumption';
import { EvidenceLedgerV1Schema, EvidenceV1Schema } from './evidence';
import { ArgumentV1Schema } from './argument';
import { StressScenarioV1Schema, InvalidationConditionV1Schema } from './stress-scenario';
import { HumanDecisionV1Schema } from './human-decision';

export const ContradictionPointV1Schema = z.object({
  id: z.string().min(1),
  targetType: z.enum(['THESIS_CLAIM', 'ASSUMPTION', 'CATALYST']),
  targetId: z.string().min(1),
  statement: z.string().min(1, 'Contradiction statement is required'),
  contradictingEvidenceId: z.string().min(1, 'Must reference contradicting evidence ID'),
  explanation: z.string().min(1, 'Explanation of discrepancy is required'),
  severity: z.enum(['CRITICAL', 'SIGNIFICANT', 'MINOR']),
});
export type ContradictionPointV1 = z.infer<typeof ContradictionPointV1Schema>;

/**
 * DissentBriefV1
 * The signature product artifact of Dissent.
 * Encapsulates the 11 canonical sections of adversarial market analysis.
 *
 * Notice: humanDecision is nullable upon generation. The AI synthesizer CANNOT
 * populate humanDecision. Only a subsequent verified human action can attach it.
 */
export const DissentBriefV1Schema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime(),

  // 1. Original thesis (preserved verbatim)
  originalThesis: z.string().min(1),

  // 2. Structured thesis
  structuredThesis: StructuredThesisV1Schema,

  // 3. Supporting evidence
  supportingEvidence: z.array(EvidenceV1Schema),

  // 4. The Dissent — strongest credible counter-case
  theDissent: ArgumentV1Schema.refine((arg) => arg.stance === 'DISSENTER', {
    message: 'theDissent section must have stance DISSENTER',
  }),

  // 5. Hidden / explicit assumptions
  assumptions: z.array(AssumptionV1Schema),

  // 6. Contradictions
  contradictions: z.array(ContradictionPointV1Schema),

  // 7. Stress scenarios
  stressScenarios: z.array(StressScenarioV1Schema),

  // 8. Invalidation conditions
  invalidationConditions: z.array(InvalidationConditionV1Schema),

  // 9. Unknowns / unresolved questions
  unknowns: z.array(z.string().min(1)),

  // 10. Evidence ledger / provenance
  evidenceLedger: EvidenceLedgerV1Schema,

  // 11. Human decision (null until human explicitly commits PROCEED / WATCH / PASS)
  humanDecision: HumanDecisionV1Schema.nullable().default(null),

  // Legal / Operational disclaimer invariant
  disclaimer: z.literal(
    'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.'
  ).default(
    'Dissent is decision-support research infrastructure, not financial advice, automated trading, or an execution system. All trading decisions are made solely by the human trader.'
  ),

  schemaVersion: z.literal(1).default(1),
});

export type DissentBriefV1 = z.infer<typeof DissentBriefV1Schema>;
