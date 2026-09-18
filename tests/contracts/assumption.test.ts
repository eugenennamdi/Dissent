import { describe, it, expect } from 'vitest';
import {
  AssumptionV1Schema,
  AssumptionStatusV1Schema,
  type AssumptionV1,
} from '@/core/contracts/assumption';

describe('AssumptionV1 Contracts & Status Semantics', () => {
  const now = new Date().toISOString();

  it('accepts the five canonical epistemic statuses', () => {
    expect(AssumptionStatusV1Schema.parse('UNTESTED')).toBe('UNTESTED');
    expect(AssumptionStatusV1Schema.parse('SUPPORTED')).toBe('SUPPORTED');
    expect(AssumptionStatusV1Schema.parse('QUESTIONED')).toBe('QUESTIONED');
    expect(AssumptionStatusV1Schema.parse('CONTRADICTED')).toBe('CONTRADICTED');
    expect(AssumptionStatusV1Schema.parse('INSUFFICIENT_EVIDENCE')).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('strictly rejects VALIDATED as epistemically excessive for market research', () => {
    expect(() => AssumptionStatusV1Schema.parse('VALIDATED')).toThrow();
  });

  it('validates a well-formed AssumptionV1 with default UNTESTED status', () => {
    const rawAssumption = {
      id: 'as_100',
      thesisId: 'th_123',
      claim: 'Broader risk appetite remains supportive for crypto assets',
      type: 'INFERRED' as const,
      category: 'MARKET_REGIME' as const,
      challenge: 'Sudden macroeconomic risk-off flight',
      invalidationCondition: 'Equities sell off > 3% on high volume',
      createdAt: now,
    };

    const parsed = AssumptionV1Schema.parse(rawAssumption);
    expect(parsed.status).toBe('UNTESTED');
    expect(parsed.claim).toContain('risk appetite');
  });

  it('validates an assumption marked as INSUFFICIENT_EVIDENCE', () => {
    const assumption: AssumptionV1 = {
      id: 'as_101',
      thesisId: 'th_123',
      claim: 'Whale OTC desk accumulation is accelerating',
      type: 'INFERRED',
      category: 'POSITIONING',
      status: 'INSUFFICIENT_EVIDENCE',
      challenge: 'No verifiable on-chain or exchange clustering found',
      invalidationCondition: 'OTC flow data confirms net distribution',
      supportingEvidenceIds: [],
      opposingEvidenceIds: [],
      createdAt: now,
      schemaVersion: 1,
    };

    const parsed = AssumptionV1Schema.parse(assumption);
    expect(parsed.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});
