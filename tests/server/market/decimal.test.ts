import { describe, expect, it } from 'vitest';
import {
  canonicalDecimal,
  multiplyDecimalByPowerOfTen,
  percentageChange,
  relativeReturnPercent,
  subtractDecimals,
} from '@/server/market/decimal';

describe('market decimal arithmetic', () => {
  it('canonicalizes provider decimals without converting through binary floats', () => {
    expect(canonicalDecimal('00081.5000')).toBe('81.5');
    expect(canonicalDecimal('-0.0000')).toBe('0');
    expect(multiplyDecimalByPowerOfTen('0.000123', 2)).toBe('0.0123');
  });

  it('calculates percentage change and relative difference deterministically', () => {
    expect(percentageChange('100', '102')).toBe('2');
    expect(percentageChange('3', '4')).toBe('33.33333333');
    expect(subtractDecimals('5.00000000', '2')).toBe('3');
    expect(relativeReturnPercent('5', '2')).toBe('2.94117647');
    expect(relativeReturnPercent('-2', '-5')).toBe('3.15789474');
  });

  it('rejects malformed, non-finite, and zero-denominator inputs', () => {
    expect(() => canonicalDecimal('NaN')).toThrow();
    expect(() => canonicalDecimal('1e9')).toThrow();
    expect(() => percentageChange('0', '1')).toThrow();
    expect(() => relativeReturnPercent('1', '-100')).toThrow();
  });
});
