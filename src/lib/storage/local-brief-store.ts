import { z } from 'zod';
import { DissentBriefV1Schema, type DissentBriefV1 } from '@/core/contracts/brief';
import { ArgumentV1Schema, type ArgumentV1 } from '@/core/contracts/argument';
import { HumanDecisionV1Schema, type HumanDecisionV1 } from '@/core/contracts/human-decision';

const STORAGE_KEY = 'dissent_research_history_v1';
const ACTIVE_RUN_KEY = 'dissent_active_run_id_v1';

export const StoredResearchRunV1Schema = z
  .object({
    runId: z.string().min(1),
    thesisId: z.string().min(1),
    brief: DissentBriefV1Schema,
    advocateCase: ArgumentV1Schema.refine((arg) => arg.stance === 'ADVOCATE', {
      message: 'advocateCase must have ADVOCATE stance',
    }),
    timingsMs: z.object({
      structuring: z.number().nonnegative(),
      marketResearch: z.number().nonnegative(),
      argumentation: z.number().nonnegative(),
      stressTesting: z.number().nonnegative(),
      synthesis: z.number().nonnegative(),
      total: z.number().nonnegative(),
    }),
    savedAt: z.string().datetime(),
  })
  .strict();

export type StoredResearchRunV1 = z.infer<typeof StoredResearchRunV1Schema>;

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/**
 * Checks whether window.localStorage is accessible.
 */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__dissent_storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads all valid stored research runs from browser localStorage.
 * Malformed or incompatible records are safely filtered out without throwing.
 */
export function loadStoredRuns(): StoredResearchRunV1[] {
  if (!isStorageAvailable()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validRuns: StoredResearchRunV1[] = [];
    for (const item of parsed) {
      const result = StoredResearchRunV1Schema.safeParse(item);
      if (result.success) {
        validRuns.push(result.data);
      }
    }

    return validRuns;
  } catch {
    return [];
  }
}

/**
 * Gets the most recently viewed or saved run.
 */
export function getActiveOrLatestRun(): StoredResearchRunV1 | null {
  if (!isStorageAvailable()) return null;

  const runs = loadStoredRuns();
  if (runs.length === 0) return null;

  try {
    const activeRunId = window.localStorage.getItem(ACTIVE_RUN_KEY);
    if (activeRunId) {
      const matched = runs.find((r) => r.runId === activeRunId);
      if (matched) return matched;
    }
  } catch {
    // Fall back to latest run below
  }

  // Fall back to most recently saved
  return runs[0] ?? null;
}

/**
 * Sets the active run ID.
 */
export function setActiveRunId(runId: string | null): void {
  if (!isStorageAvailable()) return;
  try {
    if (runId) {
      window.localStorage.setItem(ACTIVE_RUN_KEY, runId);
    } else {
      window.localStorage.removeItem(ACTIVE_RUN_KEY);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Saves a completed research run.
 * Does NOT silently delete previous runs when storage fails.
 * Returns { ok: true } on success, or { ok: false, error: string } on failure.
 */
export function saveResearchRun(run: StoredResearchRunV1): SaveResult {
  if (!isStorageAvailable()) {
    return {
      ok: false,
      error: 'Browser local storage is not available in this environment (e.g. private mode or storage disabled).',
    };
  }

  // Validate payload before saving
  const validation = StoredResearchRunV1Schema.safeParse(run);
  if (!validation.success) {
    return {
      ok: false,
      error: `Invalid research run structure: ${validation.error.issues[0]?.message ?? 'Schema error'}`,
    };
  }

  try {
    const existing = loadStoredRuns();
    // Prepend new run, replacing any existing entry with the exact same runId
    const updated = [run, ...existing.filter((item) => item.runId !== run.runId)];

    const serialized = JSON.stringify(updated);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.localStorage.setItem(ACTIVE_RUN_KEY, run.runId);

    return { ok: true };
  } catch (err) {
    const isQuotaError =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);

    return {
      ok: false,
      error: isQuotaError
        ? 'Browser local storage quota exceeded. The completed brief is available in the current session but could not be saved to browser history.'
        : 'Failed to write to browser local storage.',
    };
  }
}

/**
 * Updates an existing stored brief with an explicit human decision.
 */
export function updateStoredDecision(
  runId: string,
  thesisId: string,
  decision: HumanDecisionV1
): SaveResult {
  if (!isStorageAvailable()) {
    return {
      ok: false,
      error: 'Browser storage unavailable.',
    };
  }

  const decisionValidation = HumanDecisionV1Schema.safeParse(decision);
  if (!decisionValidation.success) {
    return {
      ok: false,
      error: 'Invalid HumanDecision structure.',
    };
  }

  try {
    const existing = loadStoredRuns();
    const targetIndex = existing.findIndex(
      (r) => r.runId === runId && r.thesisId === thesisId
    );

    if (targetIndex === -1) {
      return {
        ok: false,
        error: `Could not find stored research run ${runId} to attach decision.`,
      };
    }

    const targetRun = existing[targetIndex]!;
    const updatedRun: StoredResearchRunV1 = {
      ...targetRun,
      brief: {
        ...targetRun.brief,
        humanDecision: decision,
      },
    };

    existing[targetIndex] = updatedRun;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Storage update failed.',
    };
  }
}

/**
 * Removes a specific research run from history.
 */
export function deleteStoredRun(runId: string): boolean {
  if (!isStorageAvailable()) return false;
  try {
    const existing = loadStoredRuns();
    const filtered = existing.filter((r) => r.runId !== runId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    const currentActive = window.localStorage.getItem(ACTIVE_RUN_KEY);
    if (currentActive === runId) {
      window.localStorage.removeItem(ACTIVE_RUN_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears all stored research history.
 */
export function clearAllStoredRuns(): boolean {
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_RUN_KEY);
    return true;
  } catch {
    return false;
  }
}
