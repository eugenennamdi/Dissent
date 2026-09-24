import { AssumptionV1Schema, type AssumptionV1 } from '@/core/contracts/assumption';
import { DissentBriefV1Schema, type DissentBriefV1 } from '@/core/contracts/brief';
import type { EvidenceLedgerV1 } from '@/core/contracts/evidence';
import {
  InvalidationConditionV1Schema,
  StressScenarioV1Schema,
  type InvalidationConditionV1,
  type StressScenarioV1,
} from '@/core/contracts/stress-scenario';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import {
  assertArgumentEvidenceGrounding,
  assertGeneratedBriefInvariants,
} from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import { z } from 'zod';
import type { SynthesisParams } from './ai-analyst.port';
import {
  AssumptionAssessmentDraftOutputSchema,
  StressResearchDraftOutputSchema,
  SynthesisDraftOutputSchema,
} from './ai-output.schemas';
import {
  assertSafeModelAuthoredText,
  deriveResearchLimitations,
  deterministicId,
  evidenceObservationCoverage,
} from './grounding';

type AssumptionAssessmentDraft = z.infer<typeof AssumptionAssessmentDraftOutputSchema>;
type StressResearchDraft = z.infer<typeof StressResearchDraftOutputSchema>;
type SynthesisDraft = z.infer<typeof SynthesisDraftOutputSchema>;

const SYNTHESIS_COVERAGE_RULES = [
  {
    observationType: 'FUNDING_RATE' as const,
    subjectPattern: /\bfunding(?:[- ]rate)?\b/i,
  },
  {
    observationType: 'OPEN_INTEREST' as const,
    subjectPattern: /\bopen[- ]interest\b/i,
  },
] as const;

const DIRECT_ABSENCE_PREFIX_PATTERN =
  /(?:\b(?:no|missing|absent|unavailable)\s+(?:(?:current|recent|available|relevant)\s+)?|\b(?:absence|lack)\s+of\s+)$/i;
const DIRECT_ABSENCE_SUFFIX_PATTERN =
  /^\s*(?:data|evidence|observations?|readings?|snapshots?|measurements?)?\s*(?:is|are|was|were|remains?|remain)\s+(?:not\s+(?:available|present)|missing|absent|unavailable)\b/i;
const REFERENTIAL_ABSENCE_PATTERN =
  /\b(?:those|these|the|such)\s+(?:readings|observations|snapshots|data|measurements|evidence)\s+(?:is|are|was|were|remains?|remain)\s+(?:not\s+(?:available|present)|missing|absent|unavailable)\b/i;
const COORDINATED_MEASUREMENT_ABSENCE_PATTERN =
  /\b(?:readings|observations|snapshots|data|measurements|evidence)\s+(?:is|are|was|were|remains?|remain)\s+(?:not\s+(?:available|present)|missing|absent|unavailable)\b/i;
const REPEATED_OBSERVATION_PATTERN =
  /\b(?:repeated|multiple|consecutive|serial|longitudinal|time[- ]series|series|over time)\b/i;

function claimsObservationAbsence(
  text: string,
  subjectPattern: RegExp
): { claimsAbsence: boolean; repeatedOnly: boolean } {
  const clauses = text.split(/(?:[.;!?]|\bbut\b|\bhowever\b)/i);
  for (const clause of clauses) {
    const subjectMatch = subjectPattern.exec(clause);
    if (!subjectMatch || subjectMatch.index === undefined) continue;
    const beforeSubject = clause.slice(Math.max(0, subjectMatch.index - 80), subjectMatch.index);
    const afterSubject = clause.slice(subjectMatch.index + subjectMatch[0].length);
    const directAbsence =
      DIRECT_ABSENCE_PREFIX_PATTERN.test(beforeSubject) ||
      DIRECT_ABSENCE_SUFFIX_PATTERN.test(afterSubject) ||
      REFERENTIAL_ABSENCE_PATTERN.test(afterSubject) ||
      (SYNTHESIS_COVERAGE_RULES.every((rule) => rule.subjectPattern.test(clause)) &&
        COORDINATED_MEASUREMENT_ABSENCE_PATTERN.test(clause));
    if (directAbsence) {
      return {
        claimsAbsence: true,
        repeatedOnly: REPEATED_OBSERVATION_PATTERN.test(clause),
      };
    }
  }
  return { claimsAbsence: false, repeatedOnly: false };
}

