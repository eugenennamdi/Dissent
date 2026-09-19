import { DissentError } from '../errors/domain-errors';
import type { ThesisInputV1, StructuredThesisV1 } from '../contracts/thesis';
import {
  isEvidenceStale,
  type EvidenceCategoryV1,
  type EvidenceLedgerV1,
} from '../contracts/evidence';
import type { ArgumentV1 } from '../contracts/argument';
import type { HumanDecisionV1 } from '../contracts/human-decision';
import type { DissentBriefV1 } from '../contracts/brief';
import { isValidStageTransition, type AnalysisStageV1 } from '../contracts/run';

/**
 * Invariant 1 & 2: AI analysis never selects PROCEED / WATCH / PASS.
 * HumanDecisionV1 must be clearly attributable to human operator action.
 */
export function assertHumanDecisionInvariants(decision: HumanDecisionV1): void {
  if (decision.attribution.actorType !== 'HUMAN_OPERATOR') {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: Decision actor must be HUMAN_OPERATOR. Automated or AI actors are prohibited.'
    );
  }
  if (!decision.attribution.operatorId || decision.attribution.operatorId.trim().length === 0) {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: Operator ID is required for human attribution.'
    );
  }
}

/**
 * Invariant 5 & 6: Original user thesis must remain preserved verbatim.
 * Structured interpretation must remain distinct from the original input.
 */
export function assertThesisPreservation(
  input: ThesisInputV1,
  structured: StructuredThesisV1
): void {
  if (structured.originalThesis !== input.rawText) {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: StructuredThesis.originalThesis must match ThesisInput.rawText verbatim.'
    );
  }
  if (structured.thesisInputId !== input.id) {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: StructuredThesis.thesisInputId must reference the source ThesisInput ID.'
    );
  }
}

/**
 * Invariant 3 & 4: Evidence provenance is immutable and verified.
 * Evidence items in a ledger must be uniquely identified and well-formed.
 */
export function assertEvidenceLedgerIntegrity(ledger: EvidenceLedgerV1): void {
  const ids = new Set<string>();
  for (const item of ledger.items) {
    if (ids.has(item.id)) {
      throw DissentError.invalidInput(
        `Domain Invariant Violation: Duplicate evidence ID in ledger: ${item.id}`
      );
    }
    ids.add(item.id);

    if (item.thesisId !== ledger.thesisId) {
      throw DissentError.invalidInput(
        `Domain Invariant Violation: Evidence ${item.id} references thesis ${item.thesisId}, not ledger thesis ${ledger.thesisId}.`
      );
    }

    if (!item.provenance.sourceName || !item.provenance.endpointOrLocator) {
      throw DissentError.invalidInput(
        `Domain Invariant Violation: Evidence ${item.id} is missing verifiable source provenance.`
      );
    }
  }

  for (const item of ledger.items) {
    if (item.nature === 'DERIVED' && item.derivedFromEvidenceIds.length === 0) {
      throw DissentError.invalidInput(
        `Domain Invariant Violation: Derived evidence ${item.id} has no source evidence references.`
      );
    }

    for (const sourceId of item.derivedFromEvidenceIds) {
      if (sourceId === item.id || !ids.has(sourceId)) {
        throw DissentError.invalidInput(
          `Domain Invariant Violation: Evidence ${item.id} references missing or invalid source evidence ${sourceId}.`
        );
      }
    }
  }

  if (ledger.summary.totalCount !== ledger.items.length) {
    throw DissentError.invalidInput(
      `Domain Invariant Violation: Ledger totalCount (${ledger.summary.totalCount}) does not match items length (${ledger.items.length}).`
    );
  }

  const expectedCounts = {
    supportingCount: ledger.items.filter((item) => item.stance === 'SUPPORTING').length,
    contradictingCount: ledger.items.filter((item) => item.stance === 'CONTRADICTING').length,
    neutralCount: ledger.items.filter((item) => item.stance === 'NEUTRAL').length,
    staleCountAtAssembly: ledger.items.filter((item) =>
      isEvidenceStale(item, ledger.assembledAt)
    ).length,
  };

  for (const [field, expected] of Object.entries(expectedCounts)) {
    const actual = ledger.summary[field as keyof typeof expectedCounts];
    if (actual !== expected) {
      throw DissentError.invalidInput(
        `Domain Invariant Violation: Ledger ${field} (${actual}) does not match evidence (${expected}).`
      );
    }
  }

  const expectedCategories = [
    ...new Set(ledger.items.map((item) => item.category)),
  ].sort() as EvidenceCategoryV1[];
  const actualCategories = [...ledger.summary.categoriesPresent].sort();
  if (JSON.stringify(actualCategories) !== JSON.stringify(expectedCategories)) {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: Ledger categoriesPresent does not match its evidence items.'
    );
  }
}

/**
 * Invariant 7: Arguments must reference valid evidence in the ledger,
 * not silently invent unsupported claims.
 */
export function assertArgumentEvidenceGrounding(
  argument: ArgumentV1,
  ledger: EvidenceLedgerV1
): void {
  const ledgerIds = new Set(ledger.items.map((i) => i.id));
  for (const point of argument.points) {
    for (const evidenceId of point.evidenceIds) {
      if (!ledgerIds.has(evidenceId)) {
        throw DissentError.invalidInput(
          `Domain Invariant Violation: Argument point "${point.title}" references evidence ID "${evidenceId}" which does not exist in the evidence ledger.`
        );
      }
    }
  }
}

/**
 * Invariant 1, 7 & 10: Full DissentBrief structural verification.
 */
export function assertBriefInvariants(brief: DissentBriefV1): void {
  // Ensure the Dissent has DISSENTER stance
  if (brief.theDissent.stance !== 'DISSENTER') {
    throw DissentError.invalidInput(
      'Domain Invariant Violation: theDissent section must have stance DISSENTER.'
    );
  }

  // Ensure all argument evidence references exist in the ledger
  assertArgumentEvidenceGrounding(brief.theDissent, brief.evidenceLedger);

  // If a human decision is attached, verify its invariants
  if (brief.humanDecision) {
    assertHumanDecisionInvariants(brief.humanDecision);
  }
}

/**
 * Lifecycle state machine transition assertion.
 */
export function assertStageTransition(
  from: AnalysisStageV1,
  to: AnalysisStageV1
): void {
  if (!isValidStageTransition(from, to)) {
    throw DissentError.analysisFailed(
      from,
      `Illegal lifecycle transition from ${from} to ${to}`
    );
  }
}
