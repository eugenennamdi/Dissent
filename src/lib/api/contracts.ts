import { z } from 'zod';
import { ArgumentV1Schema } from '@/core/contracts/argument';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import { HumanDecisionTypeV1Schema, HumanDecisionV1Schema } from '@/core/contracts/human-decision';

export const MAX_API_REQUEST_BYTES = 8 * 1024;
export const MAX_THESIS_CHARACTERS = 2_000;
export const MAX_DECISION_NOTES_CHARACTERS = 1_000;

export const ResearchSubmissionV1Schema = z
  .object({
    thesis: z
      .string()
      .max(MAX_THESIS_CHARACTERS)
      .refine((value) => value.trim().length >= 3, 'Thesis must contain at least three characters'),
  })
  .strict();
export type ResearchSubmissionV1 = z.infer<typeof ResearchSubmissionV1Schema>;

export const BrowserLocalPersistenceV1Schema = z
  .object({
    strategy: z.literal('BROWSER_LOCAL'),
    serverStored: z.literal(false),
    crossDeviceRecovery: z.literal(false),
  })
  .strict();

const ResearchTimingsV1Schema = z
  .object({
    structuring: z.number().nonnegative(),
    marketResearch: z.number().nonnegative(),
    argumentation: z.number().nonnegative(),
    stressTesting: z.number().nonnegative(),
    synthesis: z.number().nonnegative(),
    total: z.number().nonnegative(),
  })
  .strict();

export const ResearchSuccessResponseV1Schema = z
  .object({
    ok: z.literal(true),
    state: z.literal('COMPLETED'),
    runId: z.string().min(1),
    brief: DissentBriefV1Schema,
    advocateCase: ArgumentV1Schema.refine((argument) => argument.stance === 'ADVOCATE', {
      message: 'advocateCase must have ADVOCATE stance',
    }),
    timingsMs: ResearchTimingsV1Schema,
    persistence: BrowserLocalPersistenceV1Schema,
  })
  .strict()
  .refine((response) => response.runId === response.brief.runId, {
    message: 'Response runId must match brief.runId',
  });
export type ResearchSuccessResponseV1 = z.infer<typeof ResearchSuccessResponseV1Schema>;

export const HumanDecisionSubmissionV1Schema = z
  .object({
    runId: z.string().min(1).max(200),
    thesisId: z.string().min(1).max(200),
    decision: HumanDecisionTypeV1Schema,
    notes: z.string().max(MAX_DECISION_NOTES_CHARACTERS).optional(),
    clientSessionId: z.string().min(1).max(200).optional(),
    confirmedByUser: z.literal(true),
  })
  .strict();
export type HumanDecisionSubmissionV1 = z.infer<typeof HumanDecisionSubmissionV1Schema>;

export const HumanDecisionSuccessResponseV1Schema = z
  .object({
    ok: z.literal(true),
    state: z.literal('RECORDED'),
    decision: HumanDecisionV1Schema,
    persistence: BrowserLocalPersistenceV1Schema,
  })
  .strict();
export type HumanDecisionSuccessResponseV1 = z.infer<
  typeof HumanDecisionSuccessResponseV1Schema
>;

export const PublicApiErrorCodeV1Schema = z.enum([
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
]);

export const ApiFailureResponseV1Schema = z
  .object({
    ok: z.literal(false),
    state: z.literal('FAILED'),
    requestId: z.string().min(1),
    error: z
      .object({
        code: PublicApiErrorCodeV1Schema,
        message: z.string().min(1),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ApiFailureResponseV1 = z.infer<typeof ApiFailureResponseV1Schema>;

export type ResearchApiResponseV1 = ResearchSuccessResponseV1 | ApiFailureResponseV1;
export type HumanDecisionApiResponseV1 =
  | HumanDecisionSuccessResponseV1
  | ApiFailureResponseV1;

export const BROWSER_LOCAL_PERSISTENCE = {
  strategy: 'BROWSER_LOCAL',
  serverStored: false,
  crossDeviceRecovery: false,
} as const;