export function assertSynthesisUnknownEvidenceConsistency(
  unknowns: string[],
  ledger: EvidenceLedgerV1
): void {
  const coverageByType = new Map(
    evidenceObservationCoverage(ledger).map((coverage) => [
      coverage.observationType,
      coverage,
    ])
  );

  unknowns.forEach((unknown, index) => {
    for (const rule of SYNTHESIS_COVERAGE_RULES) {
      const claim = claimsObservationAbsence(unknown, rule.subjectPattern);
      if (!claim.claimsAbsence) continue;
      const coverage = coverageByType.get(rule.observationType);
      const contradictedByLedger = claim.repeatedOnly
        ? (coverage?.repeatedObservationMarkets.length ?? 0) > 0
        : coverage?.present === true;
      if (!contradictedByLedger) continue;

      const issuePath = `unknowns[${index}]`;
      throw DissentError.modelOutputInvalid(
        'synthesizeBrief',
        'A synthesized research gap contradicted the evidence ledger coverage.',
        {
          validationCategory: 'SYNTHESIS_EVIDENCE_COVERAGE_VALIDATION',
          invariantCode:
            'SYNTHESIS_UNKNOWN_MUST_NOT_CLAIM_PRESENT_OBSERVATION_IS_ABSENT',
          issuePath,
          issues: [
            {
              code: 'SYNTHESIS_UNKNOWN_MUST_NOT_CLAIM_PRESENT_OBSERVATION_IS_ABSENT',
              path: issuePath,
            },
          ],
          observationType: rule.observationType,
          safeExplanation:
            'A synthesized unknown claimed that an observation was unavailable even though matching ledger coverage exists.',
        }
      );
    }
  });
}

export function deriveStressExpectedWindow(thesis: StructuredThesisV1): string {
  const estimatedHours = thesis.timeHorizon.estimatedHours;
  if (estimatedHours === undefined) return 'Within the stated thesis horizon';
  const unit = estimatedHours === 1 ? 'hour' : 'hours';
  return `Within the stated thesis horizon of ${estimatedHours} ${unit}`;
}

interface StressDiagnosticInput {
  invariantCode: string;
  issuePath: string;
  safeExplanation: string;
  assumptionId?: string;
  artifactId?: string;
  scenarioIndex?: number;
  invalidationIndex?: number;
  extra?: Record<string, unknown>;
}

function stressDomainViolation(input: StressDiagnosticInput): DissentError {
  return DissentError.modelOutputInvalid('stressTest', input.safeExplanation, {
    validationCategory: 'DOMAIN_VALIDATION',
    invariantCode: input.invariantCode,
    issuePath: input.issuePath,
    issues: [{ code: input.invariantCode, path: input.issuePath }],
    safeExplanation: input.safeExplanation,
    ...(input.assumptionId ? { assumptionId: input.assumptionId } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.scenarioIndex === undefined ? {} : { scenarioIndex: input.scenarioIndex }),
    ...(input.invalidationIndex === undefined
      ? {}
      : { invalidationIndex: input.invalidationIndex }),
    ...input.extra,
  });
}

