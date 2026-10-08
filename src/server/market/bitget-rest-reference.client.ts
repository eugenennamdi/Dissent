import { z } from 'zod';
import { DissentError } from '@/core/errors/domain-errors';
import { sanitizeProviderError } from './bitget-mcp.client';

export const BITGET_REST_BASE_URL = 'https://api.bitget.com';
export const DEFAULT_BITGET_REST_TIMEOUT_MS = 8_000;
export const MAX_BITGET_REST_RESPONSE_SIZE_BYTES = 1_048_576; // 1 MB limit

export const BitgetCompanyOverviewResponseSchema = z.object({
  code: z.string(),
  msg: z.string(),
  requestTime: z.number(),
  data: z
    .object({
      code: z.string().optional(),
      name: z.string().optional(),
      peRatio: z.string().optional().nullable(),
      pbRatio: z.string().optional().nullable(),
      totalShares: z.string().optional().nullable(),
      marketCap: z.string().optional().nullable(),
      high52Week: z.string().optional().nullable(),
      low52Week: z.string().optional().nullable(),
    })
    .passthrough(),
});

export type BitgetCompanyOverviewResponse = z.infer<
  typeof BitgetCompanyOverviewResponseSchema
>;

export const BitgetValuationIndicatorsResponseSchema = z.object({
  code: z.string(),
  msg: z.string(),
  requestTime: z.number(),
  data: z
    .object({
      date: z.union([z.string(), z.number()]).optional().nullable(),
      pb: z.string().optional().nullable(),
      pbMrq: z.string().optional().nullable(),
      pe: z.string().optional().nullable(),
      peLyr: z.string().optional().nullable(),
      peTtmEd: z.string().optional().nullable(),
      peTtmPd: z.string().optional().nullable(),
      ps: z.string().optional().nullable(),
      psLyr: z.string().optional().nullable(),
      psTtmEd: z.string().optional().nullable(),
      evEbitda: z.string().optional().nullable(),
      tmvUsd: z.string().optional().nullable(),
      grossEv: z.string().optional().nullable(),
      netEv: z.string().optional().nullable(),
    })
    .passthrough(),
});

export type BitgetValuationIndicatorsResponse = z.infer<
  typeof BitgetValuationIndicatorsResponseSchema
>;

export interface BitgetRestValuationData {
  symbol: string;
  observedAt: string;
  retrievedAt: string;
  reportingPeriod?: string;
  peTtm?: number;
  peLyr?: number;
  pbRatio?: number;
  evEbitda?: number;
  psTtm?: number;
  marketCap?: number;
  rawSnapshot: Record<string, unknown>;
}

export interface BitgetRestReferenceClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

