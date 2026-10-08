import { z } from 'zod';
import { DissentError } from '@/core/errors/domain-errors';
import { sanitizeProviderError } from './bitget-mcp.client';

export const EULERPOOL_BASE_URL = 'https://api.eulerpool.com';
export const DEFAULT_EULERPOOL_TIMEOUT_MS = 8_000;
export const MAX_EULERPOOL_RESPONSE_SIZE_BYTES = 1_048_576; // 1 MB limit

export const EulerpoolLastQuoteResponseSchema = z
  .object({
    ticker: z.string().optional(),
    isin: z.string().optional(),
    price: z.union([
      z.number().finite().positive(),
      z.string().transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n > 0, {
        message: 'price must be a positive finite number',
      }),
    ]),
    bid: z.number().finite().optional().nullable(),
    ask: z.number().finite().optional().nullable(),
    bid_size: z.number().finite().optional().nullable(),
    ask_size: z.number().finite().optional().nullable(),
    timestamp: z.union([z.number().finite(), z.string()]),
    ts: z.number().finite().optional().nullable(),
    exchange: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    change: z
      .union([
        z.number().finite(),
        z.string().transform((v) => Number(v)).refine((n) => Number.isFinite(n)),
      ])
      .optional()
      .nullable(),
    changePercent: z
      .union([
        z.number().finite(),
        z.string().transform((v) => Number(v)).refine((n) => Number.isFinite(n)),
      ])
      .optional()
      .nullable(),
    change_percent: z
      .union([
        z.number().finite(),
        z.string().transform((v) => Number(v)).refine((n) => Number.isFinite(n)),
      ])
      .optional()
      .nullable(),
    volume: z
      .union([
        z.number().finite(),
        z.string().transform((v) => Number(v)).refine((n) => Number.isFinite(n)),
      ])
      .optional()
      .nullable(),
  })
  .passthrough();

export type EulerpoolLastQuoteResponse = z.infer<
  typeof EulerpoolLastQuoteResponseSchema
>;

export interface EulerpoolQuoteData {
  symbol: string;
  price: number;
  currency?: string;
  exchange?: string;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  observedAt: string;
  retrievedAt: string;
  rawSnapshot: Record<string, unknown>;
}

export const EulerpoolPriceChangeResponseSchema = z
  .object({
    ticker: z.string().optional(),
    as_of: z.string().optional().nullable(),
    updated_at: z.string().optional().nullable(),
    data: z
      .array(
        z
          .object({
            symbol: z.string().optional(),
            '1D': z
              .union([
                z.number().finite(),
                z.string().transform((v) => Number(v)).refine(Number.isFinite),
              ])
              .optional()
              .nullable(),
            '5D': z.number().finite().optional().nullable(),
            '1M': z.number().finite().optional().nullable(),
            '3M': z.number().finite().optional().nullable(),
            '6M': z.number().finite().optional().nullable(),
            ytd: z.number().finite().optional().nullable(),
            '1Y': z.number().finite().optional().nullable(),
            '3Y': z.number().finite().optional().nullable(),
            '5Y': z.number().finite().optional().nullable(),
            '10Y': z.number().finite().optional().nullable(),
            max: z.number().finite().optional().nullable(),
          })
          .passthrough()
      )
      .optional()
      .nullable(),
  })
  .passthrough();

export type EulerpoolPriceChangeResponse = z.infer<
  typeof EulerpoolPriceChangeResponseSchema
>;

export interface EulerpoolPriceChangeData {
  symbol: string;
  oneDayChange?: number;
  asOf?: string;
  observedAt: string;
  retrievedAt: string;
  rawSnapshot: Record<string, unknown>;
}

export interface EulerpoolQuoteClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxResponseSizeBytes?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

