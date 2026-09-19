import { randomUUID } from 'node:crypto';
import { ThesisInputV1Schema } from '@/core/contracts/thesis';
import {
  BROWSER_LOCAL_PERSISTENCE,
  ResearchSuccessResponseV1Schema,
  type ResearchSubmissionV1,
  type ResearchSuccessResponseV1,
} from '@/lib/api/contracts';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import { DeepSeekResponsesClient } from '@/server/ai/deepseek-responses.client';
import type { StructuredModelPort } from '@/server/ai/structured-model.port';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import type { MarketDeskPort } from '@/server/market/market-desk.port';
import { IntelligenceLoop } from '@/server/orchestration/intelligence-loop';

export interface ResearchServiceDependencies {
  model?: StructuredModelPort;
  marketDesk?: MarketDeskPort;
  now?: () => Date;
  timer?: () => number;
  inputIdFactory?: () => string;
}

export async function executeResearchSubmission(
  submission: ResearchSubmissionV1,
  dependencies: ResearchServiceDependencies = {}
): Promise<ResearchSuccessResponseV1> {
  const now = dependencies.now ?? (() => new Date());
  const input = ThesisInputV1Schema.parse({
    id: dependencies.inputIdFactory?.() ?? `inp_${randomUUID()}`,
    rawText: submission.thesis,
    submittedAt: now().toISOString(),
    schemaVersion: 1,
  });
  const ai = new DeepSeekAnalystAdapter({
    model: dependencies.model ?? new DeepSeekResponsesClient(),
    now,
  });
  const loop = new IntelligenceLoop({
    ai,
    marketDesk: dependencies.marketDesk ?? new BitgetMarketAdapter(),
    now: dependencies.timer,
    marketQuery: { lookbackHours: 48, includeFutures: true },
  });
  const result = await loop.run(input);

  return ResearchSuccessResponseV1Schema.parse({
    ok: true,
    state: 'COMPLETED',
    runId: result.brief.runId,
    brief: result.brief,
    advocateCase: result.advocateCase,
    timingsMs: result.timingsMs,
    persistence: BROWSER_LOCAL_PERSISTENCE,
  });
}
