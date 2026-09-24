import { describe, expect, it } from 'vitest';
import type { StructuredModelRequest } from '@/server/ai/structured-model.port';
import { executeResearchSubmission } from '@/server/application/research.service';
import { CompositeMarketAdapter } from '@/server/market/composite-market.adapter';
import { BitgetEquityAdapter } from '@/server/market/bitget-equity.adapter';
import { BitgetMarketAdapter } from '@/server/market/bitget.adapter';
import { BitgetMcpClient } from '@/server/market/bitget-mcp.client';
import { DissentError } from '@/core/errors/domain-errors';
import {
  SANITY_MCP_INIT_RESPONSE,
  SANITY_MCP_PARTIAL_RATIOS_RESPONSE,
  SANITY_MCP_QUOTE_RESPONSE,
  SANITY_MCP_RATIOS_RESPONSE,
} from '../fixtures/bitget-mcp-nvda.fixtures';
import { createMultiEquityMcpResponse } from '../fixtures/bitget-mcp-multi-equity.fixtures';
import { QueueModel, FIXED_AT } from '../server/ai/fixtures';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { createArgumentSelectionPlanOutputSchema } from '@/server/ai/ai-output.schemas';

const NOW_DATE = new Date('2026-09-24T12:00:00.000Z');

function mockMcpFetch(responses: {
  quote?: unknown;
  ratios?: unknown;
  quoteStatus?: number;
  ratiosStatus?: number;
}) {
  return (async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
    const method = bodyJson.method;

    if (method === 'initialize') {
      return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': 'test-session-equity-acceptance',
        },
      });
    }

    if (method === 'tools/call') {
      const entryId = bodyJson.params?.arguments?.entry_id;
      let payload: unknown;
      let status = 200;

      if (entryId === 'equity_price_quote') {
        payload = responses.quote ?? SANITY_MCP_QUOTE_RESPONSE;
        status = responses.quoteStatus ?? 200;
      } else if (entryId === 'equity_fundamental_ratios') {
        payload = responses.ratios ?? SANITY_MCP_RATIOS_RESPONSE;
        status = responses.ratiosStatus ?? 200;
      } else {
        payload = { jsonrpc: '2.0', id: bodyJson.id, error: { code: -32601, message: 'Not found' } };
      }

      return new Response(JSON.stringify(payload), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': 'test-session-equity-acceptance',
        },
      });
    }

    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -32600, message: 'Invalid' } }), {
      status: 400,
    });
  }) as typeof fetch;
}

const nvdaThesisExtractionOutput = {
  supported: true,
  unsupportedReason: null,
  market: 'NVDA/USD',
  baseAsset: 'NVDA',
  quoteAsset: 'USD',
  claim: 'NVDA will expand datacenter revenue and maintain elevated operating margins',
  direction: 'LONG',
  timeHorizon: { description: '6 months', estimatedHours: 4320 },
  catalysts: ['datacenter demand refresh', 'accelerated compute expansion'],
  assumptions: [
    {
      claim: 'Hyperscale datacenter spending on compute clusters will accelerate',
      type: 'EXPLICIT',
      category: 'MARKET_REGIME',
      challenge: 'Hyperscaler capital expenditure deceleration or budget cuts',
      invalidationCondition: 'Primary quarterly financial disclosures report reduced datacenter capex',
    },
    {
      claim: 'High gross margins will persist despite manufacturing supply scaling',
      type: 'INFERRED',
      category: 'POSITIONING',
      challenge: 'Pricing pressure from competitive alternatives or wafer cost inflation',
      invalidationCondition: 'Observable reported gross margin falls below recent fiscal baseline',
    },
  ],
};

function advocateSelectionPlanFromRequest(request: StructuredModelRequest<any>) {
  const options = request.userPayload.authorizedArgumentOptions as Array<{ optionId: string }>;
  return {
    primary: options[0]!.optionId,
    secondaryA: options[1]!.optionId,
    secondaryB: options[2]!.optionId,
    contextualA: options[3]!.optionId,
    contextualB: options[4]!.optionId,
  };
}

function dissentSelectionPlanFromRequest(request: StructuredModelRequest<any>) {
  const options = request.userPayload.authorizedArgumentOptions as Array<{ optionId: string }>;
  const ids = options.map((o) => o.optionId);
  return {
    primary: ids[ids.length - 1]!,
    secondaryA: ids[ids.length - 2]!,
    secondaryB: ids[ids.length - 3]!,
    contextualA: ids[ids.length - 4]!,
    contextualB: ids[ids.length - 5]!,
  };
}

function nvdaAssumptionAssessmentsFromRequest(request: StructuredModelRequest<any>) {
  const assumptions = request.userPayload.assumptions as Array<{ id: string }>;
  const evidenceCatalog = request.userPayload.evidenceCatalog as Array<{ id: string }>;
  return {
    assumptionAssessments: assumptions.map((a, i) => ({
      assumptionId: a.id,
      status: i === 0 ? 'SUPPORTED' : 'INSUFFICIENT_EVIDENCE',
      supportingEvidenceIds: i === 0 ? [evidenceCatalog[0]!.id] : [],
      opposingEvidenceIds: [],
    })),
  };
}

