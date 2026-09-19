import type { ThesisInputV1, StructuredThesisV1 } from '@/core/contracts/thesis';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { EvidenceLedgerV1 } from '@/core/contracts/evidence';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { StressScenarioV1, InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { DissentBriefV1 } from '@/core/contracts/brief';

/**
 * ThesisStructuringPort
 * Semantic AI boundary for extracting a verifiable hypothesis and underlying assumptions.
 */
export interface ThesisStructuringPort {
  structureThesis(input: ThesisInputV1): Promise<{
    structuredThesis: StructuredThesisV1;
    initialAssumptions: AssumptionV1[];
  }>;
}

/**
 * ArgumentationPort
 * Semantic AI boundary for generating adversary cases grounded in evidence.
 * Generates both the advocate thesis and the dissenting counter-thesis.
 */
export interface ArgumentationPort {
  buildAdvocateCase(
    thesis: StructuredThesisV1,
    ledger: EvidenceLedgerV1,
    assumptions: AssumptionV1[]
  ): Promise<ArgumentV1>;

  buildDissentCase(
    thesis: StructuredThesisV1,
    ledger: EvidenceLedgerV1,
    assumptions: AssumptionV1[]
  ): Promise<ArgumentV1>;
}

/**
 * StressTestingPort
 * Semantic AI boundary for evaluating assumptions against macro and market shocks.
 */
export interface StressTestingPort {
  stressTest(
    thesis: StructuredThesisV1,
    assumptions: AssumptionV1[],
    ledger: EvidenceLedgerV1,
    advocateCase: ArgumentV1,
    dissentCase: ArgumentV1
  ): Promise<{
    stressScenarios: StressScenarioV1[];
    invalidationConditions: InvalidationConditionV1[];
    testedAssumptions: AssumptionV1[];
  }>;
}

export interface SynthesisParams {
  runId: string;
  originalThesis: ThesisInputV1;
  structuredThesis: StructuredThesisV1;
  advocateCase: ArgumentV1;
  dissentCase: ArgumentV1;
  assumptions: AssumptionV1[];
  stressScenarios: StressScenarioV1[];
  invalidationConditions: InvalidationConditionV1[];
  evidenceLedger: EvidenceLedgerV1;
}

/**
 * SynthesisPort
 * Semantic AI boundary for compiling the signature Dissent Brief.
 * INVARIANT: AI synthesizer NEVER outputs a humanDecision (it remains null).
 */
export interface SynthesisPort {
  synthesizeBrief(params: SynthesisParams): Promise<DissentBriefV1>;
}

/**
 * Composite AI Desk Port grouping the individual semantic operations.
 */
export interface AiDeskPort
  extends ThesisStructuringPort,
    ArgumentationPort,
    StressTestingPort,
    SynthesisPort {}
