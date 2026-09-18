import { z } from 'zod';
import { ThesisInputV1Schema } from './thesis';
import { StructuredThesisV1Schema } from './thesis';
import { EvidenceLedgerV1Schema } from './evidence';
import { DissentBriefV1Schema } from './brief';
import { HumanDecisionV1Schema } from './human-decision';

export const AnalysisStageV1Schema = z.enum([
  'DRAFT',
  'STRUCTURING',
  'RESEARCHING',
  'ARGUING',
  'STRESS_TESTING',
  'SYNTHESIZING',
  'COMPLETED',
  'FAILED',
]);
export type AnalysisStageV1 = z.infer<typeof AnalysisStageV1Schema>;

export const TERMINAL_STAGES: readonly AnalysisStageV1[] = ['COMPLETED', 'FAILED'] as const;

export function isTerminalStage(stage: AnalysisStageV1): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/**
 * Valid stage transitions for the AnalysisRun state machine.
 * Supports forward progression, failure from any active stage,
 * and retry restarts from FAILED back to any processing stage.
 */
export const ALLOWED_TRANSITIONS: Record<AnalysisStageV1, readonly AnalysisStageV1[]> = {
  DRAFT: ['STRUCTURING', 'FAILED'],
  STRUCTURING: ['RESEARCHING', 'FAILED'],
  RESEARCHING: ['ARGUING', 'FAILED'],
  ARGUING: ['STRESS_TESTING', 'FAILED'],
  STRESS_TESTING: ['SYNTHESIZING', 'FAILED'],
  SYNTHESIZING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Terminal success
  FAILED: ['STRUCTURING', 'RESEARCHING', 'ARGUING', 'STRESS_TESTING', 'SYNTHESIZING'], // Retries allowed
};

export function isValidStageTransition(from: AnalysisStageV1, to: AnalysisStageV1): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export const RunErrorV1Schema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  occurredAtStage: AnalysisStageV1Schema,
  timestamp: z.string().datetime(),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean().default(false),
});
export type RunErrorV1 = z.infer<typeof RunErrorV1Schema>;

export const StageHistoryEntryV1Schema = z.object({
  stage: AnalysisStageV1Schema,
  enteredAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type StageHistoryEntryV1 = z.infer<typeof StageHistoryEntryV1Schema>;

/**
 * AnalysisRunV1
 * Tracks the end-to-end lifecycle, artifacts, and execution state of a Dissent analysis.
 */
export const AnalysisRunV1Schema = z.object({
  id: z.string().min(1),
  thesisInput: ThesisInputV1Schema,
  stage: AnalysisStageV1Schema.default('DRAFT'),
  stageHistory: z.array(StageHistoryEntryV1Schema).default([]),
  structuredThesis: StructuredThesisV1Schema.optional(),
  evidenceLedger: EvidenceLedgerV1Schema.optional(),
  brief: DissentBriefV1Schema.optional(),
  humanDecision: HumanDecisionV1Schema.optional(),
  error: RunErrorV1Schema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  schemaVersion: z.literal(1).default(1),
});

export type AnalysisRunV1 = z.infer<typeof AnalysisRunV1Schema>;