function nvdaStressResearchDraftFromRequest(request: StructuredModelRequest<any>) {
  const assumptions = request.userPayload.testedAssumptions as Array<{ id: string }>;
  const args = request.userPayload.arguments as Array<{ points: Array<{ id: string }> }>;
  const argumentPoints = args.flatMap((a) => a.points.map((p) => p.id));
  const evidence = request.userPayload.evidenceCatalog as Array<{ id: string }>;

  return {
    scenarios: [
      {
        name: 'Hyperscaler datacenter capex deceleration',
        hypotheticalChange: 'Hyperscalers pause cluster expansion amid power grid constraints',
        affectedAssumptionIds: [assumptions[0]!.id],
        relevantEvidenceIds: [evidence[0]!.id],
        relevantArgumentPointIds: [argumentPoints[0]!],
        transmissionMechanism: 'Lower capex directly compresses GPU order books and lowers forward shipments',
        scenarioType: 'MACRO_REGIME_CHANGE',
        plausibility: 'MEDIUM',
        consequenceForThesis: 'Topline revenue growth slows, challenging valuation multiple sustainability',
        uncertainties: ['Current backlog figures remain private to suppliers and hyperscalers'],
      },
      {
        name: 'Competitive margin compression',
        hypotheticalChange: 'Custom silicon alternatives reduce pricing power on accelerator hardware',
        affectedAssumptionIds: [assumptions[1]?.id ?? assumptions[0]!.id],
        relevantEvidenceIds: [evidence[1]?.id ?? evidence[0]!.id],
        relevantArgumentPointIds: [argumentPoints[1] ?? argumentPoints[0]!],
        transmissionMechanism: 'Customer diversification to internal ASICs erodes premium pricing margins',
        scenarioType: 'ASSET_SPECIFIC_EVENT',
        plausibility: 'LOW',
        consequenceForThesis: 'Operating margins contract below trader assumptions',
        uncertainties: ['Silicon fabrication lead times make alternative adoption gradual'],
      },
    ],
    invalidationConditions: [
      {
        targetAssumptionIds: [assumptions[0]!.id],
        relevantEvidenceIds: [evidence[0]!.id],
        statement: 'NVDA session price trends break below recent baseline',
        observableEvent: 'Bitget market quote shows persistent negative session momentum',
        verificationSourceKind: 'BITGET_MARKET_DATA',
        expectedWindow: 'THESIS_HORIZON',
      },
      {
        targetAssumptionIds: [assumptions[1]?.id ?? assumptions[0]!.id],
        relevantEvidenceIds: [],
        statement: 'SEC quarterly filings disclose gross margins below historical baseline',
        observableEvent: 'Audited quarterly report demonstrates gross margin compression',
        verificationSourceKind: 'FUTURE_PRIMARY_SOURCE_REQUIRED',
        expectedWindow: 'THESIS_HORIZON',
      },
    ],
  };
}

function nvdaSynthesisDraftFromRequest(request: StructuredModelRequest<any>) {
  const dissent = request.userPayload.dissentCase as {
    points: Array<{ id: string; evidenceIds: string[]; targetAssumptionIds: string[] }>;
  };
  return {
    dissentPointClassifications: dissent.points.map((p) => ({
      dissentPointId: p.id,
      classification: 'EVIDENCE_LIMITATION',
      targetType: 'ASSUMPTION',
      targetId: p.targetAssumptionIds[0] ?? (request.userPayload.thesis as any).id,
      evidenceId: p.evidenceIds[0]!,
      explanation: 'Historical valuation multiple context does not guarantee forward earnings growth',
      severity: null,
    })),
    unknowns: [
      'Future enterprise datacenter procurement budgets beyond current fiscal guidance remain unobserved',
    ],
  };
}

