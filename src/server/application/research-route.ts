import { randomUUID } from 'node:crypto';
import { DissentError } from '@/core/errors/domain-errors';
import {
  ResearchSubmissionV1Schema,
  ResearchSuccessResponseV1Schema,
  type ResearchSubmissionV1,
  type ResearchSuccessResponseV1,
} from '@/lib/api/contracts';
import {
  assertSameOriginRequest,
  jsonResponse,
  readBoundedJson,
  safeErrorResponse,
} from './http';
import { executeResearchSubmission } from './research.service';

export interface ResearchRouteDependencies {
  enabled?: boolean;
  execute?: (submission: ResearchSubmissionV1) => Promise<ResearchSuccessResponseV1>;
}

export async function handleResearchPost(
  request: Request,
  dependencies: ResearchRouteDependencies = {}
): Promise<Response> {
  const requestId = randomUUID();
  try {
    assertSameOriginRequest(request);
    const enabled =
      dependencies.enabled ?? process.env.RESEARCH_API_ENABLED?.toLowerCase() === 'true';
    if (!enabled) {
      throw DissentError.configurationError(
        'RESEARCH_API_ENABLED must be true before accepting cost-bearing requests.'
      );
    }
    const submission = ResearchSubmissionV1Schema.parse(await readBoundedJson(request));
    const result = ResearchSuccessResponseV1Schema.parse(
      await (dependencies.execute ?? executeResearchSubmission)(submission)
    );
    return jsonResponse(result);
  } catch (error) {
    return safeErrorResponse(error, requestId);
  }
}