function assertStressKnownReferences(input: {
  selectedIds: string[];
  validIds: Set<string>;
  issuePath: string;
  invariantPrefix: string;
  safeArtifactKind: string;
  assumptionId?: string;
  scenarioIndex?: number;
  invalidationIndex?: number;
}): void {
  const unknownIds = input.selectedIds.filter((id) => !input.validIds.has(id));
  if (unknownIds.length > 0) {
    throw stressDomainViolation({
      invariantCode: `${input.invariantPrefix}_UNKNOWN_REFERENCE`,
      issuePath: input.issuePath,
      safeExplanation: `${input.safeArtifactKind} referenced an artifact outside the supplied research inputs.`,
      assumptionId: input.assumptionId,
      scenarioIndex: input.scenarioIndex,
      invalidationIndex: input.invalidationIndex,
      extra: { unknownIds },
    });
  }
  if (new Set(input.selectedIds).size !== input.selectedIds.length) {
    throw stressDomainViolation({
      invariantCode: `${input.invariantPrefix}_DUPLICATE_REFERENCE`,
      issuePath: input.issuePath,
      safeExplanation: `${input.safeArtifactKind} contained a duplicate artifact reference.`,
      assumptionId: input.assumptionId,
      scenarioIndex: input.scenarioIndex,
      invalidationIndex: input.invalidationIndex,
    });
  }
}

function parseStressDomainContract<TSchema extends z.ZodTypeAny>(input: {
  schema: TSchema;
  value: unknown;
  invariantCode: string;
  issuePath: string;
  safeExplanation: string;
  artifactId?: string;
  assumptionId?: string;
  scenarioIndex?: number;
  invalidationIndex?: number;
}): z.infer<TSchema> {
  const parsed = input.schema.safeParse(input.value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => ({
    code: issue.code,
    path: [input.issuePath, ...issue.path.map(String)].filter(Boolean).join('.'),
  }));
  throw DissentError.modelOutputInvalid('stressTest', input.safeExplanation, {
    validationCategory: 'DOMAIN_CONTRACT_VALIDATION',
    invariantCode: input.invariantCode,
    issuePath: issues[0]?.path ?? input.issuePath,
    issues,
    safeExplanation: input.safeExplanation,
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.assumptionId ? { assumptionId: input.assumptionId } : {}),
    ...(input.scenarioIndex === undefined ? {} : { scenarioIndex: input.scenarioIndex }),
    ...(input.invalidationIndex === undefined
      ? {}
      : { invalidationIndex: input.invalidationIndex }),
  });
}

function assertCompleteUniqueSelection(
  operation: string,
  label: string,
  selectedIds: string[],
  expectedIds: string[]
): void {
  const selected = new Set(selectedIds);
  const expected = new Set(expectedIds);
  if (
    selected.size !== selectedIds.length ||
    selected.size !== expected.size ||
    [...selected].some((id) => !expected.has(id))
  ) {
    throw DissentError.modelOutputInvalid(
      operation,
      `${label} must reference every supplied artifact exactly once.`,
      { selectedIds, expectedIds }
    );
  }
}

function assertKnownReferences(
  operation: string,
  label: string,
  selectedIds: string[],
  validIds: Set<string>
): void {
  const unknown = selectedIds.filter((id) => !validIds.has(id));
  if (unknown.length > 0) {
    throw DissentError.modelOutputInvalid(
      operation,
      `${label} contains references outside the supplied research artifacts.`,
      { unknownIds: unknown }
    );
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw DissentError.modelOutputInvalid(operation, `${label} contains duplicate references.`);
  }
}

