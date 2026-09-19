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

const StressFindingPrefix =
  /^(Current evidence suggests|Current evidence may|Available evidence does not establish|A limitation is)\b/;

export const StressTestDraftOutputSchema = z
  .object({
    assumptionAssessments: z
      .array(
        z
          .object({
            assumptionId: z.string().min(1),
            status: z.enum([
              'SUPPORTED',
              'QUESTIONED',
              'CONTRADICTED',
              'INSUFFICIENT_EVIDENCE',
            ]),
            supportingEvidenceIds: z.array(z.string().min(1)).max(4),
            opposingEvidenceIds: z.array(z.string().min(1)).max(4),
            contextEvidenceIds: z.array(z.string().min(1)).max(4),
            relevantArgumentPointIds: z.array(z.string().min(1)).min(1).max(4),
            finding: z.string().min(1).max(500).regex(StressFindingPrefix),
            unknowns: z.array(z.string().min(1).max(300)).min(1).max(3),
          })
          .strict()
      )
      .min(1)
      .max(6),
    scenarios: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            hypotheticalChange: z.string().min(1).max(400),
            affectedAssumptionIds: z.array(z.string().min(1)).min(1).max(4),
            relevantEvidenceIds: z.array(z.string().min(1)).min(1).max(4),
            relevantArgumentPointIds: z.array(z.string().min(1)).min(1).max(4),
            transmissionMechanism: z.string().min(1).max(400),
            scenarioType: z.enum([
              'MACRO_REGIME_CHANGE',
              'LIQUIDITY_SHOCK',
              'POSITIONING_REVERSAL',
              'LIQUIDATION_CASCADE',
              'VOLATILITY_EXPANSION',
              'CORRELATION_BREAKDOWN',
              'ASSET_SPECIFIC_EVENT',
              'MARKET_STRUCTURE_DETERIORATION',
              'OTHER',
            ]),
            plausibility: z.enum(['HIGH', 'MEDIUM', 'LOW', 'TAIL_RISK']),
            consequenceForThesis: z.string().min(1).max(400),
            uncertainties: z.array(z.string().min(1).max(300)).min(1).max(3),
          })
          .strict()
      )
      .min(2)
      .max(3),
    invalidationConditions: z
      .array(
        z
          .object({
            targetAssumptionIds: z.array(z.string().min(1)).min(1).max(4),
            relevantEvidenceIds: z.array(z.string().min(1)).max(4),
            statement: z.string().min(1).max(300),
            observableEvent: z.string().min(1).max(300),
            verificationSourceKind: z.enum([
              'BITGET_MARKET_DATA',
              'FUTURE_PRIMARY_SOURCE_REQUIRED',
            ]),
            expectedWindow: z.string().min(1).max(160),
          })
          .strict()
      )
      .min(1)
      .max(4),
  })
  .strict();

