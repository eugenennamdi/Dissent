import { describe, it, expect } from 'vitest';
import {
  HumanDecisionV1Schema,
  HumanDecisionTypeV1Schema,
  type HumanDecisionV1,
} from '@/core/contracts/human-decision';
import { assertHumanDecisionInvariants } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';

describe('HumanDecision Contracts & Invariants', () => {
  const now = new Date().toISOString();

  it('restricts decision types strictly to PROCEED, WATCH, and PASS', () => {
    expect(HumanDecisionTypeV1Schema.parse('PROCEED')).toBe('PROCEED');
    expect(HumanDecisionTypeV1Schema.parse('WATCH')).toBe('WATCH');
    expect(HumanDecisionTypeV1Schema.parse('PASS')).toBe('PASS');

    // Bot / execution decisions must fail schema validation
    expect(() => HumanDecisionTypeV1Schema.parse('BUY')).toThrow();
    expect(() => HumanDecisionTypeV1Schema.parse('SELL')).toThrow();
    expect(() => HumanDecisionTypeV1Schema.parse('EXECUTE')).toThrow();
  });

  it('validates a verified human operator decision', () => {
    const validDecision: HumanDecisionV1 = {
      id: 'dec_001',
      runId: 'run_123',
      thesisId: 'th_123',
      decision: 'PROCEED',
      attribution: {
        actorType: 'HUMAN_OPERATOR',
        operatorId: 'trader_alice',
        clientSessionId: 'sess_987',
      },
      notes: 'Counter-case was considered; sizing reduced to account for BTC dominance risk.',
      decidedAt: now,
      schemaVersion: 1,
    };

    const parsed = HumanDecisionV1Schema.parse(validDecision);
    expect(parsed.decision).toBe('PROCEED');
    expect(parsed.attribution.actorType).toBe('HUMAN_OPERATOR');
    expect(parsed.attribution.operatorId).toBe('trader_alice');
    expect(() => assertHumanDecisionInvariants(parsed)).not.toThrow();
  });

  it('structurally prevents an AI or non-human actor from authoring a decision', () => {
    const aiAttempt = {
      id: 'dec_002',
      runId: 'run_123',
      thesisId: 'th_123',
      decision: 'PROCEED',
      attribution: {
        actorType: 'AI_MODEL', // Structurally rejected by schema
        operatorId: 'gpt-5.6',
      },
      decidedAt: now,
      schemaVersion: 1,
    };

    expect(() => HumanDecisionV1Schema.parse(aiAttempt)).toThrow();
  });

  it('rejects decisions with empty operator attribution ID', () => {
    const emptyOperatorAttempt = {
      id: 'dec_003',
      runId: 'run_123',
      thesisId: 'th_123',
      decision: 'WATCH',
      attribution: {
        actorType: 'HUMAN_OPERATOR' as const,
        operatorId: '',
      },
      decidedAt: now,
      schemaVersion: 1,
    };

    expect(() => HumanDecisionV1Schema.parse(emptyOperatorAttempt)).toThrow();

    // Domain invariant also guards against whitespace operator IDs
    const whitespaceOperator: HumanDecisionV1 = {
      id: 'dec_004',
      runId: 'run_123',
      thesisId: 'th_123',
      decision: 'WATCH',
      attribution: {
        actorType: 'HUMAN_OPERATOR',
        operatorId: '   ',
      },
      decidedAt: now,
      schemaVersion: 1,
    };
    expect(() => assertHumanDecisionInvariants(whitespaceOperator)).toThrow(DissentError);
  });
});
