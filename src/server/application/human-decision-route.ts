import { randomUUID } from 'node:crypto';
import type { HumanDecisionV1 } from '@/core/contracts/human-decision';
import {
  BROWSER_LOCAL_PERSISTENCE,
  HumanDecisionSubmissionV1Schema,
  HumanDecisionSuccessResponseV1Schema,
  type HumanDecisionSubmissionV1,
} from '@/lib/api/contracts';
import {
  assertSameOriginRequest,
  jsonResponse,
  readBoundedJson,
  safeErrorResponse,
} from './http';
import { recordAnonymousHumanDecision } from './human-decision.service';

export interface HumanDecisionRouteDependencies {
  record?: (submission: HumanDecisionSubmissionV1) => HumanDecisionV1;
}

export async function handleHumanDecisionPost(
  request: Request,
  dependencies: HumanDecisionRouteDependencies = {}
): Promise<Response> {
  const requestId = randomUUID();
  try {
    assertSameOriginRequest(request);
    const submission = HumanDecisionSubmissionV1Schema.parse(await readBoundedJson(request));
    const decision = (dependencies.record ?? recordAnonymousHumanDecision)(submission);
    const result = HumanDecisionSuccessResponseV1Schema.parse({
      ok: true,
      state: 'RECORDED',
      decision,
      persistence: BROWSER_LOCAL_PERSISTENCE,
    });
    return jsonResponse(result);
  } catch (error) {
    return safeErrorResponse(error, requestId);
  }
}
