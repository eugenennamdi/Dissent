import type { ArgumentV1 } from '@/core/contracts/argument';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { EvidenceLedgerV1 } from '@/core/contracts/evidence';
import type {
  InvalidationConditionV1,
  StressScenarioV1,
} from '@/core/contracts/stress-scenario';
import { ThesisInputV1Schema, type StructuredThesisV1, type ThesisInputV1 } from '@/core/contracts/thesis';
import {
  assertArgumentEvidenceGrounding,
  assertEvidenceLedgerIntegrity,
  assertGeneratedBriefInvariants,
  assertThesisPreservation,
} from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import type { AiDeskPort } from '@/server/ai/ai-analyst.port';
import { assertAdvocateDissenterDistinct } from '@/server/ai/argument-validation';
import type { ModelCallMetadata } from '@/server/ai/structured-model.port';
import type { MarketDeskPort, MarketObservationQuery } from '@/server/market/market-desk.port';

export interface IntelligenceLoopResult {
  input: ThesisInputV1;
  structuredThesis: StructuredThesisV1;
  assumptions: AssumptionV1[];
  evidenceLedger: EvidenceLedgerV1;
  advocateCase: ArgumentV1;
  dissentCase: ArgumentV1;
  stressScenarios: StressScenarioV1[];
  invalidationConditions: InvalidationConditionV1[];
  brief: DissentBriefV1;
  modelCalls: readonly ModelCallMetadata[];
  timingsMs: {
    structuring: number;
    marketResearch: number;
    argumentation: number;
    stressTesting: number;
    synthesis: number;
    total: number;
  };
}

type IntelligenceAiPort = AiDeskPort & {
  getModelCallRecords?: () => readonly ModelCallMetadata[];
};

export interface IntelligenceLoopOptions {
  ai: IntelligenceAiPort;
  marketDesk: MarketDeskPort;
  now?: () => number;
  marketQuery?: MarketObservationQuery;
}

/** Complete server-side research loop through a validated Dissent Brief. */
export class IntelligenceLoop {
  private readonly ai: IntelligenceAiPort;
  private readonly marketDesk: MarketDeskPort;
  private readonly now: () => number;
  private readonly marketQuery: MarketObservationQuery;

  constructor(options: IntelligenceLoopOptions) {
    this.ai = options.ai;
    this.marketDesk = options.marketDesk;
    this.now = options.now ?? Date.now;
    this.marketQuery = options.marketQuery ?? { lookbackHours: 48, includeFutures: true };
  }

  async run(inputValue: ThesisInputV1): Promise<IntelligenceLoopResult> {
    const input = ThesisInputV1Schema.parse(inputValue);
    const totalStartedAt = this.now();

    const structuringStartedAt = this.now();
    const { structuredThesis, initialAssumptions } = await this.ai.structureThesis(input);
    const structuring = this.now() - structuringStartedAt;
    assertThesisPreservation(input, structuredThesis);

    const marketStartedAt = this.now();
    const research = await this.marketDesk.gatherMarketObservations(
      structuredThesis,
      this.marketQuery
    );
    const marketResearch = this.now() - marketStartedAt;
    assertEvidenceLedgerIntegrity(research.ledger);
    if (!research.complete || research.gaps.length > 0) {
      throw DissentError.evidenceUnavailable(structuredThesis.market, {
        reason: 'partial_market_research',
        gaps: research.gaps,
        retainedEvidenceCount: research.ledger.items.length,
      });
    }

    const ledgerSnapshot = JSON.stringify(research.ledger);
    const argumentStartedAt = this.now();
    const [advocateCase, dissentCase] = await Promise.all([
      this.ai.buildAdvocateCase(structuredThesis, research.ledger, initialAssumptions),
      this.ai.buildDissentCase(structuredThesis, research.ledger, initialAssumptions),
    ]);
    const argumentation = this.now() - argumentStartedAt;
    if (JSON.stringify(research.ledger) !== ledgerSnapshot) {
      throw DissentError.analysisFailed(
        'ARGUING',
        'AI argumentation attempted to mutate the evidence ledger.'
      );
    }
    if (advocateCase.stance !== 'ADVOCATE' || dissentCase.stance !== 'DISSENTER') {
      throw DissentError.modelOutputInvalid(
        'argumentation',
        'Argument stances did not match their fixed server-owned roles.'
      );
    }
    assertAdvocateDissenterDistinct(
      advocateCase,
      dissentCase,
      this.ai.getModelCallRecords?.() ?? []
    );
    assertArgumentEvidenceGrounding(advocateCase, research.ledger);
    assertArgumentEvidenceGrounding(dissentCase, research.ledger);

    const artifactsSnapshot = JSON.stringify({
      ledger: research.ledger,
      advocateCase,
      dissentCase,
      initialAssumptions,
    });
    const stressStartedAt = this.now();
    const { stressScenarios, invalidationConditions, testedAssumptions } =
      await this.ai.stressTest(
        structuredThesis,
        initialAssumptions,
        research.ledger,
        advocateCase,
        dissentCase
      );
    const stressTesting = this.now() - stressStartedAt;
    if (
      JSON.stringify({
        ledger: research.ledger,
        advocateCase,
        dissentCase,
        initialAssumptions,
      }) !== artifactsSnapshot
    ) {
      throw DissentError.analysisFailed(
        'STRESS_TESTING',
        'AI stress testing attempted to mutate preceding research artifacts.'
      );
    }
    if (
      testedAssumptions.length !== initialAssumptions.length ||
      testedAssumptions.some(
        (assumption) =>
          assumption.thesisId !== structuredThesis.id || assumption.status === 'UNTESTED'
      ) ||
      stressScenarios.length === 0 ||
      invalidationConditions.length === 0
    ) {
      throw DissentError.modelOutputInvalid(
        'stressTest',
        'Stress testing did not return complete tested assumptions, scenarios, and invalidation conditions.'
      );
    }

    const synthesisSnapshot = JSON.stringify({
      ledger: research.ledger,
      advocateCase,
      dissentCase,
      testedAssumptions,
      stressScenarios,
      invalidationConditions,
    });
    const synthesisStartedAt = this.now();
    const brief = await this.ai.synthesizeBrief({
      runId: `run_${input.id}`,
      originalThesis: input,
      structuredThesis,
      advocateCase,
      dissentCase,
      assumptions: testedAssumptions,
      stressScenarios,
      invalidationConditions,
      evidenceLedger: research.ledger,
    });
    const synthesis = this.now() - synthesisStartedAt;
    if (
      JSON.stringify({
        ledger: research.ledger,
        advocateCase,
        dissentCase,
        testedAssumptions,
        stressScenarios,
        invalidationConditions,
      }) !== synthesisSnapshot
    ) {
      throw DissentError.analysisFailed(
        'SYNTHESIZING',
        'AI synthesis attempted to mutate validated research artifacts.'
      );
    }
    assertGeneratedBriefInvariants(brief);
    if (brief.originalThesis !== input.rawText) {
      throw DissentError.analysisFailed(
        'SYNTHESIZING',
        'Final brief did not preserve the original thesis verbatim.'
      );
    }

    return {
      input,
      structuredThesis,
      assumptions: testedAssumptions,
      evidenceLedger: research.ledger,
      advocateCase,
      dissentCase,
      stressScenarios,
      invalidationConditions,
      brief,
      modelCalls: this.ai.getModelCallRecords?.() ?? [],
      timingsMs: {
        structuring,
        marketResearch,
        argumentation,
        stressTesting,
        synthesis,
        total: this.now() - totalStartedAt,
      },
    };
  }
}
