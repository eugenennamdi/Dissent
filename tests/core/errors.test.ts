import { describe, it, expect } from 'vitest';
import { DissentError } from '@/core/errors/domain-errors';

describe('DissentError Model', () => {
  it('creates typed invalidInput errors with correct retryable flag', () => {
    const err = DissentError.invalidInput('Malformed thesis text');
    expect(err.name).toBe('DissentError');
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.retryable).toBe(false);
  });

  it('creates typed evidenceUnavailable errors marked as retryable', () => {
    const err = DissentError.evidenceUnavailable('Bitget ETH/BTC orderbook');
    expect(err.code).toBe('EVIDENCE_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('creates typed externalProviderError with details', () => {
    const err = DissentError.externalProviderError('Bitget', 'Rate limit exceeded', {
      statusCode: 429,
    });
    expect(err.code).toBe('EXTERNAL_PROVIDER_ERROR');
    expect(err.retryable).toBe(true);
    expect(err.details?.statusCode).toBe(429);
  });

  it('creates timeout error with timing details', () => {
    const err = DissentError.timeout('fetchFundingRate', 5000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('timed out after 5000ms');
  });
});
