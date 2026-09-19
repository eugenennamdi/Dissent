import { randomUUID } from 'node:crypto';
import {
  HumanDecisionV1Schema,
  type HumanDecisionV1,
} from '@/core/contracts/human-decision';
import { assertHumanDecisionInvariants } from '@/core/domain/invariants';
import type { HumanDecisionSubmissionV1 } from '@/lib/api/contracts';

export interface HumanDecisionServiceDependencies {
  now?: () => Date;
  decisionIdFactory?: () => string;
}

/**
 * Records an explicit anonymous application action. This establishes that the
 * decision came through the human-only UI operation, not a verified identity.
 */
export function recordAnonymousHumanDecision(
  submission: HumanDecisionSubmissionV1,
  dependencies: HumanDecisionServiceDependencies = {}
): HumanDecisionV1 {
  const decision = HumanDecisionV1Schema.parse({
    id: dependencies.decisionIdFactory?.() ?? `dec_${randomUUID()}`,
    runId: submission.runId,
    thesisId: submission.thesisId,
    decision: submission.decision,
    attribution: {
      actorType: 'HUMAN_OPERATOR',
      operatorId: 'anonymous-application-user',
      ...(submission.clientSessionId
        ? { clientSessionId: submission.clientSessionId }
        : {}),
      metadata: {
        attributionBasis: 'EXPLICIT_ANONYMOUS_USER_ACTION',
        identityVerified: false,
        triggersTradeExecution: false,
      },
    },
    ...(submission.notes === undefined ? {} : { notes: submission.notes }),
    decidedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    schemaVersion: 1,
  });
  assertHumanDecisionInvariants(decision);
  return decision;
}
