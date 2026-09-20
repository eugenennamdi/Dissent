import type { ModelCallMetadata } from '@/server/ai/structured-model.port';

export interface AttemptedModelCall {
  operation: string;
  attempt?: 1 | 2;
  configuredOutputTokenBudget: number;
}

export function wasRecoveryInvoked(
  attemptedCalls: readonly AttemptedModelCall[],
  completedCalls: readonly ModelCallMetadata[]
): boolean {
  if (
    attemptedCalls.some((call) => (call.attempt ?? 1) > 1) ||
    completedCalls.some(
      (call) => (call.attempt ?? 1) > 1 || call.recoveryKind !== undefined
    )
  ) {
    return true;
  }

  const attemptsByOperation = new Map<string, number>();
  for (const call of attemptedCalls) {
    const count = (attemptsByOperation.get(call.operation) ?? 0) + 1;
    if (count > 1) return true;
    attemptsByOperation.set(call.operation, count);
  }
  return false;
}