describe('NVDA US-Equity Research Integration Acceptance', () => {
  it('executes full NVDA/USD research production path offline with deterministic fixtures', async () => {
    const fetch = mockMcpFetch({});
    const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
    const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
    const marketDesk = new CompositeMarketAdapter({ equityAdapter });

    const model = new QueueModel([
      nvdaThesisExtractionOutput,
      advocateSelectionPlanFromRequest,
      dissentSelectionPlanFromRequest,
      nvdaAssumptionAssessmentsFromRequest,
      nvdaStressResearchDraftFromRequest,
      nvdaSynthesisDraftFromRequest,
    ]);

    let tick = 0;
    const response = await executeResearchSubmission(
      {
        thesis:
          'NVDA will maintain its momentum driven by datacenter compute demand over the next 6 months',
      },
      {
        model,
        marketDesk,
        now: () => NOW_DATE,
        timer: () => (tick += 50),
      }
    );

    // 1. Success & State
    expect(response.ok).toBe(true);
    expect(response.state).toBe('COMPLETED');
    expect(response.runId).toMatch(/^run_/);

    // 2. Strict Human Decision Invariant
    expect(response.brief.humanDecision).toBeNull();

    // 3. Structured Thesis Verification
    const thesis = response.brief.structuredThesis;
    expect(thesis.market).toBe('NVDA/USD');
    expect(thesis.baseAsset).toBe('NVDA');
    expect(thesis.quoteAsset).toBe('USD');
    expect(thesis.direction).toBe('LONG');
    expect(thesis.originalThesis).toBe(
      'NVDA will maintain its momentum driven by datacenter compute demand over the next 6 months'
    );

    // 4. Evidence Ledger Verification
    const ledger = response.brief.evidenceLedger;
    expect(ledger.items.length).toBe(9);
    expect(ledger.summary.categoriesPresent).toEqual(
      expect.arrayContaining(['PRICE_ACTION', 'VALUATION_METRIC'])
    );
    expect(
      ledger.items.every(
        (i) =>
          i.provenance.sourceName === 'bitget-mcp-server' ||
          i.provenance.sourceName === 'Dissent Deterministic Analytics'
      )
    ).toBe(true);
    expect(ledger.items.some((i) => i.provenance.sourceName === 'bitget-mcp-server')).toBe(true);

    // Verify quote evidence timestamp semantics
    const quotePrice = ledger.items.find((i) => i.observation.type === 'LAST_PRICE');
    expect(quotePrice).toBeDefined();
    expect(quotePrice?.provenance.observedAt).toBeNull();
    expect(quotePrice?.provenance.freshnessMode).toBe('UNKNOWN_OBSERVATION_TIME');

    // Verify valuation ratio timestamp semantics
    const peTtm = ledger.items.find((i) => i.observation.type === 'VALUATION_PE_TTM');
    expect(peTtm).toBeDefined();
    expect(peTtm?.provenance.observedAt).toBe('2026-09-23T00:00:00.000Z');
    expect(peTtm?.provenance.freshnessMode).toBe('HISTORICAL_RECORD');
    expect(peTtm?.observation.reportingPeriod).toBe('2026-09-23');

    // 5. Advocate Case Verification (exactly 5 distinct grounded points)
    const advocate = response.advocateCase;
    expect(advocate.stance).toBe('ADVOCATE');
    expect(advocate.points).toHaveLength(5);
    const advocateTitles = new Set(advocate.points.map((p) => p.title));
    expect(advocateTitles.size).toBe(5);
    expect(advocate.points.every((p) => p.evidenceIds.length > 0)).toBe(true);

    // 6. Dissenter Case Verification (exactly 5 distinct grounded points)
    const dissent = response.brief.theDissent;
    expect(dissent.stance).toBe('DISSENTER');
    expect(dissent.points).toHaveLength(5);
    const dissentTitles = new Set(dissent.points.map((p) => p.title));
    expect(dissentTitles.size).toBe(5);
    expect(dissent.points.every((p) => p.evidenceIds.length > 0)).toBe(true);

    // 7. Advocate and Dissenter Distinctness
    expect(advocate.summary).not.toBe(dissent.summary);
    expect(advocate.points.map((p) => p.title)).not.toEqual(dissent.points.map((p) => p.title));

    // 8. Stress Scenarios and Invalidation Conditions
    expect(response.brief.stressScenarios).toHaveLength(2);
    expect(response.brief.stressScenarios[0]!.name).toBe(
      'Hyperscaler datacenter capex deceleration'
    );
    expect(response.brief.stressScenarios[0]!.transmissionMechanism).toContain(
      'Lower capex directly compresses GPU order books'
    );

    expect(response.brief.invalidationConditions.length).toBeGreaterThanOrEqual(1);
    expect(
      response.brief.invalidationConditions.every(
        (c) => c.type === 'QUALITATIVE' && c.expectedWindow?.includes('4320 hours')
      )
    ).toBe(true);

    // 9. Unknowns & Research Limitations
    expect(response.brief.unknowns).toEqual(
      expect.arrayContaining([
        expect.stringContaining('macroeconomic'),
        expect.stringContaining('news-wire'),
        expect.stringContaining('sentiment'),
        expect.stringContaining('execution timestamp'),
        expect.stringContaining('SEC filing dates'),
      ])
    );
  });

  describe('Negative Tests and Boundary Invariants', () => {
    it('handles missing optional valuation observations when ledger still has sufficient points', async () => {
      // Return partial ratios (only pe_ttm_ed and pb_mrq present) -> 4 quote + 2 ratios = 6 items
      const fetch = mockMcpFetch({ ratios: SANITY_MCP_PARTIAL_RATIOS_RESPONSE });
      const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
      const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
      const marketDesk = new CompositeMarketAdapter({ equityAdapter });

      const model = new QueueModel([
        nvdaThesisExtractionOutput,
        advocateSelectionPlanFromRequest,
        dissentSelectionPlanFromRequest,
        nvdaAssumptionAssessmentsFromRequest,
        nvdaStressResearchDraftFromRequest,
        nvdaSynthesisDraftFromRequest,
      ]);

      const response = await executeResearchSubmission(
        { thesis: 'NVDA will expand datacenter demand over 6 months' },
        { model, marketDesk, now: () => NOW_DATE }
      );

      expect(response.ok).toBe(true);
      expect(response.brief.evidenceLedger.items.length).toBe(6);
      expect(response.advocateCase.points).toHaveLength(5);
      expect(response.brief.theDissent.points).toHaveLength(5);
    });

    it('fails closed when an equity ledger has insufficient evidence to support 5 distinct argument options', () => {
      // If a catalog has only 4 options (e.g. quote only, 0 valuation metrics):
      const catalogOptionIds = ['opt_1', 'opt_2', 'opt_3', 'opt_4'];
      const selectionSchema = createArgumentSelectionPlanOutputSchema(catalogOptionIds);

      // Attempting to select 5 distinct options when only 4 exist requires duplicating or inventing:
      // Subcase A: Model tries to duplicate an option to fill the 5 slots
      const duplicatePlan = {
        primary: 'opt_1',
        secondaryA: 'opt_2',
        secondaryB: 'opt_3',
        contextualA: 'opt_4',
        contextualB: 'opt_4', // duplicate!
      };
      const resultDup = selectionSchema.safeParse(duplicatePlan);
      expect(resultDup.success).toBe(false);
      if (!resultDup.success) {
        expect(resultDup.error.issues[0]?.message).toContain('duplicates the selection');
      }

      // Subcase B: Model tries to invent an option ID
      const inventedPlan = {
        primary: 'opt_1',
        secondaryA: 'opt_2',
        secondaryB: 'opt_3',
        contextualA: 'opt_4',
        contextualB: 'opt_invented', // not in catalog!
      };
      const resultInv = selectionSchema.safeParse(inventedPlan);
      expect(resultInv.success).toBe(false);
      if (!resultInv.success) {
        expect(resultInv.error.issues[0]?.message).toContain(
          'not present in the authorized role catalog'
        );
      }
    });

    it('rejects unsupported equity ticker theses (e.g. GOOGL, SPY)', async () => {
      const model = new QueueModel([
        {
          ...nvdaThesisExtractionOutput,
          supported: false,
          unsupportedReason: 'GOOGL is not a supported equity market in Dissent',
          market: null,
          baseAsset: null,
          quoteAsset: null,
          direction: null,
        },
      ]);

      await expect(
        executeResearchSubmission(
          { thesis: 'GOOGL will outperform next quarter' },
          { model, now: () => NOW_DATE }
        )
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_MARKET',
      });
    });

    it('prevents accidental dispatch of NVDA/USD to the crypto market adapter', async () => {
      const cryptoAdapter = new BitgetMarketAdapter();
      const nvdaThesis: StructuredThesisV1 = {
        id: 'th_nvda',
        thesisInputId: 'inp_1',
        originalThesis: 'NVDA long thesis',
        market: 'NVDA/USD',
        baseAsset: 'NVDA',
        quoteAsset: 'USD',
        claim: 'NVDA will outperform',
        direction: 'LONG',
        timeHorizon: { description: '3 months', estimatedHours: 2160 },
        catalysts: ['datacenter'],
        createdAt: NOW_DATE.toISOString(),
        schemaVersion: 1,
      };

      await expect(cryptoAdapter.gatherMarketObservations(nvdaThesis)).rejects.toMatchObject({
        code: 'UNSUPPORTED_MARKET',
      });
    });

    it('prevents accidental dispatch of crypto markets to the equity market adapter', async () => {
      const equityAdapter = new BitgetEquityAdapter();
      const cryptoThesis: StructuredThesisV1 = {
        id: 'th_crypto',
        thesisInputId: 'inp_2',
        originalThesis: 'ETH will outperform BTC',
        market: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
        claim: 'ETH relative outperformance',
        direction: 'RELATIVE_LONG',
        timeHorizon: { description: '48 hours', estimatedHours: 48 },
        catalysts: ['momentum'],
        createdAt: NOW_DATE.toISOString(),
        schemaVersion: 1,
      };

      await expect(equityAdapter.gatherMarketObservations(cryptoThesis)).rejects.toMatchObject({
        code: 'UNSUPPORTED_MARKET',
      });
    });

    it('preserves existing crypto market routing via CompositeMarketAdapter', async () => {
      let cryptoCalled = false;
      let equityCalled = false;

      const mockCrypto: BitgetMarketAdapter = {
        gatherMarketObservations: async (_thesis: unknown) => {
          cryptoCalled = true;
          return {
            ledger: {
              id: 'led_crypto',
              thesisId: 'th_test',
              items: [],
              summary: {
                totalCount: 0,
                supportingCount: 0,
                contradictingCount: 0,
                neutralCount: 0,
                staleCountAtAssembly: 0,
                categoriesPresent: [],
              },
              assembledAt: NOW_DATE.toISOString(),
              schemaVersion: 1,
            },
            gaps: [],
            complete: true,
          };
        },
      } as any;

      const mockEquity: BitgetEquityAdapter = {
        gatherMarketObservations: async (_thesis: unknown) => {
          equityCalled = true;
          return {
            ledger: {
              id: 'led_equity',
              thesisId: 'th_test',
              items: [],
              summary: {
                totalCount: 0,
                supportingCount: 0,
                contradictingCount: 0,
                neutralCount: 0,
                staleCountAtAssembly: 0,
                categoriesPresent: [],
              },
              assembledAt: NOW_DATE.toISOString(),
              schemaVersion: 1,
            },
            gaps: [],
            complete: true,
          };
        },
      } as any;

      const composite = new CompositeMarketAdapter({
        cryptoAdapter: mockCrypto,
        equityAdapter: mockEquity,
      });

      // Dispatch crypto
      await composite.gatherMarketObservations({
        id: 'th_btc',
        thesisInputId: 'inp_btc',
        originalThesis: 'BTC will rally',
        market: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        claim: 'BTC rally',
        direction: 'LONG',
        timeHorizon: { description: '24 hours', estimatedHours: 24 },
        catalysts: [],
        createdAt: NOW_DATE.toISOString(),
        schemaVersion: 1,
      });
      expect(cryptoCalled).toBe(true);
      expect(equityCalled).toBe(false);

      // Dispatch equity
      await composite.gatherMarketObservations({
        id: 'th_nvda',
        thesisInputId: 'inp_nvda',
        originalThesis: 'NVDA long',
        market: 'NVDA/USD',
        baseAsset: 'NVDA',
        quoteAsset: 'USD',
        claim: 'NVDA long',
        direction: 'LONG',
        timeHorizon: { description: '3 months', estimatedHours: 2160 },
        catalysts: [],
        createdAt: NOW_DATE.toISOString(),
        schemaVersion: 1,
      });
      expect(equityCalled).toBe(true);
    });

    it('verifies canonical equity provenance and rejects unexpected source names', async () => {
      const fetch = mockMcpFetch({});
      const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
      const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
      const marketDesk = new CompositeMarketAdapter({ equityAdapter });

      const model = new QueueModel([
        nvdaThesisExtractionOutput,
        advocateSelectionPlanFromRequest,
        dissentSelectionPlanFromRequest,
        nvdaAssumptionAssessmentsFromRequest,
        nvdaStressResearchDraftFromRequest,
        nvdaSynthesisDraftFromRequest,
      ]);

      const response = await executeResearchSubmission(
        { thesis: 'NVDA will expand datacenter demand over 6 months' },
        { model, marketDesk, now: () => NOW_DATE }
      );

      const items = response.brief.evidenceLedger.items;
      expect(items.length).toBeGreaterThanOrEqual(6);

      const isPermittedEquitySource = (sourceName: string) =>
        sourceName === 'bitget-mcp-server' ||
        sourceName === 'Dissent Deterministic Analytics';

      // 1. Genuine fixture items satisfy the canonical equity provenance rule
      expect(items.every((i) => isPermittedEquitySource(i.provenance.sourceName))).toBe(true);
      expect(items.some((i) => i.provenance.sourceName === 'bitget-mcp-server')).toBe(true);

      // 2. An unexpected source name is rejected by the provenance check
      const tamperedWithMismatchedName = [
        ...items,
        {
          ...items[0]!,
          provenance: {
            ...items[0]!.provenance,
            sourceName: 'Bitget MCP', // Mismatched legacy name
          },
        },
      ];
      expect(
        tamperedWithMismatchedName.every((i) => isPermittedEquitySource(i.provenance.sourceName))
      ).toBe(false);

      // 3. An arbitrary/unauthorized third-party source name is rejected
      const tamperedWithArbitrarySource = [
        ...items,
        {
          ...items[0]!,
          provenance: {
            ...items[0]!.provenance,
            sourceName: 'unauthorized-third-party-feed',
          },
        },
      ];
      expect(
        tamperedWithArbitrarySource.every((i) => isPermittedEquitySource(i.provenance.sourceName))
      ).toBe(false);

      // 4. Crypto-only source name on equity evidence is rejected
      const tamperedWithCryptoSource = [
        ...items,
        {
          ...items[0]!,
          provenance: {
            ...items[0]!.provenance,
            sourceName: 'Bitget V3 Market API',
          },
        },
      ];
      expect(
        tamperedWithCryptoSource.every((i) => isPermittedEquitySource(i.provenance.sourceName))
      ).toBe(false);
    });
  });

  describe('Multi-Stock Universe Acceptance (COIN, MSFT, MSTR)', () => {
    function mockMultiEquityFetch() {
      return (async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const bodyJson = bodyStr ? JSON.parse(bodyStr) : {};
        const method = bodyJson.method;

        if (method === 'initialize') {
          return new Response(JSON.stringify(SANITY_MCP_INIT_RESPONSE), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'test-session-multi-acc',
            },
          });
        }

        if (method === 'tools/call') {
          const entryId = bodyJson.params?.arguments?.entry_id as
            | 'equity_price_quote'
            | 'equity_fundamental_ratios';
          const symbol = (bodyJson.params?.arguments?.params?.symbol ??
            bodyJson.params?.arguments?.symbol) as string;
          const payload = createMultiEquityMcpResponse(symbol, entryId);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'mcp-session-id': 'test-session-multi-acc',
            },
          });
        }

        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -32600, message: 'Invalid' } }),
          { status: 400 }
        );
      }) as typeof fetch;
    }

    it('executes full COIN/USD research with negative P/E and null dividend yield', async () => {
      const fetch = mockMultiEquityFetch();
      const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
      const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
      const marketDesk = new CompositeMarketAdapter({ equityAdapter });

      const coinExtraction = {
        supported: true,
        unsupportedReason: null,
        market: 'COIN/USD',
        baseAsset: 'COIN',
        quoteAsset: 'USD',
        claim: 'COIN will advance on crypto trading activity despite current operating deficit',
        direction: 'LONG',
        timeHorizon: { description: '60 days', estimatedHours: 1440 },
        catalysts: ['trading volume surge'],
        assumptions: [
          {
            claim: 'Transaction volume will expand significantly',
            type: 'EXPLICIT',
            category: 'MARKET_REGIME',
            challenge: 'Broader digital asset market volumes stagnate',
            invalidationCondition: 'Reported exchange transaction volume drops',
          },
        ],
      };

      const model = new QueueModel([
        coinExtraction,
        advocateSelectionPlanFromRequest,
        dissentSelectionPlanFromRequest,
        nvdaAssumptionAssessmentsFromRequest,
        (req: StructuredModelRequest<any>) => ({
          scenarios: [
            {
              name: 'Crypto volume decline',
              hypotheticalChange: 'Digital asset trading volumes decrease substantially',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Volume decline directly reduces transaction fees and overall net revenue',
              scenarioType: 'MACRO_REGIME_CHANGE',
              plausibility: 'MEDIUM',
              consequenceForThesis: 'Net revenue contracts and negative operating margins widen',
              uncertainties: ['Retail participation cycle is unpredictable'],
            },
            {
              name: 'Operating expense escalation',
              hypotheticalChange: 'Administrative and regulatory costs scale higher',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Higher cost structure reduces operating leverage and cash generation',
              scenarioType: 'ASSET_SPECIFIC_EVENT',
              plausibility: 'LOW',
              consequenceForThesis: 'Earnings deficits deepen further',
              uncertainties: ['Regulatory compliance spending varies'],
            },
          ],
          invalidationConditions: [
            {
              targetAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              statement: 'COIN session price falls below recent baseline',
              observableEvent: 'Market price records negative momentum',
              verificationSourceKind: 'BITGET_MARKET_DATA',
              expectedWindow: 'THESIS_HORIZON',
            },
          ],
        }),
        (req: StructuredModelRequest<any>) => ({
          dissentPointClassifications: (req.userPayload.dissentCase as any).points.map((p: any) => ({
            dissentPointId: p.id,
            classification: 'EVIDENCE_LIMITATION',
            targetType: 'ASSUMPTION',
            targetId: p.targetAssumptionIds[0] ?? (req.userPayload.thesis as any).id,
            evidenceId: p.evidenceIds[0],
            explanation: 'Negative trailing twelve-month P/E indicates past operating loss',
            severity: null,
          })),
          unknowns: [
            'Forward digital asset trading velocity remains unobserved in the market desk feed',
            'Exchange quote observations lack authentic trade execution timestamps',
          ],
        }),
      ]);

      const response = await executeResearchSubmission(
        { thesis: 'COIN will advance on crypto trading activity over the next 60 days' },
        { model, marketDesk, now: () => NOW_DATE }
      );

      expect(response.ok).toBe(true);
      expect(response.state).toBe('COMPLETED');
      expect(response.brief.humanDecision).toBeNull();
      expect(response.brief.structuredThesis.market).toBe('COIN/USD');
      expect(response.brief.structuredThesis.baseAsset).toBe('COIN');

      // Verify negative ratio in evidence ledger
      const peItem = response.brief.evidenceLedger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_TTM'
      );
      expect(peItem).toBeDefined();
      expect(peItem?.value).toBe(-52.9242);
      expect(peItem?.unit).toBe('RATIO');

      // Verify exactly 5 distinct grounded points per side
      expect(response.advocateCase.points).toHaveLength(5);
      const advocateTitles = new Set(response.advocateCase.points.map((p) => p.title));
      expect(advocateTitles.size).toBe(5);

      expect(response.brief.theDissent.points).toHaveLength(5);
      const dissentTitles = new Set(response.brief.theDissent.points.map((p) => p.title));
      expect(dissentTitles.size).toBe(5);
    });

    it('executes full MSFT/USD research with standard positive ratios', async () => {
      const fetch = mockMultiEquityFetch();
      const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
      const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
      const marketDesk = new CompositeMarketAdapter({ equityAdapter });

      const msftExtraction = {
        supported: true,
        unsupportedReason: null,
        market: 'MSFT/USD',
        baseAsset: 'MSFT',
        quoteAsset: 'USD',
        claim: 'MSFT will maintain steady upward price action backed by enterprise valuation multiples',
        direction: 'LONG',
        timeHorizon: { description: '90 days', estimatedHours: 2160 },
        catalysts: ['enterprise software demand'],
        assumptions: [
          {
            claim: 'Commercial cloud growth remains above 20 percent',
            type: 'EXPLICIT',
            category: 'MARKET_REGIME',
            challenge: 'Cloud spending moderation',
            invalidationCondition: 'Quarterly report shows deceleration in cloud revenue',
          },
        ],
      };

      const model = new QueueModel([
        msftExtraction,
        advocateSelectionPlanFromRequest,
        dissentSelectionPlanFromRequest,
        nvdaAssumptionAssessmentsFromRequest,
        (req: StructuredModelRequest<any>) => ({
          scenarios: [
            {
              name: 'Enterprise IT spending slowdown',
              hypotheticalChange: 'Corporate IT budgets tighten amid economic uncertainty',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Deferred software licensing agreements reduce quarterly revenue expansion',
              scenarioType: 'MACRO_REGIME_CHANGE',
              plausibility: 'MEDIUM',
              consequenceForThesis: 'Topline growth moderates below consensus expectations',
              uncertainties: ['Contract renewal cycles provide recurring revenue cushion'],
            },
            {
              name: 'Capital expenditure cost expansion',
              hypotheticalChange: 'Data center infrastructure investments outpace near-term returns',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Higher infrastructure depreciation and energy expenses compress operating margins',
              scenarioType: 'ASSET_SPECIFIC_EVENT',
              plausibility: 'LOW',
              consequenceForThesis: 'Operating margins decrease despite stable revenue',
              uncertainties: ['Capex pacing can be adjusted across quarters'],
            },
          ],
          invalidationConditions: [
            {
              targetAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              statement: 'MSFT session price trends break below recent baseline',
              observableEvent: 'Bitget quote shows persistent downward price momentum',
              verificationSourceKind: 'BITGET_MARKET_DATA',
              expectedWindow: 'THESIS_HORIZON',
            },
          ],
        }),
        (req: StructuredModelRequest<any>) => ({
          dissentPointClassifications: (req.userPayload.dissentCase as any).points.map((p: any) => ({
            dissentPointId: p.id,
            classification: 'EVIDENCE_LIMITATION',
            targetType: 'ASSUMPTION',
            targetId: p.targetAssumptionIds[0] ?? (req.userPayload.thesis as any).id,
            evidenceId: p.evidenceIds[0],
            explanation: 'Historical valuation multiple context does not guarantee forward earnings growth',
            severity: null,
          })),
          unknowns: [
            'Enterprise backlog data remains private to corporate customers',
            'Exchange quote observations lack authentic trade execution timestamps',
          ],
        }),
      ]);

      const response = await executeResearchSubmission(
        { thesis: 'MSFT will maintain steady upward price action over the next 90 days' },
        { model, marketDesk, now: () => NOW_DATE }
      );

      expect(response.ok).toBe(true);
      expect(response.state).toBe('COMPLETED');
      expect(response.brief.humanDecision).toBeNull();
      expect(response.brief.structuredThesis.market).toBe('MSFT/USD');
      expect(response.brief.structuredThesis.baseAsset).toBe('MSFT');

      const peItem = response.brief.evidenceLedger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_TTM'
      );
      expect(peItem).toBeDefined();
      expect(peItem?.value).toBe(35.8157);

      expect(response.advocateCase.points).toHaveLength(5);
      const advocateTitles = new Set(response.advocateCase.points.map((p) => p.title));
      expect(advocateTitles.size).toBe(5);

      expect(response.brief.theDissent.points).toHaveLength(5);
      const dissentTitles = new Set(response.brief.theDissent.points.map((p) => p.title));
      expect(dissentTitles.size).toBe(5);
    });

    it('executes full MSTR/USD SHORT research with multiple negative valuation ratios', async () => {
      const fetch = mockMultiEquityFetch();
      const client = new BitgetMcpClient({ fetch, timeoutMs: 2000 });
      const equityAdapter = new BitgetEquityAdapter({ client, now: () => NOW_DATE });
      const marketDesk = new CompositeMarketAdapter({ equityAdapter });

      const mstrExtraction = {
        supported: true,
        unsupportedReason: null,
        market: 'MSTR/USD',
        baseAsset: 'MSTR',
        quoteAsset: 'USD',
        claim: 'MSTR will experience downward price pressure as multiple compression takes effect',
        direction: 'SHORT',
        timeHorizon: { description: '60 days', estimatedHours: 1440 },
        catalysts: ['valuation multiple compression'],
        assumptions: [
          {
            claim: 'Valuation multiples will compress toward historical norms',
            type: 'EXPLICIT',
            category: 'MARKET_REGIME',
            challenge: 'Persistent balance sheet premium continuation',
            invalidationCondition: 'Price to sales ratio continues expanding',
          },
        ],
      };

      const model = new QueueModel([
        mstrExtraction,
        advocateSelectionPlanFromRequest,
        dissentSelectionPlanFromRequest,
        nvdaAssumptionAssessmentsFromRequest,
        (req: StructuredModelRequest<any>) => ({
          scenarios: [
            {
              name: 'Balance sheet premium expansion',
              hypotheticalChange: 'Treasury reserve premium widens relative to net asset value',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Higher investor demand for treasury reserves expands the valuation premium',
              scenarioType: 'MACRO_REGIME_CHANGE',
              plausibility: 'MEDIUM',
              consequenceForThesis: 'Stock prices advance instead of compressing downward',
              uncertainties: ['Treasury asset volatility drives premium fluctuations'],
            },
            {
              name: 'Capital market financing access',
              hypotheticalChange: 'Favorable convertible debt issuance extends liquidity',
              affectedAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              relevantArgumentPointIds: [(req.userPayload.arguments as any)[0].points[0].id],
              transmissionMechanism: 'Low-cost debt financing reduces immediate cash flow stress',
              scenarioType: 'ASSET_SPECIFIC_EVENT',
              plausibility: 'LOW',
              consequenceForThesis: 'Short thesis faces extended timeline risk',
              uncertainties: ['Fixed income investor appetite for convertibles changes'],
            },
          ],
          invalidationConditions: [
            {
              targetAssumptionIds: [(req.userPayload.testedAssumptions as any)[0].id],
              relevantEvidenceIds: [(req.userPayload.evidenceCatalog as any)[0].id],
              statement: 'MSTR session price rallies above recent baseline',
              observableEvent: 'Bitget quote records strong upward price momentum',
              verificationSourceKind: 'BITGET_MARKET_DATA',
              expectedWindow: 'THESIS_HORIZON',
            },
          ],
        }),
        (req: StructuredModelRequest<any>) => ({
          dissentPointClassifications: (req.userPayload.dissentCase as any).points.map((p: any) => ({
            dissentPointId: p.id,
            classification: 'EVIDENCE_LIMITATION',
            targetType: 'ASSUMPTION',
            targetId: p.targetAssumptionIds[0] ?? (req.userPayload.thesis as any).id,
            evidenceId: p.evidenceIds[0],
            explanation: 'Historical valuation context does not establish future short direction',
            severity: null,
          })),
          unknowns: [
            'Direct balance-sheet asset holdings and mark-to-market changes were not retrieved',
            'Exchange quote observations lack authentic trade execution timestamps',
          ],
        }),
      ]);

      const response = await executeResearchSubmission(
        { thesis: 'MSTR will experience downward price pressure over the next 60 days' },
        { model, marketDesk, now: () => NOW_DATE }
      );

      expect(response.ok).toBe(true);
      expect(response.state).toBe('COMPLETED');
      expect(response.brief.humanDecision).toBeNull();
      expect(response.brief.structuredThesis.market).toBe('MSTR/USD');
      expect(response.brief.structuredThesis.direction).toBe('SHORT');

      // Verify negative valuation metrics
      const peItem = response.brief.evidenceLedger.items.find(
        (i) => i.observation.type === 'VALUATION_PE_TTM'
      );
      const evItem = response.brief.evidenceLedger.items.find(
        (i) => i.observation.type === 'VALUATION_EV_EBITDA'
      );
      expect(peItem).toBeDefined();
      expect(peItem?.value).toBe(-1.9934);
      expect(evItem).toBeDefined();
      expect(evItem?.value).toBe(-12.7712);

      // Verify 5 distinct points per side
      expect(response.advocateCase.points).toHaveLength(5);
      const advocateTitles = new Set(response.advocateCase.points.map((p) => p.title));
      expect(advocateTitles.size).toBe(5);

      expect(response.brief.theDissent.points).toHaveLength(5);
      const dissentTitles = new Set(response.brief.theDissent.points.map((p) => p.title));
      expect(dissentTitles.size).toBe(5);
    });
  });
});
