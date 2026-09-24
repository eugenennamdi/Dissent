import { z } from 'zod';

export const McpJsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const McpStructuredContentSchema = z.object({
  status_code: z.number(),
  success: z.boolean(),
  data: z
    .object({
      provider: z.string().optional(),
      results: z.unknown(),
    })
    .passthrough()
    .optional(),
  error: z.string().nullable().optional(),
});

export const McpResponseEnvelopeSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  result: z
    .object({
      structuredContent: McpStructuredContentSchema.optional(),
      content: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
  error: McpJsonRpcErrorSchema.nullable().optional(),
});

export const BitgetEquityQuoteRecordSchema = z
  .object({
    symbol: z.string().min(1),
    last_price: z.number().finite().positive(),
    prev_close: z.number().finite().positive(),
    open: z.number().finite().positive().optional(),
    high: z.number().finite().positive().optional(),
    low: z.number().finite().positive().optional(),
    close: z.number().finite().positive().optional(),
    change: z.number().finite(),
    change_percent: z.number().finite(),
    volume: z.number().nonnegative().optional(),
    total_market_cap: z.number().finite().positive().optional(),
    float_market_cap: z.number().finite().positive().optional(),
    pb: z.number().finite().optional(),
    turnover_rate: z.number().finite().optional(),
    amplitude: z.number().finite().optional(),
  })
  .passthrough();

export const BitgetEquityFundamentalRatioRecordSchema = z
  .object({
    symbol: z.string().min(1),
    period_ending: z.string().min(1),
    time: z.number().int().positive(),
    pe: z.number().finite().nullable().optional(),
    pe_ttm_ed: z.number().finite().nullable().optional(),
    pe_lyr: z.number().finite().nullable().optional(),
    pb: z.number().finite().nullable().optional(),
    pb_mrq: z.number().finite().nullable().optional(),
    ps: z.number().finite().nullable().optional(),
    ps_ttm_ed: z.number().finite().nullable().optional(),
    ps_lyr: z.number().finite().nullable().optional(),
    pcf: z.number().finite().nullable().optional(),
    pcf_ttm_ed: z.number().finite().nullable().optional(),
    ent_multi: z.number().finite().nullable().optional(),
    tmv_usd: z.number().finite().nullable().optional(),
    div_yield_12m: z.number().finite().nullable().optional(),
  })
  .passthrough();

export type McpJsonRpcError = z.infer<typeof McpJsonRpcErrorSchema>;
export type McpStructuredContent = z.infer<typeof McpStructuredContentSchema>;
export type McpResponseEnvelope = z.infer<typeof McpResponseEnvelopeSchema>;
export type BitgetEquityQuoteRecord = z.infer<typeof BitgetEquityQuoteRecordSchema>;
export type BitgetEquityFundamentalRatioRecord = z.infer<
  typeof BitgetEquityFundamentalRatioRecordSchema
>;
