import type { ArgumentV1 } from '@/core/contracts/argument';
import { DissentError } from '@/core/errors/domain-errors';
import type { ModelCallMetadata } from './structured-model.port';

function comparableArgument(argument: ArgumentV1) {
  return {
    summary: argument.summary,
    points: argument.points.map((point) => ({
      title: point.title,
      reasoning: point.reasoning,
      evidenceIds: point.evidenceIds,
      targetAssumptionIds: point.targetAssumptionIds,
      weight: point.weight,
    })),
    counterweights: argument.risksOrCounterweightsConsidered,
  };
}

export function assertAdvocateDissenterDistinct(
  advocateCase: ArgumentV1,
  dissentCase: ArgumentV1,
  modelCalls: readonly ModelCallMetadata[] = []
): void {
  if (
    JSON.stringify(comparableArgument(advocateCase)) !==
    JSON.stringify(comparableArgument(dissentCase))
  ) {
    return;
  }

  const argumentCalls = modelCalls.filter(
    (call) =>
      call.operation === 'buildAdvocateCase' || call.operation === 'buildDissentCase'
  );
  const actualModels = [...new Set(argumentCalls.map((call) => call.model))];
  const requestedModels = [
    ...new Set(
      argumentCalls.flatMap((call) =>
        call.requestedModel ? [call.requestedModel] : []
      )
    ),
  ];
  const error = DissentError.modelOutputInvalid(
    'argumentation',
    'Advocate and Dissenter returned materially identical cases.',
    {
      validationCategory: 'CROSS_ARGUMENT_VALIDATION',
      invariantCode: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
      issuePath: 'arguments',
      issues: [
        {
          code: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
          path: 'arguments',
        },
      ],
      argumentStance: 'CROSS_ARGUMENT',
      safeExplanation:
        'Advocate and Dissenter must provide materially distinct interpretations.',
      attempt: Math.max(...argumentCalls.map((call) => call.attempt ?? 1), 1),
    }
  );
  console.warn('DISSENT_AI_ARGUMENT_INVALID', {
    provider: 'DeepSeek',
    operation: 'argumentation',
    requestedModel: requestedModels.length === 1 ? requestedModels[0] : undefined,
    actualModel: actualModels.length === 1 ? actualModels[0] : undefined,
    validationCategory: error.details?.validationCategory,
    invariantCode: error.details?.invariantCode,
    issuePath: error.details?.issuePath,
    argumentStance: error.details?.argumentStance,
    argumentPointIndex: undefined,
    evidenceId: undefined,
    assumptionId: undefined,
    safeExplanation: error.details?.safeExplanation,
    issues: error.details?.issues,
    attempt: error.details?.attempt,
    requestId: undefined,
  });
  throw error;
}
