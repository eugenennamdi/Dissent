import { describe, it, expect } from 'vitest';
import {
  ThesisInputV1Schema,
  StructuredThesisV1Schema,
  type ThesisInputV1,
  type StructuredThesisV1,
} from '@/core/contracts/thesis';
import { assertThesisPreservation } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import {
  SUPPORTED_MARKET_NAMES,
  SUPPORTED_THESIS_MARKETS,
} from '@/core/domain/supported-markets';

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

  it('preserves leading and trailing whitespace in raw thesis text', () => {
    const rawText = '  ETH will outperform BTC.  ';
    expect(ThesisInputV1Schema.parse({ ...validThesisInput, rawText }).rawText).toBe(rawText);
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

  it('derives every supported market and direction from one authoritative definition', () => {
    expect(SUPPORTED_MARKET_NAMES).toEqual([
      'BTC/ETH',
      'BTC/SOL',
      'ETH/BTC',
      'ETH/SOL',
      'SOL/BTC',
      'SOL/ETH',
      'BTC/USDT',
      'ETH/USDT',
      'SOL/USDT',
    ]);
    expect(SUPPORTED_THESIS_MARKETS.filter((item) => item.kind === 'RELATIVE')).toHaveLength(6);
    expect(
      SUPPORTED_THESIS_MARKETS.filter((item) => item.kind === 'SINGLE_ASSET')
    ).toHaveLength(3);
  });

  it.each([
    { market: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT', direction: 'LONG' },
    { market: 'BTC/USDT', baseAsset: 'BTC', quoteAsset: 'USDT', direction: 'SHORT' },
    { market: 'SOL/BTC', baseAsset: 'SOL', quoteAsset: 'BTC', direction: 'RELATIVE_LONG' },
    { market: 'ETH/SOL', baseAsset: 'ETH', quoteAsset: 'SOL', direction: 'RELATIVE_SHORT' },
  ] as const)('accepts $market with $direction', (combination) => {
    expect(() =>
      StructuredThesisV1Schema.parse({
        id: 'th_supported',
        thesisInputId: validThesisInput.id,
        originalThesis: validThesisInput.rawText,
        ...combination,
        claim: 'Supported thesis',
        timeHorizon: { description: 'one day' },
        catalysts: [],
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      })
    ).not.toThrow();
  });

  it.each([
    { market: 'XRP/USDT', baseAsset: 'XRP', quoteAsset: 'USDT', direction: 'LONG' },
    { market: 'SOL/SOL', baseAsset: 'SOL', quoteAsset: 'SOL', direction: 'RELATIVE_LONG' },
    { market: 'SOL/USDT', baseAsset: 'SOL', quoteAsset: 'USDT', direction: 'RELATIVE_LONG' },
    { market: 'SOL/BTC', baseAsset: 'BTC', quoteAsset: 'SOL', direction: 'RELATIVE_LONG' },
    { market: 'SOL/BTC', baseAsset: 'SOL', quoteAsset: 'BTC', direction: 'LONG' },
  ])('rejects unsupported or inconsistent thesis combination', (combination) => {
    expect(() =>
      StructuredThesisV1Schema.parse({
        id: 'th_invalid',
        thesisInputId: validThesisInput.id,
        originalThesis: validThesisInput.rawText,
        ...combination,
        claim: 'Invalid thesis',
        timeHorizon: { description: 'one day' },
        catalysts: [],
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      })
    ).toThrow();
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
