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
import type { z } from 'zod';
import type { SynthesisParams } from './ai-analyst.port';
import {
  StressTestDraftOutputSchema,
  SynthesisDraftOutputSchema,
} from './ai-output.schemas';
import {
  assertSafeModelAuthoredText,
  deriveResearchLimitations,
  deterministicId,
} from './grounding';

type StressTestDraft = z.infer<typeof StressTestDraftOutputSchema>;
type SynthesisDraft = z.infer<typeof SynthesisDraftOutputSchema>;

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
  assessment: StressTestDraft['assumptionAssessments'][number],
  ledger: EvidenceLedgerV1
): void {
  const evidenceById = new Map(ledger.items.map((item) => [item.id, item]));
  const supportCount = assessment.supportingEvidenceIds.length;
  const opposition = assessment.opposingEvidenceIds.map((id) => evidenceById.get(id));
  const oppositionCount = opposition.length;

  if (assessment.status === 'SUPPORTED' && (supportCount === 0 || oppositionCount > 0)) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'SUPPORTED requires supporting evidence and no opposing evidence; it is not proof.'
    );
  }
  if (assessment.status === 'QUESTIONED' && oppositionCount === 0) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'QUESTIONED requires evidence that materially challenges the assumption.'
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
      'CONTRADICTED requires only ledger evidence explicitly classified as contradicting.'
    );
  }
  if (
    assessment.status === 'INSUFFICIENT_EVIDENCE' &&
    (supportCount > 0 || oppositionCount > 0)
  ) {
    throw DissentError.modelOutputInvalid(
      'stressTest',
      'INSUFFICIENT_EVIDENCE cannot simultaneously classify evidence as supporting or opposing.'
    );
  }
}