function assertAssumptionStatusSupport(
  assessment: AssumptionAssessmentDraft['assumptionAssessments'][number],
  ledger: EvidenceLedgerV1,
  assessmentIndex: number
): void {
  const evidenceById = new Map(ledger.items.map((item) => [item.id, item]));
  const supportCount = assessment.supportingEvidenceIds.length;
  const opposition = assessment.opposingEvidenceIds.map((id) => evidenceById.get(id));
  const oppositionCount = opposition.length;

  if (assessment.status === 'SUPPORTED' && (supportCount === 0 || oppositionCount > 0)) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'SUPPORTED requires supporting evidence and no opposing evidence; it is not proof.',
      {
        validationCategory: 'ASSUMPTION_STATUS_EVIDENCE',
        invariantCode: 'SUPPORTED_REQUIRES_SUPPORT_ONLY',
        assumptionId: assessment.assumptionId,
        issuePath: `assumptionAssessments.${assessmentIndex}.status`,
        issues: [
          {
            code: 'SUPPORTED_REQUIRES_SUPPORT_ONLY',
            path: `assumptionAssessments.${assessmentIndex}.status`,
          },
        ],
        safeExplanation: 'SUPPORTED requires supporting evidence and no opposing evidence.',
      }
    );
  }
  if (assessment.status === 'QUESTIONED' && oppositionCount === 0) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'QUESTIONED requires evidence that materially challenges the assumption.',
      {
        validationCategory: 'ASSUMPTION_STATUS_EVIDENCE',
        invariantCode: 'QUESTIONED_REQUIRES_CHALLENGING_EVIDENCE',
        assumptionId: assessment.assumptionId,
        issuePath: `assumptionAssessments.${assessmentIndex}.status`,
        issues: [
          {
            code: 'QUESTIONED_REQUIRES_CHALLENGING_EVIDENCE',
            path: `assumptionAssessments.${assessmentIndex}.status`,
          },
        ],
        safeExplanation: 'QUESTIONED requires observed evidence that challenges the assumption.',
      }
    );
  }
  if (
    assessment.status === 'CONTRADICTED' &&
    (oppositionCount === 0 ||
      supportCount > 0 ||
      opposition.some((item) => item?.stance !== 'CONTRADICTING'))
  ) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'CONTRADICTED requires only ledger evidence explicitly classified as contradicting.',
      {
        validationCategory: 'ASSUMPTION_STATUS_EVIDENCE',
        invariantCode: 'CONTRADICTED_REQUIRES_CONTRADICTING_EVIDENCE',
        assumptionId: assessment.assumptionId,
        issuePath: `assumptionAssessments.${assessmentIndex}.status`,
        issues: [
          {
            code: 'CONTRADICTED_REQUIRES_CONTRADICTING_EVIDENCE',
            path: `assumptionAssessments.${assessmentIndex}.status`,
          },
        ],
        safeExplanation:
          'CONTRADICTED requires selected ledger evidence explicitly marked contradicting.',
      }
    );
  }
  if (
    assessment.status === 'INSUFFICIENT_EVIDENCE' &&
    (supportCount > 0 || oppositionCount > 0)
  ) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'INSUFFICIENT_EVIDENCE cannot simultaneously classify evidence as supporting or opposing.',
      {
        validationCategory: 'ASSUMPTION_STATUS_EVIDENCE',
        invariantCode: 'INSUFFICIENT_EVIDENCE_REQUIRES_NO_PROBATIVE_EVIDENCE',
        assumptionId: assessment.assumptionId,
        issuePath: `assumptionAssessments.${assessmentIndex}.status`,
        issues: [
          {
            code: 'INSUFFICIENT_EVIDENCE_REQUIRES_NO_PROBATIVE_EVIDENCE',
            path: `assumptionAssessments.${assessmentIndex}.status`,
          },
        ],
        safeExplanation:
          'INSUFFICIENT_EVIDENCE cannot classify evidence as supporting or opposing.',
      }
    );
  }
}