export function createStressTestDraftJsonSchema(input: {
  evidenceIds: string[];
  assumptionIds: string[];
  argumentPointIds: string[];
}): Record<string, unknown> {
  const nonNumericString = (maxLength: number) => ({
    type: 'string',
    minLength: 1,
    maxLength,
    pattern: NonNumericTextPattern,
  });
  const idArray = (ids: string[], minItems = 0, maxItems = 4) => ({
    type: 'array',
    minItems,
    maxItems,
    uniqueItems: true,
    items: { type: 'string', enum: ids },
  });

  return {
    type: 'object',
    additionalProperties: false,
    required: ['assumptionAssessments', 'scenarios', 'invalidationConditions'],
    properties: {
      assumptionAssessments: {
        type: 'array',
        minItems: input.assumptionIds.length,
        maxItems: input.assumptionIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'assumptionId',
            'status',
            'supportingEvidenceIds',
            'opposingEvidenceIds',
            'contextEvidenceIds',
            'relevantArgumentPointIds',
            'finding',
            'unknowns',
          ],
          properties: {
            assumptionId: { type: 'string', enum: input.assumptionIds },
            status: {
              type: 'string',
              enum: [
                'SUPPORTED',
                'QUESTIONED',
                'CONTRADICTED',
                'INSUFFICIENT_EVIDENCE',
              ],
            },
            supportingEvidenceIds: idArray(input.evidenceIds),
            opposingEvidenceIds: idArray(input.evidenceIds),
            contextEvidenceIds: idArray(input.evidenceIds),
            relevantArgumentPointIds: idArray(input.argumentPointIds, 1),
            finding: {
              ...nonNumericString(500),
              pattern:
                '^(Current evidence suggests|Current evidence may|Available evidence does not establish|A limitation is)\\b[^0-9%$€£¥]*$',
            },
            unknowns: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: nonNumericString(300),
            },
          },
        },
      },
      scenarios: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'hypotheticalChange',
            'affectedAssumptionIds',
            'relevantEvidenceIds',
            'relevantArgumentPointIds',
            'transmissionMechanism',
            'scenarioType',
            'plausibility',
            'consequenceForThesis',
            'uncertainties',
          ],
          properties: {
            name: nonNumericString(120),
            hypotheticalChange: nonNumericString(400),
            affectedAssumptionIds: idArray(input.assumptionIds, 1),
            relevantEvidenceIds: idArray(input.evidenceIds, 1),
            relevantArgumentPointIds: idArray(input.argumentPointIds, 1),
            transmissionMechanism: nonNumericString(400),
            scenarioType: {
              type: 'string',
              enum: [
                'MACRO_REGIME_CHANGE',
                'LIQUIDITY_SHOCK',
                'POSITIONING_REVERSAL',
                'LIQUIDATION_CASCADE',
                'VOLATILITY_EXPANSION',
                'CORRELATION_BREAKDOWN',
                'ASSET_SPECIFIC_EVENT',
                'MARKET_STRUCTURE_DETERIORATION',
                'OTHER',
              ],
            },
            plausibility: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'TAIL_RISK'] },
            consequenceForThesis: nonNumericString(400),
            uncertainties: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: nonNumericString(300),
            },
          },
        },
      },
      invalidationConditions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'targetAssumptionIds',
            'relevantEvidenceIds',
            'statement',
            'observableEvent',
            'verificationSourceKind',
            'expectedWindow',
          ],
          properties: {
            targetAssumptionIds: idArray(input.assumptionIds, 1),
            relevantEvidenceIds: idArray(input.evidenceIds),
            statement: nonNumericString(300),
            observableEvent: nonNumericString(300),
            verificationSourceKind: {
              type: 'string',
              enum: ['BITGET_MARKET_DATA', 'FUTURE_PRIMARY_SOURCE_REQUIRED'],
            },
            expectedWindow: nonNumericString(160),
          },
        },
      },
    },
  };
}

export const SynthesisDraftOutputSchema = z
  .object({
    dissentPointClassifications: z
      .array(
        z
          .object({
            dissentPointId: z.string().min(1),
            classification: z.enum([
              'DIRECT_CONTRADICTION',
              'ALTERNATIVE_EXPLANATION',
              'EVIDENCE_LIMITATION',
              'HYPOTHETICAL_RISK',
            ]),
            targetType: z.enum(['THESIS_CLAIM', 'ASSUMPTION']),
            targetId: z.string().min(1),
            evidenceId: z.string().min(1),
            explanation: z.string().min(1).max(400),
            severity: z.enum(['CRITICAL', 'SIGNIFICANT', 'MINOR']).nullable(),
          })
          .strict()
      )
      .min(1)
      .max(5),
    unknowns: z.array(z.string().min(1).max(300)).min(1).max(8),
  })
  .strict();

export function createSynthesisDraftJsonSchema(input: {
  dissentPointIds: string[];
  evidenceIds: string[];
  targetIds: string[];
  allowDirectContradictions: boolean;
}): Record<string, unknown> {
  const classifications = [
    ...(input.allowDirectContradictions ? ['DIRECT_CONTRADICTION'] : []),
    'ALTERNATIVE_EXPLANATION',
    'EVIDENCE_LIMITATION',
    'HYPOTHETICAL_RISK',
  ];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['dissentPointClassifications', 'unknowns'],
    properties: {
      dissentPointClassifications: {
        type: 'array',
        minItems: input.dissentPointIds.length,
        maxItems: input.dissentPointIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'dissentPointId',
            'classification',
            'targetType',
            'targetId',
            'evidenceId',
            'explanation',
            'severity',
          ],
          properties: {
            dissentPointId: { type: 'string', enum: input.dissentPointIds },
            classification: { type: 'string', enum: classifications },
            targetType: { type: 'string', enum: ['THESIS_CLAIM', 'ASSUMPTION'] },
            targetId: { type: 'string', enum: input.targetIds },
            evidenceId: { type: 'string', enum: input.evidenceIds },
            explanation: {
              type: 'string',
              minLength: 1,
              maxLength: 400,
              pattern: NonNumericTextPattern,
            },
            severity: input.allowDirectContradictions
              ? {
                  type: ['string', 'null'],
                  enum: ['CRITICAL', 'SIGNIFICANT', 'MINOR', null],
                }
              : { type: 'null', enum: [null] },
          },
        },
      },
      unknowns: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
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
