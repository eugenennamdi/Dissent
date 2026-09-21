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

const NonNumericTextPattern = '^[^0-9%$€£¥]*$';

export const ArgumentRelationSchema = z.enum([
  'SUPPORTS',
  'CHALLENGES',
  'CONTEXT_ONLY',
  'LIMITS_CONFIDENCE',
]);

const ArgumentWeightSchema = z.enum(['PRIMARY', 'SECONDARY', 'CONTEXTUAL']);

const ArgumentPointSemanticRepairBaseSchema = z
  .object({
    title: z.string().min(1).max(120),
    evidenceClaimIds: z.array(z.string().min(1)).min(1).max(4),
    relation: ArgumentRelationSchema,
    qualitativeRationale: z.string().min(1).max(500),
  })
  .strict();

export type ArgumentPointSemanticRepairOutput = z.infer<
  typeof ArgumentPointSemanticRepairBaseSchema
>;

export function createArgumentPointSemanticRepairOutputSchema(
  evidenceClaimIds: readonly string[]
): z.ZodType<ArgumentPointSemanticRepairOutput> {
  const authorizedClaimIds = new Set(evidenceClaimIds);
  return ArgumentPointSemanticRepairBaseSchema.superRefine((repair, context) => {
    repair.evidenceClaimIds.forEach((claimId, index) => {
      if (!authorizedClaimIds.has(claimId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidenceClaimIds', index],
          message: 'Evidence claim ID is not present in the authorized claim catalog.',
        });
      }
    });
  });
}

export function createArgumentPointSemanticRepairJsonSchema(
  evidenceClaimIds: readonly string[]
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'evidenceClaimIds', 'relation', 'qualitativeRationale'],
    properties: {
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 120,
        pattern: NonNumericTextPattern,
      },
      evidenceClaimIds: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: { type: 'string', enum: evidenceClaimIds },
      },
      relation: {
        type: 'string',
        enum: ['SUPPORTS', 'CHALLENGES', 'CONTEXT_ONLY', 'LIMITS_CONFIDENCE'],
      },
      qualitativeRationale: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        pattern: NonNumericTextPattern,
      },
    },
  };
}

const EvidenceInterpretationDraftPointSchema = z
  .object({
    pointKind: z.literal('EVIDENCE_INTERPRETATION'),
    title: z.string().min(1).max(120),
    evidenceClaimIds: z.array(z.string().min(1)).min(1).max(4),
    targetAssumptionIds: z.array(z.string().min(1)).max(4),
    relation: ArgumentRelationSchema,
    qualitativeRationale: z.string().min(1).max(500),
    weight: ArgumentWeightSchema,
  })
  .strict();

const ResearchLimitationDraftPointSchema = z
  .object({
    pointKind: z.literal('RESEARCH_LIMITATION'),
    title: z.string().min(1).max(120),
    researchLimitationId: z.string().min(1),
    targetAssumptionIds: z.array(z.string().min(1)).max(4),
    relation: z.literal('LIMITS_CONFIDENCE'),
    qualitativeRationale: z.string().min(1).max(500),
    weight: ArgumentWeightSchema,
  })
  .strict();

export const ArgumentDraftOutputSchema = z
  .object({
    summaryRationale: z.string().min(1).max(500),
    points: z
      .array(
        z.discriminatedUnion('pointKind', [
          EvidenceInterpretationDraftPointSchema,
          ResearchLimitationDraftPointSchema,
        ])
      )
      .min(1)
      .max(5),
  })
  .strict();