export function materializeTestedAssumptions(input: {
  assumptions: AssumptionV1[];
  ledger: EvidenceLedgerV1;
  draft: AssumptionAssessmentDraft;
}): AssumptionV1[] {
  const evidenceIds = new Set(input.ledger.items.map((item) => item.id));

  const selectedAssessmentIds = input.draft.assumptionAssessments.map(
    (item) => item.assumptionId
  );
  const expectedAssessmentIds = input.assumptions.map((item) => item.id);
  const selectedAssessmentIdSet = new Set(selectedAssessmentIds);
  const expectedAssessmentIdSet = new Set(expectedAssessmentIds);
  if (
    selectedAssessmentIdSet.size !== selectedAssessmentIds.length ||
    selectedAssessmentIdSet.size !== expectedAssessmentIdSet.size ||
    selectedAssessmentIds.some((id) => !expectedAssessmentIdSet.has(id))
  ) {
    throw stressDomainViolation({
      invariantCode: 'ASSUMPTION_ASSESSMENTS_MUST_BE_COMPLETE_AND_UNIQUE',
      issuePath: 'assumptionAssessments',
      safeExplanation: 'Assumption assessments must cover every supplied assumption exactly once.',
      extra: { selectedIds: selectedAssessmentIds, expectedIds: expectedAssessmentIds },
    });
  }
  const assessmentById = new Map(
    input.draft.assumptionAssessments.map((assessment, assessmentIndex) => {
      assertStressKnownReferences({
        selectedIds: assessment.supportingEvidenceIds,
        validIds: evidenceIds,
        issuePath: `assumptionAssessments.${assessmentIndex}.supportingEvidenceIds`,
        invariantPrefix: 'ASSESSMENT_SUPPORTING_EVIDENCE',
        safeArtifactKind: 'Assumption assessment supporting evidence',
        assumptionId: assessment.assumptionId,
      });
      assertStressKnownReferences({
        selectedIds: assessment.opposingEvidenceIds,
        validIds: evidenceIds,
        issuePath: `assumptionAssessments.${assessmentIndex}.opposingEvidenceIds`,
        invariantPrefix: 'ASSESSMENT_OPPOSING_EVIDENCE',
        safeArtifactKind: 'Assumption assessment opposing evidence',
        assumptionId: assessment.assumptionId,
      });
      const evidenceRoles = [
        ...assessment.supportingEvidenceIds,
        ...assessment.opposingEvidenceIds,
      ];
      if (new Set(evidenceRoles).size !== evidenceRoles.length) {
        throw stressDomainViolation({
          invariantCode: 'ASSESSMENT_EVIDENCE_ROLES_MUST_NOT_OVERLAP',
          issuePath: `assumptionAssessments.${assessmentIndex}`,
          safeExplanation:
            'An assumption assessment assigned the same evidence to conflicting roles.',
          assumptionId: assessment.assumptionId,
        });
      }
      assertAssumptionStatusSupport(assessment, input.ledger, assessmentIndex);
      return [assessment.assumptionId, assessment] as const;
    })
  );

  return input.assumptions.map((assumption) => {
    const assessment = assessmentById.get(assumption.id);
    if (!assessment) {
      throw stressDomainViolation({
        invariantCode: 'ASSUMPTION_ASSESSMENT_REQUIRED',
        issuePath: 'assumptionAssessments',
        safeExplanation: 'A supplied assumption was missing its stress assessment.',
        assumptionId: assumption.id,
      });
    }
    return parseStressDomainContract({
      schema: AssumptionV1Schema,
      value: {
        ...assumption,
        status: assessment.status,
        supportingEvidenceIds: assessment.supportingEvidenceIds,
        opposingEvidenceIds: assessment.opposingEvidenceIds,
      },
      invariantCode: 'TESTED_ASSUMPTION_CONTRACT_VALID',
      issuePath: `testedAssumptions.${assumption.id}`,
      safeExplanation: 'A server-assembled tested assumption violated its domain contract.',
      assumptionId: assumption.id,
    });
  });
}

