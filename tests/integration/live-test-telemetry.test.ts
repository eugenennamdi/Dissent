import { describe, expect, it } from 'vitest';
import type { ModelCallMetadata } from '@/server/ai/structured-model.port';
import { wasRecoveryInvoked, type AttemptedModelCall } from './live-test-telemetry';

function completed(operation: string): ModelCallMetadata {
  return {
    operation,
    provider: 'DeepSeek',
    requestedModel: 'deepseek-flash',
    model: 'deepseek-flash',
    latencyMs: 10,
    configuredOutputTokenBudget: 6_000,
    configuredReasoningEffort: 'none',
  };
}

describe('live-test recovery telemetry', () => {
  it('does not mistake an unfinished parallel operation for recovery', () => {
    const attempted: AttemptedModelCall[] = [
      { operation: 'structureThesis', attempt: 1, configuredOutputTokenBudget: 1_800 },
      { operation: 'buildAdvocateCase', attempt: 1, configuredOutputTokenBudget: 6_000 },
      { operation: 'buildDissentCase', attempt: 1, configuredOutputTokenBudget: 6_000 },
    ];

    expect(
      wasRecoveryInvoked(attempted, [
        completed('structureThesis'),
        completed('buildAdvocateCase'),
      ])
    ).toBe(false);
  });

  it('detects an actual repeated attempt of the same operation', () => {
    const attempted: AttemptedModelCall[] = [
      { operation: 'buildAdvocateCase', attempt: 1, configuredOutputTokenBudget: 6_000 },
      { operation: 'buildAdvocateCase', attempt: 2, configuredOutputTokenBudget: 7_500 },
    ];

    expect(wasRecoveryInvoked(attempted, [completed('buildAdvocateCase')])).toBe(true);
  });

  it('honors explicit completed-call recovery metadata', () => {
    const attempted: AttemptedModelCall[] = [
      { operation: 'buildAdvocateCase', configuredOutputTokenBudget: 6_000 },
    ];
    const recovered = {
      ...completed('buildAdvocateCase'),
      attempt: 2 as const,
      recoveryKind: 'STRUCTURAL' as const,
    };

    expect(wasRecoveryInvoked(attempted, [recovered])).toBe(true);
  });
});
