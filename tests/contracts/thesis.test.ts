import { describe, it, expect } from 'vitest';
import {
  ThesisInputV1Schema,
  StructuredThesisV1Schema,
  type ThesisInputV1,
  type StructuredThesisV1,
} from '@/core/contracts/thesis';
import { assertThesisPreservation } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';

describe('Thesis Contracts & Invariants', () => {
  const validThesisInput: ThesisInputV1 = {
    id: 'inp_123',
    rawText: 'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving.',
    submittedAt: new Date().toISOString(),
    schemaVersion: 1,
  };

  it('validates a well-formed ThesisInputV1', () => {
    const parsed = ThesisInputV1Schema.parse(validThesisInput);
    expect(parsed.rawText).toBe(validThesisInput.rawText);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('rejects an empty or too-short ThesisInput', () => {
    expect(() =>
      ThesisInputV1Schema.parse({
        id: 'inp_empty',
        rawText: '  ',
        submittedAt: new Date().toISOString(),
        schemaVersion: 1,
      })
    ).toThrow();
  });

  it('validates a well-formed StructuredThesisV1', () => {
    const validStructured: StructuredThesisV1 = {
      id: 'th_456',
      thesisInputId: validThesisInput.id,
      originalThesis: validThesisInput.rawText,
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      claim: 'ETH will outperform BTC',
      direction: 'RELATIVE_LONG',
      timeHorizon: {
        description: '48 hours',
        estimatedHours: 48,
      },
      catalysts: ['improving risk appetite', 'strengthening relative momentum'],
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    const parsed = StructuredThesisV1Schema.parse(validStructured);
    expect(parsed.market).toBe('ETH/BTC');
    expect(parsed.direction).toBe('RELATIVE_LONG');
  });

  it('enforces verbatim thesis preservation invariant', () => {
    const structured: StructuredThesisV1 = {
      id: 'th_456',
      thesisInputId: validThesisInput.id,
      originalThesis: validThesisInput.rawText,
      market: 'ETH/BTC',
      baseAsset: 'ETH',
      quoteAsset: 'BTC',
      claim: 'ETH will outperform BTC',
      direction: 'RELATIVE_LONG',
      timeHorizon: { description: '48 hours' },
      catalysts: ['risk appetite'],
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    expect(() => assertThesisPreservation(validThesisInput, structured)).not.toThrow();

    // Altered original thesis must throw
    const altered = { ...structured, originalThesis: 'Altered thesis narrative' };
    expect(() => assertThesisPreservation(validThesisInput, altered)).toThrow(DissentError);
  });
});