export function materializeStressResearch(input: {
  thesis: StructuredThesisV1;
  testedAssumptions: AssumptionV1[];
  ledger: EvidenceLedgerV1;
  advocateCase: SynthesisParams['advocateCase'];
  dissentCase: SynthesisParams['dissentCase'];
  draft: StressResearchDraft;
}): {
  stressScenarios: StressScenarioV1[];
  invalidationConditions: InvalidationConditionV1[];
} {
  const operation = 'stressTest';
  const assumptionIds = new Set(input.testedAssumptions.map((item) => item.id));
  const evidenceIds = new Set(input.ledger.items.map((item) => item.id));
  const argumentPoints = [...input.advocateCase.points, ...input.dissentCase.points];
  const argumentPointIds = new Set(argumentPoints.map((item) => item.id));

  assertSafeModelAuthoredText(operation, [
    ...input.draft.scenarios.flatMap((item, index) => [
      { field: `scenarios[${index}].name`, value: item.name },
      { field: `scenarios[${index}].hypotheticalChange`, value: item.hypotheticalChange },
      { field: `scenarios[${index}].transmissionMechanism`, value: item.transmissionMechanism },
      { field: `scenarios[${index}].consequenceForThesis`, value: item.consequenceForThesis },
      ...item.uncertainties.map((value, uncertaintyIndex) => ({
        field: `scenarios[${index}].uncertainties[${uncertaintyIndex}]`,
        value,
      })),
    ]),
    ...input.draft.invalidationConditions.flatMap((item, index) => [
      { field: `invalidationConditions[${index}].statement`, value: item.statement },
      { field: `invalidationConditions[${index}].observableEvent`, value: item.observableEvent },
    ]),
  ]);

  const scenarioKeys = new Set<string>();
  const scenarioNames = new Set<string>();
  const stressScenarios = input.draft.scenarios.map((scenario, index) => {
    assertStressKnownReferences({
      selectedIds: scenario.affectedAssumptionIds,
      validIds: assumptionIds,
      issuePath: `scenarios.${index}.affectedAssumptionIds`,
      invariantPrefix: 'SCENARIO_ASSUMPTION',
      safeArtifactKind: 'Stress scenario assumptions',
      scenarioIndex: index,
    });
    assertStressKnownReferences({
      selectedIds: scenario.relevantEvidenceIds,
      validIds: evidenceIds,
      issuePath: `scenarios.${index}.relevantEvidenceIds`,
      invariantPrefix: 'SCENARIO_EVIDENCE',
      safeArtifactKind: 'Stress scenario evidence',
      scenarioIndex: index,
    });
    assertStressKnownReferences({
      selectedIds: scenario.relevantArgumentPointIds,
      validIds: argumentPointIds,
      issuePath: `scenarios.${index}.relevantArgumentPointIds`,
      invariantPrefix: 'SCENARIO_ARGUMENT_POINT',
      safeArtifactKind: 'Stress scenario argument points',
      scenarioIndex: index,
    });
    const normalizedName = scenario.name.trim().toLowerCase();
    const scenarioKey = `${scenario.scenarioType}:${[...scenario.affectedAssumptionIds].sort().join(',')}`;
    if (scenarioNames.has(normalizedName)) {
      throw stressDomainViolation({
        invariantCode: 'STRESS_SCENARIO_NAMES_MUST_BE_UNIQUE',
        issuePath: `scenarios.${index}.name`,
        safeExplanation: 'Stress scenarios must have distinct names.',
        scenarioIndex: index,
      });
    }
    if (scenarioKeys.has(scenarioKey)) {
      throw stressDomainViolation({
        invariantCode: 'STRESS_SCENARIO_PRESSURE_SIGNATURES_MUST_BE_UNIQUE',
        issuePath: `scenarios.${index}`,
        safeExplanation:
          'Stress scenarios must not repeat the same scenario type and affected-assumption set.',
        scenarioIndex: index,
      });
    }
    scenarioNames.add(normalizedName);
    scenarioKeys.add(scenarioKey);

    const scenarioId = deterministicId('scn', {
      thesisId: input.thesis.id,
      index,
      name: scenario.name,
      affectedAssumptionIds: scenario.affectedAssumptionIds,
    });
    return parseStressDomainContract({
      schema: StressScenarioV1Schema,
      value: {
        id: scenarioId,
        thesisId: input.thesis.id,
        name: scenario.name,
        description: `Hypothetical scenario: ${scenario.hypotheticalChange}`,
        affectedAssumptionIds: scenario.affectedAssumptionIds,
        relevantEvidenceIds: scenario.relevantEvidenceIds,
        transmissionMechanism: `Hypothetical mechanism: ${scenario.transmissionMechanism}`,
        scenarioType: scenario.scenarioType,
        plausibility: scenario.plausibility,
        consequenceForThesis: `Potential consequence: ${scenario.consequenceForThesis}`,
        uncertainties: scenario.uncertainties.map((value) => `Uncertainty: ${value}`),
        schemaVersion: 1,
      },
      invariantCode: 'STRESS_SCENARIO_CONTRACT_VALID',
      issuePath: `stressScenarios.${index}`,
      safeExplanation: 'A server-assembled stress scenario violated its domain contract.',
      artifactId: scenarioId,
      scenarioIndex: index,
    });
  });

  const invalidationConditions = input.draft.invalidationConditions.map((condition, index) => {
    assertStressKnownReferences({
      selectedIds: condition.targetAssumptionIds,
      validIds: assumptionIds,
      issuePath: `invalidationConditions.${index}.targetAssumptionIds`,
      invariantPrefix: 'INVALIDATION_ASSUMPTION',
      safeArtifactKind: 'Invalidation condition assumptions',
      invalidationIndex: index,
    });
    assertStressKnownReferences({
      selectedIds: condition.relevantEvidenceIds,
      validIds: evidenceIds,
      issuePath: `invalidationConditions.${index}.relevantEvidenceIds`,
      invariantPrefix: 'INVALIDATION_EVIDENCE',
      safeArtifactKind: 'Invalidation condition evidence',
      invalidationIndex: index,
    });
    if (
      condition.verificationSourceKind === 'BITGET_MARKET_DATA' &&
      condition.relevantEvidenceIds.length === 0
    ) {
      throw stressDomainViolation({
        invariantCode: 'BITGET_INVALIDATION_REQUIRES_LEDGER_EVIDENCE',
        issuePath: `invalidationConditions.${index}.relevantEvidenceIds`,
        safeExplanation:
          'A Bitget-verifiable invalidation condition requires relevant ledger evidence.',
        invalidationIndex: index,
      });
    }
    const invalidationId = deterministicId('inv', {
      thesisId: input.thesis.id,
      index,
      statement: condition.statement,
      targetAssumptionIds: condition.targetAssumptionIds,
    });
    return parseStressDomainContract({
      schema: InvalidationConditionV1Schema,
      value: {
        type: 'QUALITATIVE',
        id: invalidationId,
        thesisId: input.thesis.id,
        targetAssumptionIds: condition.targetAssumptionIds,
        relevantEvidenceIds: condition.relevantEvidenceIds,
        statement: `Thesis invalidation condition: ${condition.statement}`,
        observableEvent: `If observed: ${condition.observableEvent}`,
        verificationSource:
          condition.verificationSourceKind === 'BITGET_MARKET_DATA'
            ? 'Bitget observations represented in the Dissent evidence ledger'
            : 'A future primary source must be added to the Dissent evidence ledger before verification',
        expectedWindow: deriveStressExpectedWindow(input.thesis),
        urgency: 'THESIS_REVIEW',
        schemaVersion: 1,
      },
      invariantCode: 'INVALIDATION_CONDITION_CONTRACT_VALID',
      issuePath: `materializedInvalidationConditions.${index}`,
      safeExplanation:
        'A server-assembled invalidation condition violated its domain contract.',
      artifactId: invalidationId,
      invalidationIndex: index,
    });
  });

  return { stressScenarios, invalidationConditions };
}

