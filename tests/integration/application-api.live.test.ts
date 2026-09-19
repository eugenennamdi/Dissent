import { describe, expect, it } from 'vitest';
import { DissentBriefV1Schema } from '@/core/contracts/brief';
import {
  assertArgumentEvidenceGrounding,
  assertBriefInvariants,
  assertGeneratedBriefInvariants,
} from '@/core/domain/invariants';
import {
  HumanDecisionSuccessResponseV1Schema,
  ResearchSuccessResponseV1Schema,
} from '@/lib/api/contracts';
import { POST as recordDecision } from '@/app/api/decisions/route';
import { POST as runResearch } from '@/app/api/research/route';

const runLive = process.env.RUN_APP_API_LIVE === '1';

describe.skipIf(!runLive)('Live application API', () => {
  it('runs the real pipeline and records a separate anonymous human decision', async () => {
    const thesis =
      'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.';
    const researchResponse = await runResearch(
      new Request('http://localhost/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ thesis }),
      })
    );
    const research = ResearchSuccessResponseV1Schema.parse(await researchResponse.json());

    expect(researchResponse.status).toBe(200);
    expect(research.brief.originalThesis).toBe(thesis);
    expect(research.brief.humanDecision).toBeNull();
    expect(research.advocateCase.stance).toBe('ADVOCATE');
    expect(research.brief.theDissent.stance).toBe('DISSENTER');
    expect(research.brief.assumptions.length).toBeGreaterThan(0);
    expect(research.brief.stressScenarios.length).toBeGreaterThanOrEqual(2);
    expect(research.brief.invalidationConditions.length).toBeGreaterThan(0);
    expect(
      research.brief.evidenceLedger.items.every(
        (item) =>
          item.provenance.sourceName === 'Bitget V3 Market API' ||
          item.provenance.sourceName === 'Dissent Deterministic Analytics'
      )
    ).toBe(true);
    expect(() => DissentBriefV1Schema.parse(research.brief)).not.toThrow();
    expect(() => assertGeneratedBriefInvariants(research.brief)).not.toThrow();
    expect(() =>
      assertArgumentEvidenceGrounding(research.advocateCase, research.brief.evidenceLedger)
    ).not.toThrow();

    const decisionResponse = await recordDecision(
      new Request('http://localhost/api/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({
          runId: research.runId,
          thesisId: research.brief.structuredThesis.id,
          decision: 'WATCH',
          notes: 'Awaiting broader evidence.',
          clientSessionId: 'live-api-smoke',
          confirmedByUser: true,
        }),
      })
    );
    const decision = HumanDecisionSuccessResponseV1Schema.parse(
      await decisionResponse.json()
    );
    expect(decisionResponse.status).toBe(200);
    expect(decision.decision.attribution.metadata).toMatchObject({
      identityVerified: false,
      triggersTradeExecution: false,
    });
    const locallyPersistedBrief = DissentBriefV1Schema.parse({
      ...research.brief,
      humanDecision: decision.decision,
    });
    expect(() => assertBriefInvariants(locallyPersistedBrief)).not.toThrow();

    console.log(
      'APPLICATION_API_LIVE_PROOF',
      JSON.stringify(
        {
          researchStatus: research.state,
          market: research.brief.structuredThesis.market,
          originalPreserved: research.brief.originalThesis === thesis,
          evidenceCount: research.brief.evidenceLedger.items.length,
          advocatePoints: research.advocateCase.points.length,
          dissentPoints: research.brief.theDissent.points.length,
          assumptionCount: research.brief.assumptions.length,
          scenarioCount: research.brief.stressScenarios.length,
          invalidationCount: research.brief.invalidationConditions.length,
          researchGaps: research.brief.unknowns,
          initialHumanDecision: research.brief.humanDecision,
          recordedDecision: decision.decision.decision,
          identityVerified: decision.decision.attribution.metadata?.identityVerified,
          triggersTradeExecution:
            decision.decision.attribution.metadata?.triggersTradeExecution,
          persistence: research.persistence,
          timingsMs: research.timingsMs,
          validationPassed: true,
        },
        null,
        2
      )
    );
  }, 150_000);
});
