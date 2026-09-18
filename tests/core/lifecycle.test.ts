import { describe, it, expect } from 'vitest';
import {
  AnalysisRunV1Schema,
  isValidStageTransition,
  isTerminalStage,
  type AnalysisRunV1,
} from '@/core/contracts/run';
import { assertStageTransition } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';

describe('AnalysisRun Lifecycle & State Machine', () => {
  const now = new Date().toISOString();

  it('correctly identifies terminal stages', () => {
    expect(isTerminalStage('COMPLETED')).toBe(true);
    expect(isTerminalStage('FAILED')).toBe(true);
    expect(isTerminalStage('DRAFT')).toBe(false);
    expect(isTerminalStage('RESEARCHING')).toBe(false);
    expect(isTerminalStage('SYNTHESIZING')).toBe(false);
  });

  it('validates canonical linear stage transitions', () => {
    expect(isValidStageTransition('DRAFT', 'STRUCTURING')).toBe(true);
    expect(isValidStageTransition('STRUCTURING', 'RESEARCHING')).toBe(true);
    expect(isValidStageTransition('RESEARCHING', 'ARGUING')).toBe(true);
    expect(isValidStageTransition('ARGUING', 'STRESS_TESTING')).toBe(true);
    expect(isValidStageTransition('STRESS_TESTING', 'SYNTHESIZING')).toBe(true);
    expect(isValidStageTransition('SYNTHESIZING', 'COMPLETED')).toBe(true);
  });

  it('permits failure transition from any active stage', () => {
    expect(isValidStageTransition('DRAFT', 'FAILED')).toBe(true);
    expect(isValidStageTransition('STRUCTURING', 'FAILED')).toBe(true);
    expect(isValidStageTransition('RESEARCHING', 'FAILED')).toBe(true);
    expect(isValidStageTransition('ARGUING', 'FAILED')).toBe(true);
    expect(isValidStageTransition('STRESS_TESTING', 'FAILED')).toBe(true);
    expect(isValidStageTransition('SYNTHESIZING', 'FAILED')).toBe(true);
  });

  it('disallows transitions out of COMPLETED', () => {
    expect(isValidStageTransition('COMPLETED', 'DRAFT')).toBe(false);
    expect(isValidStageTransition('COMPLETED', 'STRUCTURING')).toBe(false);
    expect(isValidStageTransition('COMPLETED', 'FAILED')).toBe(false);
  });

  it('allows retrying from FAILED state', () => {
    expect(isValidStageTransition('FAILED', 'RESEARCHING')).toBe(true);
    expect(isValidStageTransition('FAILED', 'STRUCTURING')).toBe(true);
    expect(isValidStageTransition('FAILED', 'SYNTHESIZING')).toBe(true);
  });

  it('assertStageTransition throws DissentError on illegal transitions', () => {
    expect(() => assertStageTransition('DRAFT', 'COMPLETED')).toThrow(DissentError);
    expect(() => assertStageTransition('COMPLETED', 'RESEARCHING')).toThrow(DissentError);
    expect(() => assertStageTransition('RESEARCHING', 'ARGUING')).not.toThrow();
  });

  it('validates a well-formed AnalysisRunV1 entity', () => {
    const run: AnalysisRunV1 = {
      id: 'run_789',
      thesisInput: {
        id: 'inp_789',
        rawText: 'SOL momentum will accelerate over 24h',
        submittedAt: now,
        schemaVersion: 1,
      },
      stage: 'DRAFT',
      stageHistory: [
        {
          stage: 'DRAFT',
          enteredAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };

    const parsed = AnalysisRunV1Schema.parse(run);
    expect(parsed.id).toBe('run_789');
    expect(parsed.stage).toBe('DRAFT');
  });
});
