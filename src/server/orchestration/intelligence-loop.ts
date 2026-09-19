import type { ArgumentV1 } from '@/core/contracts/argument';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { EvidenceLedgerV1 } from '@/core/contracts/evidence';
import { ThesisInputV1Schema, type StructuredThesisV1, type ThesisInputV1 } from '@/core/contracts/thesis';
import {
  assertArgumentEvidenceGrounding,
  assertEvidenceLedgerIntegrity,
  assertThesisPreservation,
} from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import type { ArgumentationPort, ThesisStructuringPort } from '@/server/ai/ai-analyst.port';
import type { ModelCallMetadata } from '@/server/ai/structured-model.port';
import type { MarketDeskPort, MarketObservationQuery } from '@/server/market/market-desk.port';

export interface IntelligenceLoopResult {
  input: ThesisInputV1;
  structuredThesis: StructuredThesisV1;
  assumptions: AssumptionV1[];
  evidenceLedger: EvidenceLedgerV1;
  advocateCase: ArgumentV1;
  dissentCase: ArgumentV1;
  modelCalls: readonly ModelCallMetadata[];
  timingsMs: {
    structuring: number;
    marketResearch: number;
    argumentation: number;
    total: number;
  };
}

type IntelligenceAiPort = ThesisStructuringPort &
  ArgumentationPort & {
    getModelCallRecords?: () => readonly ModelCallMetadata[];
  };

export interface IntelligenceLoopOptions {
  ai: IntelligenceAiPort;
  marketDesk: MarketDeskPort;
  now?: () => number;
  marketQuery?: MarketObservationQuery;
}

/** Phase 2 only: structuring, market research, and evidence-bound debate. */
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
    const comparableArgument = (argument: ArgumentV1) => ({
      summary: argument.summary,
      points: argument.points.map((point) => ({
        title: point.title,
        reasoning: point.reasoning,
        evidenceIds: point.evidenceIds,
        targetAssumptionIds: point.targetAssumptionIds,
        weight: point.weight,
      })),
      counterweights: argument.risksOrCounterweightsConsidered,
    });
    if (
      JSON.stringify(comparableArgument(advocateCase)) ===
      JSON.stringify(comparableArgument(dissentCase))
    ) {
      throw DissentError.modelOutputInvalid(
        'argumentation',
        'Advocate and Dissenter returned materially identical cases.'
      );
    }
    assertArgumentEvidenceGrounding(advocateCase, research.ledger);
    assertArgumentEvidenceGrounding(dissentCase, research.ledger);

    return {
      input,
      structuredThesis,
      assumptions: initialAssumptions,
      evidenceLedger: research.ledger,
      advocateCase,
      dissentCase,
      modelCalls: this.ai.getModelCallRecords?.() ?? [],
      timingsMs: {
        structuring,
        marketResearch,
        argumentation,
        total: this.now() - totalStartedAt,
      },
    };
  }
}