function parseOptionalFloat(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = parseFloat(val.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeEpochMs(
  num: number,
  symbol: string,
  rawDate: unknown
): { observedAt: string; reportingPeriod: string } {
  if (!Number.isFinite(num) || num <= 0) {
    throw DissentError.externalProviderError(
      'Bitget Reality Reference API',
      `Invalid epoch timestamp (${num}) in valuation indicators for ${symbol}`,
      { kind: 'invalid_response', field: 'date', rawDate }
    );
  }

  const ms = num < 1e11 ? num * 1000 : num;
  const d = new Date(ms);

  if (isNaN(d.getTime())) {
    throw DissentError.externalProviderError(
      'Bitget Reality Reference API',
      `Unparseable epoch timestamp (${num}) in valuation indicators for ${symbol}`,
      { kind: 'invalid_response', field: 'date', rawDate }
    );
  }

  const year = d.getUTCFullYear();
  if (year < 1970 || year > 2100) {
    throw DissentError.externalProviderError(
      'Bitget Reality Reference API',
      `Out-of-range epoch timestamp (year ${year}) in valuation indicators for ${symbol}`,
      { kind: 'invalid_response', field: 'date', rawDate }
    );
  }

  const observedAt = d.toISOString();
  const reportingPeriod = observedAt.split('T')[0] ?? '';
  return { observedAt, reportingPeriod };
}

/**
 * Normalizes Bitget valuation-indicators data.date to ISO observedAt and YYYY-MM-DD reportingPeriod.
 *
 * Supported formats:
 * A. YYYY-MM-DD or valid ISO calendar date string
 * B. Numeric epoch timestamp represented as string or number (ms or seconds)
 *
 * Rejects:
 * - malformed dates
 * - impossible calendar dates (e.g. 2024-02-30, 2024-13-01)
 * - unsupported arbitrary strings
 * - empty, null, or undefined values
 */
export function normalizeBitgetDate(
  rawDate: unknown,
  symbol: string
): { observedAt: string; reportingPeriod: string } {
  if (rawDate === null || rawDate === undefined || rawDate === '') {
    throw DissentError.externalProviderError(
      'Bitget Reality Reference API',
      `Missing observation date in valuation indicators for ${symbol}`,
      { kind: 'invalid_response', field: 'date', rawDate }
    );
  }

  // 1. String representations (calendar date or epoch string)
  if (typeof rawDate === 'string') {
    const trimmed = rawDate.trim();

    // Check if numeric epoch represented as digits string
    if (/^\d{9,15}$/.test(trimmed)) {
      const num = Number(trimmed);
      return normalizeEpochMs(num, symbol, rawDate);
    }

    const calendarMatch =
      /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z?)?$/.exec(
        trimmed
      );

    if (calendarMatch && calendarMatch[1] && calendarMatch[2] && calendarMatch[3]) {
      const year = parseInt(calendarMatch[1], 10);
      const month = parseInt(calendarMatch[2], 10);
      const day = parseInt(calendarMatch[3], 10);
      const hour = calendarMatch[4] ? parseInt(calendarMatch[4], 10) : 0;
      const minute = calendarMatch[5] ? parseInt(calendarMatch[5], 10) : 0;
      const second = calendarMatch[6] ? parseInt(calendarMatch[6], 10) : 0;
      const ms = calendarMatch[7]
        ? parseInt(calendarMatch[7].padEnd(3, '0'), 10)
        : 0;

      if (year < 1970 || year > 2100 || month < 1 || month > 12) {
        throw DissentError.externalProviderError(
          'Bitget Reality Reference API',
          `Impossible date (year ${year}, month ${month}) in valuation indicators for ${symbol}`,
          { kind: 'invalid_response', field: 'date', rawDate }
        );
      }

      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const daysInMonth = [
        31,
        isLeap ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
      ];
      const maxDays = daysInMonth[month - 1] ?? 31;

      if (day < 1 || day > maxDays) {
        throw DissentError.externalProviderError(
          'Bitget Reality Reference API',
          `Impossible day of month (${day} for month ${month}/${year}) in valuation indicators for ${symbol}`,
          { kind: 'invalid_response', field: 'date', rawDate }
        );
      }

      if (hour > 23 || minute > 59 || second > 59) {
        throw DissentError.externalProviderError(
          'Bitget Reality Reference API',
          `Impossible time (${hour}:${minute}:${second}) in valuation indicators for ${symbol}`,
          { kind: 'invalid_response', field: 'date', rawDate }
        );
      }

      const dateObj = new Date(
        Date.UTC(year, month - 1, day, hour, minute, second, ms)
      );
      const observedAt = dateObj.toISOString();
      const reportingPeriod = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      return { observedAt, reportingPeriod };
    }
  }

  // 2. Numeric epoch timestamp
  if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
    return normalizeEpochMs(rawDate, symbol, rawDate);
  }

  throw DissentError.externalProviderError(
    'Bitget Reality Reference API',
    `Malformed or unsupported date format (${String(rawDate)}) in valuation indicators for ${symbol}`,
    { kind: 'invalid_response', field: 'date', rawDate }
  );
}

