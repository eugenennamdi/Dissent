import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { DissentError, type DissentErrorCode } from '@/core/errors/domain-errors';
import {
  ApiFailureResponseV1Schema,
  MAX_API_REQUEST_BYTES,
} from '@/lib/api/contracts';

const PUBLIC_ERRORS: Record<
  DissentErrorCode,
  { status: number; message: string }
> = {
  INVALID_INPUT: { status: 400, message: 'Request is invalid.' },
  CONFIGURATION_ERROR: { status: 503, message: 'Research service is not configured.' },
  UNSUPPORTED_MARKET: { status: 422, message: 'The submitted market is not supported.' },
  EVIDENCE_UNAVAILABLE: { status: 503, message: 'Required market evidence is unavailable.' },
  EVIDENCE_STALE: { status: 503, message: 'Required market evidence is stale.' },
  EXTERNAL_PROVIDER_ERROR: {
    status: 502,
    message: 'A research provider is temporarily unavailable.',
  },
  MODEL_OUTPUT_INVALID: { status: 502, message: 'Research output failed validation.' },
  OUTPUT_TRUNCATED: { status: 502, message: 'Research output was incomplete.' },
  ANALYSIS_FAILED: { status: 500, message: 'Research could not be completed.' },
  TIMEOUT: { status: 504, message: 'Research timed out.' },
};

const JSON_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function assertSameOriginRequest(request: Request): void {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw DissentError.invalidInput('Cross-origin API requests are not accepted.', {
      httpStatus: 403,
    });
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = MAX_API_REQUEST_BYTES
): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/json') {
    throw DissentError.invalidInput('Content-Type must be application/json.', {
      httpStatus: 415,
    });
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > maximumBytes) {
    throw DissentError.invalidInput('Request body exceeds the maximum size.', {
      httpStatus: 413,
    });
  }
  if (!request.body) {
    throw DissentError.invalidInput('Request body is required.');
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        throw DissentError.invalidInput('Request body exceeds the maximum size.', {
          httpStatus: 413,
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw DissentError.invalidInput('Request body must contain valid JSON.');
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: JSON_RESPONSE_HEADERS });
}

export function safeErrorResponse(error: unknown, requestId = randomUUID()): Response {
  const domainError =
    error instanceof DissentError
      ? error
      : error instanceof ZodError
        ? DissentError.invalidInput('Request validation failed.')
        : DissentError.analysisFailed('APPLICATION', 'Unexpected application failure.');
  const publicError = PUBLIC_ERRORS[domainError.code];
  const requestedStatus = domainError.details?.httpStatus;
  const status =
    typeof requestedStatus === 'number' && requestedStatus >= 400 && requestedStatus <= 499
      ? requestedStatus
      : publicError.status;
  const body = ApiFailureResponseV1Schema.parse({
    ok: false,
    state: 'FAILED',
    requestId,
    error: {
      code: domainError.code,
      message: publicError.message,
      retryable: domainError.retryable,
    },
  });
  return jsonResponse(body, status);
}