export function materializeStressTest(input: {
  thesis: StructuredThesisV1;
  assumptions: AssumptionV1[];
  ledger: EvidenceLedgerV1;
  advocateCase: SynthesisParams['advocateCase'];
  dissentCase: SynthesisParams['dissentCase'];
  draft: StressTestDraft;
}): {
  stressScenarios: StressScenarioV1[];
  invalidationConditions: InvalidationConditionV1[];
  testedAssumptions: AssumptionV1[];
} {
  const operation = 'stressTest';
  const assumptionIds = new Set(input.assumptions.map((item) => item.id));
  const evidenceIds = new Set(input.ledger.items.map((item) => item.id));
  const argumentPoints = [...input.advocateCase.points, ...input.dissentCase.points];
  const argumentPointIds = new Set(argumentPoints.map((item) => item.id));

  assertCompleteUniqueSelection(
    operation,
    'Assumption assessments',
    input.draft.assumptionAssessments.map((item) => item.assumptionId),
    input.assumptions.map((item) => item.id)
  );
  assertSafeModelAuthoredText(operation, [
    ...input.draft.assumptionAssessments.flatMap((item, index) => [
      { field: `assumptionAssessments[${index}].finding`, value: item.finding },
      ...item.unknowns.map((value, unknownIndex) => ({
        field: `assumptionAssessments[${index}].unknowns[${unknownIndex}]`,
        value,
      })),
    ]),
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
      { field: `invalidationConditions[${index}].expectedWindow`, value: item.expectedWindow },
    ]),
  ]);

  const assessmentById = new Map(
    input.draft.assumptionAssessments.map((assessment) => {
      assertKnownReferences(
        operation,
        `Assessment ${assessment.assumptionId} supporting evidence`,
        assessment.supportingEvidenceIds,
        evidenceIds
      );
      assertKnownReferences(
        operation,
        `Assessment ${assessment.assumptionId} opposing evidence`,
        assessment.opposingEvidenceIds,
        evidenceIds
      );
      assertKnownReferences(
        operation,
        `Assessment ${assessment.assumptionId} context evidence`,
        assessment.contextEvidenceIds,
        evidenceIds
      );
      assertKnownReferences(
        operation,
        `Assessment ${assessment.assumptionId} argument points`,
        assessment.relevantArgumentPointIds,
        argumentPointIds
      );
      const evidenceRoles = [
        ...assessment.supportingEvidenceIds,
        ...assessment.opposingEvidenceIds,
        ...assessment.contextEvidenceIds,
      ];
      if (new Set(evidenceRoles).size !== evidenceRoles.length) {
        throw DissentError.modelOutputInvalid(
          operation,
          `Assessment ${assessment.assumptionId} assigns the same evidence to conflicting roles.`
        );
      }
      assertAssumptionStatusSupport(assessment, input.ledger);
      return [assessment.assumptionId, assessment] as const;
    })
  );

  const testedAssumptions = input.assumptions.map((assumption) => {
    const assessment = assessmentById.get(assumption.id);
    if (!assessment) {
      throw DissentError.modelOutputInvalid(operation, `Missing assessment for ${assumption.id}.`);
    }
    return AssumptionV1Schema.parse({
      ...assumption,
      status: assessment.status,
      supportingEvidenceIds: assessment.supportingEvidenceIds,
      opposingEvidenceIds: assessment.opposingEvidenceIds,
    });
  });

  const scenarioKeys = new Set<string>();
  const scenarioNames = new Set<string>();
  const stressScenarios = input.draft.scenarios.map((scenario, index) => {
    assertKnownReferences(
      operation,
      `Scenario ${scenario.name} assumptions`,
      scenario.affectedAssumptionIds,
      assumptionIds
    );
    assertKnownReferences(
      operation,
      `Scenario ${scenario.name} evidence`,
      scenario.relevantEvidenceIds,
      evidenceIds
    );
    assertKnownReferences(
      operation,
      `Scenario ${scenario.name} argument points`,
      scenario.relevantArgumentPointIds,
      argumentPointIds
    );
    const normalizedName = scenario.name.trim().toLowerCase();
    const scenarioKey = `${scenario.scenarioType}:${[...scenario.affectedAssumptionIds].sort().join(',')}`;
    if (scenarioNames.has(normalizedName) || scenarioKeys.has(scenarioKey)) {
      throw DissentError.modelOutputInvalid(
        operation,
        'Stress scenarios must be materially distinct in name, type, and assumption pressure.'
      );
    }
    scenarioNames.add(normalizedName);
    scenarioKeys.add(scenarioKey);

    return StressScenarioV1Schema.parse({
      id: deterministicId('scn', {
        thesisId: input.thesis.id,
        index,
        name: scenario.name,
        affectedAssumptionIds: scenario.affectedAssumptionIds,
      }),
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
    });
  });

  const invalidationConditions = input.draft.invalidationConditions.map((condition, index) => {
    assertKnownReferences(
      operation,
      `Invalidation ${index} assumptions`,
      condition.targetAssumptionIds,
      assumptionIds
    );
    assertKnownReferences(
      operation,
      `Invalidation ${index} evidence`,
      condition.relevantEvidenceIds,
      evidenceIds
    );
    if (
      condition.verificationSourceKind === 'BITGET_MARKET_DATA' &&
      condition.relevantEvidenceIds.length === 0
    ) {
      throw DissentError.modelOutputInvalid(
        operation,
        `Invalidation ${index} claims Bitget verification without relevant ledger evidence.`
      );
    }
    return InvalidationConditionV1Schema.parse({
      type: 'QUALITATIVE',
      id: deterministicId('inv', {
        thesisId: input.thesis.id,
        index,
        statement: condition.statement,
        targetAssumptionIds: condition.targetAssumptionIds,
      }),
      thesisId: input.thesis.id,
      targetAssumptionIds: condition.targetAssumptionIds,
      relevantEvidenceIds: condition.relevantEvidenceIds,
      statement: `Thesis invalidation condition: ${condition.statement}`,
      observableEvent: `If observed: ${condition.observableEvent}`,
      verificationSource:
        condition.verificationSourceKind === 'BITGET_MARKET_DATA'
          ? 'Bitget observations represented in the Dissent evidence ledger'
          : 'A future primary source must be added to the Dissent evidence ledger before verification',
      expectedWindow: condition.expectedWindow,
      urgency: 'THESIS_REVIEW',
      schemaVersion: 1,
    });
  });

  return { stressScenarios, invalidationConditions, testedAssumptions };
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
