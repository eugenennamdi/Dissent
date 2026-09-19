export const DISSENT_ERROR_CODES = [
  'INVALID_INPUT',
  'CONFIGURATION_ERROR',
  'UNSUPPORTED_MARKET',
  'EVIDENCE_UNAVAILABLE',
  'EVIDENCE_STALE',
  'EXTERNAL_PROVIDER_ERROR',
  'MODEL_OUTPUT_INVALID',
  'OUTPUT_TRUNCATED',
  'ANALYSIS_FAILED',
  'TIMEOUT',
] as const;

export type DissentErrorCode = (typeof DISSENT_ERROR_CODES)[number];

export interface DissentErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * DissentError
 * Base domain error for typed failure handling across boundaries.
 */
export class DissentError extends Error {
  public readonly code: DissentErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(code: DissentErrorCode, message: string, options?: DissentErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = 'DissentError';
    this.code = code;
    this.details = options?.details;
    this.retryable = options?.retryable ?? false;
  }

  static invalidInput(message: string, details?: Record<string, unknown>): DissentError {
    return new DissentError('INVALID_INPUT', message, { details, retryable: false });
  }

  static configurationError(message: string, details?: Record<string, unknown>): DissentError {
    return new DissentError('CONFIGURATION_ERROR', message, {
      details,
      retryable: false,
    });
  }

  static unsupportedMarket(market: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'UNSUPPORTED_MARKET',
      `Market "${market}" is not supported or recognized.`,
      { details, retryable: false }
    );
  }

  static evidenceUnavailable(claimOrSource: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'EVIDENCE_UNAVAILABLE',
      `Market evidence could not be retrieved for: ${claimOrSource}`,
      { details, retryable: true }
    );
  }

  static evidenceStale(claimOrSource: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'EVIDENCE_STALE',
      `Retrieved evidence is stale or beyond allowable freshness threshold: ${claimOrSource}`,
      { details, retryable: true }
    );
  }

  static externalProviderError(provider: string, message: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'EXTERNAL_PROVIDER_ERROR',
      `Provider ${provider} failed: ${message}`,
      { details, retryable: true }
    );
  }

  static modelOutputInvalid(operation: string, reason: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'MODEL_OUTPUT_INVALID',
      `AI model output failed validation during ${operation}: ${reason}`,
      { details, retryable: true }
    );
  }

  static outputTruncated(operation: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'OUTPUT_TRUNCATED',
      `AI model output was truncated during ${operation}.`,
      { details, retryable: true }
    );
  }

  static analysisFailed(stage: string, reason: string, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'ANALYSIS_FAILED',
      `Analysis pipeline failed at stage "${stage}": ${reason}`,
      { details, retryable: false }
    );
  }

  static timeout(operation: string, timeoutMs: number, details?: Record<string, unknown>): DissentError {
    return new DissentError(
      'TIMEOUT',
      `Operation "${operation}" timed out after ${timeoutMs}ms`,
      { details, retryable: true }
    );
  }
}
