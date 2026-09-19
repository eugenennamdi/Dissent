import { z } from 'zod';

export const BitgetDecimalSchema = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/, 'Expected a finite decimal string');

export const BitgetTimestampSchema = z
  .string()
  .regex(/^\d{13}$/, 'Expected a Unix timestamp in milliseconds')
  .refine((value) => Number.isSafeInteger(Number(value)), 'Timestamp is outside the safe range');

export const BitgetEnvelopeSchema = z.object({
  code: z.string(),
  msg: z.string(),
  requestTime: z.number().int().positive(),
  data: z.unknown(),
});

export const BitgetInstrumentSchema = z.object({
  symbol: z.string().min(1),
  category: z.enum(['SPOT', 'USDT-FUTURES', 'COIN-FUTURES', 'USDC-FUTURES']),
  baseCoin: z.string().min(1),
  quoteCoin: z.string().min(1),
  status: z.string().min(1),
});
export const BitgetInstrumentsDataSchema = z.array(BitgetInstrumentSchema);

export const BitgetTickerSchema = z.object({
  symbol: z.string().min(1),
  category: z.enum(['SPOT', 'USDT-FUTURES', 'COIN-FUTURES', 'USDC-FUTURES']),
  ts: BitgetTimestampSchema,
  lastPrice: BitgetDecimalSchema,
  openPrice24h: BitgetDecimalSchema,
  highPrice24h: BitgetDecimalSchema,
  lowPrice24h: BitgetDecimalSchema,
  ask1Price: BitgetDecimalSchema,
  bid1Price: BitgetDecimalSchema,
  bid1Size: BitgetDecimalSchema,
  ask1Size: BitgetDecimalSchema,
  price24hPcnt: BitgetDecimalSchema,
  turnover24h: BitgetDecimalSchema,
  volume24h: BitgetDecimalSchema,
  fundingRate: BitgetDecimalSchema.optional(),
  openInterest: BitgetDecimalSchema.optional(),
});
export const BitgetTickersDataSchema = z.array(BitgetTickerSchema);

export const BitgetCandleSchema = z.tuple([
  BitgetTimestampSchema,
  BitgetDecimalSchema,
  BitgetDecimalSchema,
  BitgetDecimalSchema,
  BitgetDecimalSchema,
  BitgetDecimalSchema,
  BitgetDecimalSchema,
]);
export const BitgetCandlesDataSchema = z.array(BitgetCandleSchema);

export type BitgetInstrument = z.infer<typeof BitgetInstrumentSchema>;
export type BitgetTicker = z.infer<typeof BitgetTickerSchema>;
export type BitgetCandle = z.infer<typeof BitgetCandleSchema>;