export function createArgumentDraftJsonSchema(
  evidenceClaimIds: string[],
  assumptionIds: string[],
  researchLimitationIds: string[]
): Record<string, unknown> {
  const commonProperties = {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 120,
      pattern: NonNumericTextPattern,
    },
    targetAssumptionIds: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: assumptionIds },
    },
    qualitativeRationale: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: NonNumericTextPattern,
    },
    weight: {
      type: 'string',
      enum: ['PRIMARY', 'SECONDARY', 'CONTEXTUAL'],
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summaryRationale', 'points'],
    properties: {
      summaryRationale: {
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
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: [
                'pointKind',
                'title',
                'evidenceClaimIds',
                'targetAssumptionIds',
                'relation',
                'qualitativeRationale',
                'weight',
              ],
              properties: {
                pointKind: {
                  type: 'string',
                  enum: ['EVIDENCE_INTERPRETATION'],
                },
                ...commonProperties,
                evidenceClaimIds: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 4,
                  items: { type: 'string', enum: evidenceClaimIds },
                },
                relation: {
                  type: 'string',
                  enum: ['SUPPORTS', 'CHALLENGES', 'CONTEXT_ONLY', 'LIMITS_CONFIDENCE'],
                },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: [
                'pointKind',
                'title',
                'researchLimitationId',
                'targetAssumptionIds',
                'relation',
                'qualitativeRationale',
                'weight',
              ],
              properties: {
                pointKind: {
                  type: 'string',
                  enum: ['RESEARCH_LIMITATION'],
                },
                ...commonProperties,
                researchLimitationId: {
                  type: 'string',
                  enum: researchLimitationIds,
                },
                relation: { type: 'string', enum: ['LIMITS_CONFIDENCE'] },
              },
            },
          ],
        },
      },
    },
  };
}

const AssumptionAssessmentItemSchema = z
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
  })
  .strict()
  .superRefine((assessment, context) => {
    const supportingCount = assessment.supportingEvidenceIds.length;
    const opposingCount = assessment.opposingEvidenceIds.length;
    if (assessment.status === 'SUPPORTED' && (supportingCount === 0 || opposingCount > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'SUPPORTED requires supporting evidence and no opposing evidence.',
      });
    }
    if (assessment.status === 'QUESTIONED' && opposingCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'QUESTIONED requires challenging evidence.',
      });
    }
    if (assessment.status === 'CONTRADICTED' && (supportingCount > 0 || opposingCount === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'CONTRADICTED requires opposing evidence and no supporting evidence.',
      });
    }
    if (
      assessment.status === 'INSUFFICIENT_EVIDENCE' &&
      (supportingCount > 0 || opposingCount > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'INSUFFICIENT_EVIDENCE requires empty evidence-role arrays.',
      });
    }
  });

export const AssumptionAssessmentDraftOutputSchema = z
  .object({
    assumptionAssessments: z
      .array(AssumptionAssessmentItemSchema)
      .min(1)
      .max(6),
  })
  .strict();

export const STRESS_TRANSMISSION_MECHANISM_MAX_LENGTH = 400;

export const StressResearchDraftOutputSchema = z
  .object({
    scenarios: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            hypotheticalChange: z.string().min(1).max(400),
            affectedAssumptionIds: z.array(z.string().min(1)).min(1).max(4),
            relevantEvidenceIds: z.array(z.string().min(1)).min(1).max(4),
            relevantArgumentPointIds: z.array(z.string().min(1)).min(1).max(4),
            transmissionMechanism: z
              .string()
              .min(1)
              .max(STRESS_TRANSMISSION_MECHANISM_MAX_LENGTH),
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
      .length(2),
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

function idArray(ids: string[], minItems = 0, maxItems = 4) {
  return {
    type: 'array',
    minItems,
    maxItems,
    uniqueItems: true,
    items: { type: 'string', enum: ids },
  };
}

export function createAssumptionAssessmentJsonSchema(input: {
  evidenceIds: string[];
  contradictingEvidenceIds: string[];
  assumptionIds: string[];
}): Record<string, unknown> {
  const allowedStatuses = [
    'SUPPORTED',
    'QUESTIONED',
    ...(input.contradictingEvidenceIds.length > 0 ? ['CONTRADICTED'] : []),
    'INSUFFICIENT_EVIDENCE',
  ];
  return {
    type: 'object',
    additionalProperties: false,
    required: ['assumptionAssessments'],
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
          ],
          properties: {
            assumptionId: { type: 'string', enum: input.assumptionIds },
            status: { type: 'string', enum: allowedStatuses },
            supportingEvidenceIds: idArray(input.evidenceIds),
            opposingEvidenceIds: idArray(input.evidenceIds),
          },
        },
      },
    },
  };
}

export function createStressResearchJsonSchema(input: {
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
  return {
    type: 'object',
    additionalProperties: false,
    required: ['scenarios', 'invalidationConditions'],
    properties: {
      scenarios: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
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
            transmissionMechanism: nonNumericString(
              STRESS_TRANSMISSION_MECHANISM_MAX_LENGTH
            ),
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
