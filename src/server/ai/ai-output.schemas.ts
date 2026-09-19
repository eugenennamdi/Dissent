import { z } from 'zod';

const NullableTimeHorizonSchema = z
  .object({
    description: z.string().min(1).max(160),
    estimatedHours: z.number().positive().max(8_760).nullable(),
  })
  .strict()
  .nullable();

const ExtractedAssumptionSchema = z
  .object({
    claim: z.string().min(1).max(300),
    type: z.enum(['EXPLICIT', 'INFERRED']),
    category: z.enum([
      'MARKET_REGIME',
      'CORRELATION',
      'POSITIONING',
      'MACRO',
      'LIQUIDITY',
      'CATALYST_TIMING',
      'MICROSTRUCTURE',
      'OTHER',
    ]),
    challenge: z.string().min(1).max(300),
    invalidationCondition: z.string().min(1).max(300),
  })
  .strict();

export const ThesisExtractionOutputSchema = z
  .object({
    supported: z.boolean(),
    unsupportedReason: z.string().max(300).nullable(),
    market: z.literal('ETH/BTC').nullable(),
    baseAsset: z.literal('ETH').nullable(),
    quoteAsset: z.literal('BTC').nullable(),
    claim: z.string().min(1).max(300).nullable(),
    direction: z.enum(['RELATIVE_LONG', 'RELATIVE_SHORT']).nullable(),
    timeHorizon: NullableTimeHorizonSchema,
    catalysts: z.array(z.string().min(1).max(200)).max(5),
    assumptions: z.array(ExtractedAssumptionSchema).max(6),
  })
  .strict();

export const THESIS_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'supported',
    'unsupportedReason',
    'market',
    'baseAsset',
    'quoteAsset',
    'claim',
    'direction',
    'timeHorizon',
    'catalysts',
    'assumptions',
  ],
  properties: {
    supported: { type: 'boolean' },
    unsupportedReason: { type: ['string', 'null'], maxLength: 300 },
    market: { type: ['string', 'null'], enum: ['ETH/BTC', null] },
    baseAsset: { type: ['string', 'null'], enum: ['ETH', null] },
    quoteAsset: { type: ['string', 'null'], enum: ['BTC', null] },
    claim: { type: ['string', 'null'], maxLength: 300 },
    direction: {
      type: ['string', 'null'],
      enum: ['RELATIVE_LONG', 'RELATIVE_SHORT', null],
    },
    timeHorizon: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'estimatedHours'],
          properties: {
            description: { type: 'string', minLength: 1, maxLength: 160 },
            estimatedHours: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 8_760 },
          },
        },
        { type: 'null' },
      ],
    },
    catalysts: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    assumptions: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'type', 'category', 'challenge', 'invalidationCondition'],
        properties: {
          claim: { type: 'string', minLength: 1, maxLength: 300 },
          type: { type: 'string', enum: ['EXPLICIT', 'INFERRED'] },
          category: {
            type: 'string',
            enum: [
              'MARKET_REGIME',
              'CORRELATION',
              'POSITIONING',
              'MACRO',
              'LIQUIDITY',
              'CATALYST_TIMING',
              'MICROSTRUCTURE',
              'OTHER',
            ],
          },
          challenge: { type: 'string', minLength: 1, maxLength: 300 },
          invalidationCondition: { type: 'string', minLength: 1, maxLength: 300 },
        },
      },
    },
  },
};

const InterpretationPrefix = /^(This suggests|This may|One interpretation is|A limitation is|The evidence does not establish)\b/;
const NonNumericTextPattern = '^[^0-9%$€£¥]*$';

export const ArgumentDraftOutputSchema = z
  .object({
    summaryInterpretation: z.string().min(1).max(500),
    points: z
      .array(
        z
          .object({
            title: z.string().min(1).max(120),
            interpretation: z.string().min(1).max(500).regex(InterpretationPrefix),
            evidenceIds: z.array(z.string().min(1)).min(1).max(4),
            targetAssumptionIds: z.array(z.string().min(1)).max(4),
            weight: z.enum(['PRIMARY', 'SECONDARY', 'CONTEXTUAL']),
          })
          .strict()
      )
      .min(1)
      .max(5),
    counterweights: z.array(z.string().min(1).max(300)).max(4),
  })
  .strict();

export function createArgumentDraftJsonSchema(
  evidenceIds: string[],
  assumptionIds: string[]
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summaryInterpretation', 'points', 'counterweights'],
    properties: {
      summaryInterpretation: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: NonNumericTextPattern,
      },
      points: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title',
            'interpretation',
            'evidenceIds',
            'targetAssumptionIds',
            'weight',
          ],
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 120,
              pattern: NonNumericTextPattern,
            },
            interpretation: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
              pattern:
                '^(This suggests|This may|One interpretation is|A limitation is|The evidence does not establish)\\b[^0-9%$€£¥]*$',
            },
            evidenceIds: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: { type: 'string', enum: evidenceIds },
            },
            targetAssumptionIds: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string', enum: assumptionIds },
            },
            weight: {
              type: 'string',
              enum: ['PRIMARY', 'SECONDARY', 'CONTEXTUAL'],
            },
          },
        },
      },
      counterweights: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 300,
          pattern: NonNumericTextPattern,
        },
      },
    },
  };
}
