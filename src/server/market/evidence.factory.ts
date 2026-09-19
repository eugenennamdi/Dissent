import { createHash } from 'node:crypto';
import {
  EvidenceLedgerV1Schema,
  EvidenceV1Schema,
  isEvidenceStale,
  type EvidenceLedgerV1,
  type EvidenceV1,
} from '@/core/contracts/evidence';
import { assertEvidenceLedgerIntegrity } from '@/core/domain/invariants';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalJsonValue(child)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function createEvidenceId(identity: Record<string, unknown>): string {
  return `ev_${sha256Canonical(identity)}`;
}

export function validateEvidence(evidence: EvidenceV1): EvidenceV1 {
  return deepFreeze(EvidenceV1Schema.parse(evidence));
}

export function assembleEvidenceLedger(
  thesisId: string,
  items: EvidenceV1[],
  assembledAt: string
): EvidenceLedgerV1 {
  const categoriesPresent = [...new Set(items.map((item) => item.category))].sort();
  const itemIds = items.map((item) => item.id).sort();
  const ledger: EvidenceLedgerV1 = {
    id: `led_${sha256Canonical({ thesisId, itemIds })}`,
    thesisId,
    items,
    summary: {
      totalCount: items.length,
      supportingCount: items.filter((item) => item.stance === 'SUPPORTING').length,
      contradictingCount: items.filter((item) => item.stance === 'CONTRADICTING').length,
      neutralCount: items.filter((item) => item.stance === 'NEUTRAL').length,
      staleCountAtAssembly: items.filter((item) => isEvidenceStale(item, assembledAt)).length,
      categoriesPresent,
    },
    assembledAt,
    schemaVersion: 1,
  };

  const parsed = EvidenceLedgerV1Schema.parse(ledger);
  assertEvidenceLedgerIntegrity(parsed);
  return deepFreeze(parsed);
}