function parseSourceTimestamp(raw: number | string): string {
  if (typeof raw === 'number') {
    // If seconds (< 1e11), convert to ms
    const ms = raw < 1e11 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  } else if (typeof raw === 'string') {
    const num = Number(raw);
    if (!isNaN(num) && Number.isFinite(num)) {
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  throw new Error(`Invalid source timestamp: ${raw}`);
}

export class EulerpoolQuoteClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly maxResponseSizeBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: EulerpoolQuoteClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? EULERPOOL_BASE_URL;
    this.apiKey = config.apiKey ?? process.env.EULERPOOL_API_KEY;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_EULERPOOL_TIMEOUT_MS;
    this.maxResponseSizeBytes =
      config.maxResponseSizeBytes ?? MAX_EULERPOOL_RESPONSE_SIZE_BYTES;
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  async getLastQuote(symbol: string): Promise<EulerpoolQuoteData> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw DissentError.evidenceUnavailable(`Eulerpool Equity API ${symbol}`, {
        reason: 'EULERPOOL_API_KEY is not configured',
      });
    }

    const url = `${this.baseUrl}/api/1/market/last-quote/${encodeURIComponent(symbol)}?token=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, `last-quote for ${symbol}`);
    const parsed = EulerpoolLastQuoteResponseSchema.parse(json);

    let observedAt: string;
    try {
      observedAt = parseSourceTimestamp(parsed.timestamp);
    } catch {
      throw DissentError.externalProviderError(
        'Eulerpool Equity API',
        `Unparseable timestamp (${parsed.timestamp}) for ${symbol}`,
        { kind: 'invalid_response' }
      );
    }

    const retrievedAt = this.now().toISOString();

    const rawChangePercent =
      parsed.changePercent ?? parsed.change_percent ?? undefined;
    let changePercent: number | undefined;
    if (rawChangePercent !== undefined && rawChangePercent !== null) {
      // If rawChangePercent is a fractional ratio (e.g. -0.00939), convert to percentage points (-0.939)
      if (
        Math.abs(rawChangePercent) < 0.05 &&
        parsed.change !== undefined &&
        parsed.change !== null &&
        Math.abs(parsed.change / parsed.price) > 0.0005
      ) {
        changePercent = Number((rawChangePercent * 100).toFixed(5));
      } else {
        changePercent = Number(rawChangePercent);
      }
    }

    const rawSnapshot: Record<string, unknown> = {
      source: 'Eulerpool Equity API',
      symbol,
      ticker: parsed.ticker ?? symbol,
      isin: parsed.isin ?? null,
      price: parsed.price,
      bid: parsed.bid ?? null,
      ask: parsed.ask ?? null,
      bidSize: parsed.bid_size ?? null,
      askSize: parsed.ask_size ?? null,
      exchange: parsed.exchange ?? null,
      currency: parsed.currency ?? 'USD',
      change: parsed.change ?? null,
      changePercent: changePercent ?? null,
      volume: parsed.volume ?? null,
      timestamp: parsed.timestamp,
    };

    return {
      symbol,
      price: parsed.price,
      currency: parsed.currency ?? 'USD',
      exchange: parsed.exchange ?? undefined,
      bid: parsed.bid !== null ? parsed.bid : undefined,
      ask: parsed.ask !== null ? parsed.ask : undefined,
      bidSize: parsed.bid_size !== null ? parsed.bid_size : undefined,
      askSize: parsed.ask_size !== null ? parsed.ask_size : undefined,
      change: parsed.change !== null ? parsed.change : undefined,
      changePercent,
      volume: parsed.volume !== null ? parsed.volume : undefined,
      observedAt,
      retrievedAt,
      rawSnapshot,
    };
  }

  async getPriceChange(symbol: string): Promise<EulerpoolPriceChangeData> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw DissentError.evidenceUnavailable(`Eulerpool Equity API ${symbol}`, {
        reason: 'EULERPOOL_API_KEY is not configured',
      });
    }

    const url = `${this.baseUrl}/api/1/equity/price-change/${encodeURIComponent(symbol)}?token=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, `price-change for ${symbol}`);
    const parsed = EulerpoolPriceChangeResponseSchema.parse(json);

    let observedAt: string;
    if (parsed.updated_at && !isNaN(new Date(parsed.updated_at).getTime())) {
      observedAt = new Date(parsed.updated_at).toISOString();
    } else if (parsed.as_of && !isNaN(new Date(parsed.as_of).getTime())) {
      observedAt = new Date(parsed.as_of).toISOString();
    } else {
      throw DissentError.externalProviderError(
        'Eulerpool Equity API',
        `Missing valid observation timestamp in price change for ${symbol}`,
        { kind: 'invalid_response' }
      );
    }

    const retrievedAt = this.now().toISOString();

    const dataObj =
      Array.isArray(parsed.data) && parsed.data.length > 0 ? parsed.data[0] : null;
    const raw1D = dataObj ? dataObj['1D'] : undefined;
    const oneDayChange =
      typeof raw1D === 'number' && Number.isFinite(raw1D) ? raw1D : undefined;

    const rawSnapshot: Record<string, unknown> = {
      source: 'Eulerpool Equity API',
      symbol,
      ticker: parsed.ticker ?? symbol,
      as_of: parsed.as_of ?? null,
      updated_at: parsed.updated_at ?? null,
      data: parsed.data ?? null,
    };

    return {
      symbol,
      oneDayChange,
      asOf: parsed.as_of ?? undefined,
      observedAt,
      retrievedAt,
      rawSnapshot,
    };
  }

  private redactSecrets(str: string): string {
    if (!this.apiKey) return str;
    return str.split(this.apiKey).join('[REDACTED]');
  }

  private async fetchJson(url: string, operation: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'Dissent-Trading-Desk/1.0',
        },
        signal: controller.signal,
      });

      if (res.status === 401) {
        throw DissentError.externalProviderError(
          'Eulerpool Equity API',
          'Invalid or missing API key',
          { statusCode: 401 }
        );
      }

      if (res.status === 404) {
        throw DissentError.evidenceUnavailable(
          `Eulerpool Equity API (${operation})`,
          { reason: `Resource not found for ${operation}`, statusCode: 404 }
        );
      }

      if (!res.ok) {
        throw DissentError.externalProviderError(
          'Eulerpool Equity API',
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
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeMsg = this.redactSecrets(sanitizeProviderError(rawMsg) ?? '');
      throw DissentError.externalProviderError(
        'Eulerpool Equity API',
        `Transport failure connecting to ${operation}: ${safeMsg}`,
        { error: safeMsg }
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