export class BitgetRestReferenceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSizeBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: BitgetRestReferenceClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? BITGET_REST_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_BITGET_REST_TIMEOUT_MS;
    this.maxResponseSizeBytes =
      config.maxResponseSizeBytes ?? MAX_BITGET_REST_RESPONSE_SIZE_BYTES;
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async getCompanyOverview(
    symbol: string
  ): Promise<BitgetCompanyOverviewResponse> {
    const url = `${this.baseUrl}/api/v3/reality/market/company-overview?code=${encodeURIComponent(symbol)}`;
    const json = await this.fetchJson(url, `company-overview for ${symbol}`);
    return BitgetCompanyOverviewResponseSchema.parse(json);
  }

  async getValuationIndicators(
    symbol: string
  ): Promise<BitgetValuationIndicatorsResponse> {
    const url = `${this.baseUrl}/api/v3/reality/market/valuation-indicators?code=${encodeURIComponent(symbol)}`;
    const json = await this.fetchJson(
      url,
      `valuation-indicators for ${symbol}`
    );
    return BitgetValuationIndicatorsResponseSchema.parse(json);
  }

  async getEquityValuationData(
    symbol: string
  ): Promise<BitgetRestValuationData> {
    const indicatorsRes = await this.getValuationIndicators(symbol);

    const indData = indicatorsRes.data;

    // Source-provided date from valuation-indicators is the observation date
    // Reject malformed dates, impossible dates, and unsupported strings (fail-closed)
    const { observedAt, reportingPeriod } = normalizeBitgetDate(
      indData?.date,
      symbol
    );

    // RetrievedAt comes strictly from the REST requestTime metadata
    const requestTimeNum = indicatorsRes.requestTime;
    const retrievedAt = requestTimeNum
      ? new Date(requestTimeNum).toISOString()
      : this.now().toISOString();

    // Map valuation metrics
    // Do NOT overstate generic pe as TTM: peTtm requires explicit TTM field (peTtmEd / peTtmPd)
    const peTtm =
      parseOptionalFloat(indData?.peTtmEd) ??
      parseOptionalFloat(indData?.peTtmPd);

    const peLyr = parseOptionalFloat(indData?.peLyr);

    const pbRatio =
      parseOptionalFloat(indData?.pbMrq) ??
      parseOptionalFloat(indData?.pb);

    const evEbitda = parseOptionalFloat(indData?.evEbitda);

    const psTtm =
      parseOptionalFloat(indData?.psTtmEd) ??
      parseOptionalFloat(indData?.psTtmPd);

    const marketCap = parseOptionalFloat(indData?.tmvUsd);

    const rawSnapshot: Record<string, unknown> = {
      source: 'Bitget Reality Reference API',
      symbol,
      valuationIndicators: indData ?? null,
    };

    return {
      symbol,
      observedAt,
      retrievedAt,
      reportingPeriod,
      peTtm,
      peLyr,
      pbRatio,
      evEbitda,
      psTtm,
      marketCap,
      rawSnapshot,
    };
  }

  private async fetchJson(url: string, operation: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Dissent-Trading-Desk/1.0',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw DissentError.externalProviderError(
          'Bitget Reality Reference API',
          `HTTP ${res.status} retrieving ${operation}`,
          { statusCode: res.status }
        );
      }

      const text = await res.text();
      if (text.length > this.maxResponseSizeBytes) {
        throw new DissentError(
          'EXTERNAL_PROVIDER_ERROR',
          `Response size exceeded limit for ${operation}`,
          { details: { size: text.length }, retryable: false }
        );
      }

      return JSON.parse(text);
    } catch (err: unknown) {
      if (err instanceof DissentError) throw err;
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('aborted'))
      ) {
        throw DissentError.timeout(operation, this.timeoutMs);
      }
      throw DissentError.externalProviderError(
        'Bitget Reality Reference API',
        `Transport failure connecting to ${operation}: ${sanitizeProviderError(err)}`,
        { error: sanitizeProviderError(err) }
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
