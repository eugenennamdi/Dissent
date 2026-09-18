import type { ThesisInputV1 } from '@/core/contracts/thesis';
import type { AnalysisRunV1 } from '@/core/contracts/run';
import type { HumanDecisionV1 } from '@/core/contracts/human-decision';

/**
 * OrchestratorPort
 * Lifecycle coordinator for Dissent analysis runs.
 * Orchestrates the sequential pipeline:
 * Input -> Structuring -> Market Desk & Context Desk -> Argumentation -> Stress Testing -> Synthesis -> Human Call
 */
export interface OrchestratorPort {
  /**
   * Initializes and executes an analysis run for a given trader thesis.
   */
  startRun(input: ThesisInputV1): Promise<AnalysisRunV1>;

  /**
   * Retrieves current run state and artifacts.
   */
  getRun(runId: string): Promise<AnalysisRunV1>;

  /**
   * Attaches the human trader's decision (PROCEED / WATCH / PASS) to a completed run.
   */
  recordHumanDecision(runId: string, decision: HumanDecisionV1): Promise<AnalysisRunV1>;
}
