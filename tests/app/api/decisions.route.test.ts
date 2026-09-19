import { describe, expect, it } from 'vitest';
import {
  ApiFailureResponseV1Schema,
  HumanDecisionSuccessResponseV1Schema,
} from '@/lib/api/contracts';
import { handleHumanDecisionPost } from '@/server/application/human-decision-route';
import { recordAnonymousHumanDecision } from '@/server/application/human-decision.service';

function request(value: unknown): Request {
  return new Request('http://localhost/api/decisions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(value),
  });
}

describe('POST /api/decisions', () => {
  it('records an explicit anonymous human action with server-owned attribution and time', async () => {
    const response = await handleHumanDecisionPost(
      request({
        runId: 'run_api_1',
        thesisId: 'th_api_1',
        decision: 'WATCH',
        notes: 'Wait for broader regime evidence.',
        clientSessionId: 'session_local_1',
        confirmedByUser: true,
      }),
      {
        record: (submission) =>
          recordAnonymousHumanDecision(submission, {
            now: () => new Date('2026-09-20T12:00:00.000Z'),
            decisionIdFactory: () => 'dec_api_1',
          }),
      }
    );
    const body = HumanDecisionSuccessResponseV1Schema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.decision).toMatchObject({
      id: 'dec_api_1',
      runId: 'run_api_1',
      thesisId: 'th_api_1',
      decision: 'WATCH',
      decidedAt: '2026-09-20T12:00:00.000Z',
      attribution: {
        actorType: 'HUMAN_OPERATOR',
        operatorId: 'anonymous-application-user',
        clientSessionId: 'session_local_1',
        metadata: {
          attributionBasis: 'EXPLICIT_ANONYMOUS_USER_ACTION',
          identityVerified: false,
          triggersTradeExecution: false,
        },
      },
    });
    expect(body.persistence.serverStored).toBe(false);
  });

  it('rejects unsupported decisions, missing confirmation, and client-authored attribution', async () => {
    for (const invalid of [
      {
        runId: 'run_api_1',
        thesisId: 'th_api_1',
        decision: 'BUY',
        confirmedByUser: true,
      },
      {
        runId: 'run_api_1',
        thesisId: 'th_api_1',
        decision: 'PASS',
        confirmedByUser: false,
      },
      {
        runId: 'run_api_1',
        thesisId: 'th_api_1',
        decision: 'PROCEED',
        confirmedByUser: true,
        actorType: 'HUMAN_OPERATOR',
      },
    ]) {
      const response = await handleHumanDecisionPost(request(invalid));
      const body = ApiFailureResponseV1Schema.parse(await response.json());
      expect(response.status).toBe(400);
      expect(body.error.code).toBe('INVALID_INPUT');
    }
  });
});