export function materializeDissentBrief(input: {
  params: SynthesisParams;
  draft: SynthesisDraft;
  createdAt: string;
}): DissentBriefV1 {
  const operation = 'synthesizeBrief';
  const { params } = input;
  const evidenceById = new Map(params.evidenceLedger.items.map((item) => [item.id, item]));
  const assumptionsById = new Map(params.assumptions.map((item) => [item.id, item]));
  const dissentPointsById = new Map(params.dissentCase.points.map((item) => [item.id, item]));

  assertCompleteUniqueSelection(
    operation,
    'Dissent point classifications',
    input.draft.dissentPointClassifications.map((item) => item.dissentPointId),
    params.dissentCase.points.map((item) => item.id)
  );
  assertSafeModelAuthoredText(operation, [
    ...input.draft.dissentPointClassifications.map((item, index) => ({
      field: `dissentPointClassifications[${index}].explanation`,
      value: item.explanation,
    })),
    ...input.draft.unknowns.map((value, index) => ({
      field: `unknowns[${index}]`,
      value,
    })),
  ]);
  assertSynthesisUnknownEvidenceConsistency(input.draft.unknowns, params.evidenceLedger);

  const contradictions = input.draft.dissentPointClassifications.flatMap(
    (classification, index) => {
      const point = dissentPointsById.get(classification.dissentPointId);
      const evidence = evidenceById.get(classification.evidenceId);
      if (!point || !evidence || !point.evidenceIds.includes(classification.evidenceId)) {
        throw DissentError.modelOutputInvalid(
          operation,
          'A dissent classification must use evidence already referenced by that dissent point.'
        );
      }
      if (
        classification.targetType === 'THESIS_CLAIM'
          ? classification.targetId !== params.structuredThesis.id
          : !assumptionsById.has(classification.targetId)
      ) {
        throw DissentError.modelOutputInvalid(
          operation,
          'A dissent classification references a target outside the supplied thesis.'
        );
      }

      if (classification.classification !== 'DIRECT_CONTRADICTION') {
        if (classification.severity !== null) {
          throw DissentError.modelOutputInvalid(
            operation,
            'Only a direct contradiction may receive contradiction severity.'
          );
        }
        return [];
      }
      if (evidence.stance !== 'CONTRADICTING' || classification.severity === null) {
        throw DissentError.modelOutputInvalid(
          operation,
          'A direct contradiction requires ledger evidence explicitly classified as CONTRADICTING.'
        );
      }
      return [
        {
          id: deterministicId('ctr', {
            thesisId: params.structuredThesis.id,
            index,
            dissentPointId: classification.dissentPointId,
          }),
          targetType: classification.targetType,
          targetId: classification.targetId,
          statement: `Direct contradiction identified in dissent point: ${point.title}`,
          contradictingEvidenceId: classification.evidenceId,
          explanation: classification.explanation,
          severity: classification.severity,
        },
      ];
    }
  );

  const supportingIds = new Set(
    params.advocateCase.points.flatMap((point) => point.evidenceIds)
  );
  const supportingEvidence = params.evidenceLedger.items.filter((item) =>
    supportingIds.has(item.id)
  );
  const unknowns = [
    ...deriveResearchLimitations(params.evidenceLedger),
    ...input.draft.unknowns,
  ].filter((value, index, values) => values.indexOf(value) === index);

  const brief = DissentBriefV1Schema.parse({
    id: deterministicId('brf', {
      runId: params.runId,
      thesisId: params.structuredThesis.id,
      advocateCaseId: params.advocateCase.id,
      dissentCaseId: params.dissentCase.id,
    }),
    runId: params.runId,
    createdAt: input.createdAt,
    originalThesis: params.originalThesis.rawText,
    structuredThesis: params.structuredThesis,
    supportingEvidence,
    theDissent: params.dissentCase,
    assumptions: params.assumptions,
    contradictions,
    stressScenarios: params.stressScenarios,
    invalidationConditions: params.invalidationConditions,
    unknowns,
    evidenceLedger: params.evidenceLedger,
    humanDecision: null,
    schemaVersion: 1,
  });
  assertArgumentEvidenceGrounding(params.advocateCase, params.evidenceLedger);
  assertGeneratedBriefInvariants(brief);
  return brief;
}
