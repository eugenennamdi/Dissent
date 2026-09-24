import { describe, expect, it, vi } from 'vitest';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { assertArgumentEvidenceGrounding } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import {
  ARGUMENT_SELECTION_SLOT_NAMES,
  createArgumentSelectionPlanJsonSchema,
  createArgumentSelectionPlanOutputSchema,
} from '@/server/ai/ai-output.schemas';
import { assertAdvocateDissenterDistinct } from '@/server/ai/argument-validation';
import { DeepSeekAnalystAdapter } from '@/server/ai/deepseek-analyst.adapter';
import {
  ARGUMENT_OPTION_CATALOG_MAX_ITEMS,
  assertSafeModelAuthoredText,
  authorizedArgumentPointCatalog,
  materializeArgumentSelection,
} from '@/server/ai/grounding';
import {
  FIXED_AT,
  QueueModel,
  argumentSelectionPlan,
  argumentSelectionPlanFromRequest,
  makeAssumptions,
  makeEvidenceLedger,
  makeStructuredThesis,
} from './fixtures';

function evidence(input: {
  id: string;
  type: EvidenceV1['observation']['type'];
  stance?: EvidenceV1['stance'];
  market?: string;
  interval?: boolean;
  category?: EvidenceV1['category'];
  relatedAssumptionIds?: string[];
}): EvidenceV1 {
  const interval = input.interval ?? true;
  return {
    id: input.id,
    thesisId: 'th_ai_1',
    claim: `Authorized observation for ${input.id}.`,
    category: input.category ?? 'PRICE_ACTION',
    stance: input.stance ?? 'NEUTRAL',
    nature: ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(input.type)
      ? 'DERIVED'
      : 'NUMERIC',
    observation: {
      type: input.type,
      market: input.market ?? 'ETH/USDT',
      instrumentType: ['FUNDING_RATE', 'OPEN_INTEREST'].includes(input.type)
        ? 'PERPETUAL_FUTURES'
        : ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(input.type)
          ? 'DERIVED_SPOT_PAIR'
          : 'SPOT',
      providerSymbol: input.id,
      ...(interval
        ? {
            interval: '1H',
            periodStartAt: '2026-09-19T10:00:00.000Z',
            periodEndAt: '2026-09-19T11:00:00.000Z',
          }
        : {}),
    },
    provenance: {
      sourceName: 'Test evidence source',
      sourceType: ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(input.type)
        ? 'DERIVED_ANALYTICS'
        : 'EXCHANGE_API',
      endpointOrLocator: `test://${input.id}`,
      observedAt: interval ? '2026-09-19T11:00:00.000Z' : FIXED_AT,
      retrievedAt: FIXED_AT,
      freshnessMode: interval ? 'HISTORICAL_RECORD' : 'AGE_SINCE_OBSERVATION',
      ...(interval ? {} : { freshnessWindowSeconds: 60 }),
    },
    value: 'one',
    unit: input.type === 'RETURN_SPREAD' ? 'percentage points' : 'test unit',
    derivedFromEvidenceIds: ['RETURN_SPREAD', 'RELATIVE_RETURN'].includes(input.type)
      ? ['ev_single']
      : [],
    relatedAssumptionIds: input.relatedAssumptionIds ?? [],
    verifiable: true,
    schemaVersion: 1,
  };
}

function ledgerWith(...items: EvidenceV1[]): EvidenceLedgerV1 {
  return {
    id: 'led_options',
    thesisId: 'th_ai_1',
    items,
    summary: {
      totalCount: items.length,
      supportingCount: items.filter((item) => item.stance === 'SUPPORTING').length,
      contradictingCount: items.filter((item) => item.stance === 'CONTRADICTING').length,
      neutralCount: items.filter((item) => item.stance === 'NEUTRAL').length,
      staleCountAtAssembly: 0,
      categoriesPresent: [...new Set(items.map((item) => item.category))],
    },
    assembledAt: FIXED_AT,
    schemaVersion: 1,
  };
}

function capabilityLedger(): EvidenceLedgerV1 {
  return ledgerWith(
    evidence({ id: 'ev_single', type: 'PRICE_CHANGE_24H' }),
    evidence({
      id: 'ev_relative',
      type: 'RELATIVE_RETURN',
      market: 'ETH/BTC',
      category: 'CORRELATION',
      stance: 'SUPPORTING',
      relatedAssumptionIds: ['asm_1'],
    }),
    evidence({
      id: 'ev_spread',
      type: 'RETURN_SPREAD',
      market: 'ETH/BTC',
      category: 'CORRELATION',
      stance: 'CONTRADICTING',
      relatedAssumptionIds: ['asm_1'],
    }),
    evidence({ id: 'ev_funding', type: 'FUNDING_RATE', interval: false, category: 'FUNDING_RATE' }),
    evidence({ id: 'ev_oi', type: 'OPEN_INTEREST', interval: false, category: 'OPEN_INTEREST' })
  );
}

function singleAssetThesis(direction: 'LONG' | 'SHORT' = 'LONG') {
  return {
    ...makeStructuredThesis(),
    originalThesis:
      direction === 'LONG' ? 'SOL will strengthen.' : 'SOL will weaken.',
    market: 'SOL/USDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    claim:
      direction === 'LONG'
        ? 'SOL will strengthen over the stated horizon'
        : 'SOL will weaken over the stated horizon',
    direction,
  } as const;
}

describe('server-issued argument options', () => {
  it('keeps the fixed-slot provider and application schemas aligned', () => {
    const optionIds = ['opt_primary', 'opt_secondary'];
    const applicationSchema = createArgumentSelectionPlanOutputSchema(optionIds);
    const providerSchema = createArgumentSelectionPlanJsonSchema(optionIds) as {
      required: string[];
      properties: Record<string, { enum: Array<string | null> }>;
    };
    const valid = argumentSelectionPlan(optionIds);

    expect(applicationSchema.safeParse(valid).success).toBe(true);
    expect(providerSchema.required).toEqual(ARGUMENT_SELECTION_SLOT_NAMES);
    expect(providerSchema.properties.primary?.enum).toEqual(optionIds);
    for (const slot of ARGUMENT_SELECTION_SLOT_NAMES.slice(1)) {
      expect(providerSchema.properties[slot]?.enum).toEqual([...optionIds, null]);
    }
    expect(
      applicationSchema.safeParse({ ...valid, secondaryA: valid.primary }).success
    ).toBe(false);
    expect(
      applicationSchema.safeParse({ ...valid, primary: 'opt_unknown' }).success
    ).toBe(false);
  });

  it('binds assumptions and capability-safe semantics into deterministic bounded options', () => {
    const thesis = makeStructuredThesis();
    const assumptions = makeAssumptions();
    const ledger = capabilityLedger();
    const first = authorizedArgumentPointCatalog({
      thesis,
      ledger,
      assumptions,
      stance: 'DISSENTER',
    });
    const second = authorizedArgumentPointCatalog({
      thesis: structuredClone(thesis),
      ledger: structuredClone(ledger),
      assumptions: structuredClone(assumptions),
      stance: 'DISSENTER',
    });

    expect(second).toEqual(first);
    expect(first.length).toBeLessThanOrEqual(ARGUMENT_OPTION_CATALOG_MAX_ITEMS);
    expect(first.every((option) => assumptions.some((item) => item.id === option.targetAssumptionId))).toBe(true);
    expect(first.every((option) => option.allowedStance === 'DISSENTER')).toBe(true);
    expect(new Set(first.map((option) => option.optionId)).size).toBe(first.length);
  });

  it('exposes only measurement-capable interpretations', () => {
    const options = authorizedArgumentPointCatalog({
      thesis: makeStructuredThesis(),
      ledger: capabilityLedger(),
      assumptions: makeAssumptions(),
      stance: 'DISSENTER',
    });
    const byEvidence = (id: string) =>
      options.filter((option) => option.evidenceClaimIds.includes(id));

    expect(byEvidence('ev_single')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interpretationKind: 'SINGLE_MARKET_PRICE_CONTEXT' }),
      ])
    );
    expect(byEvidence('ev_single').some((option) =>
      ['RELATIVE_RETURN_OBSERVATION', 'RETURN_SPREAD_OBSERVATION'].includes(
        option.interpretationKind
      )
    )).toBe(false);
    expect(byEvidence('ev_relative')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interpretationKind: 'RELATIVE_RETURN_OBSERVATION' }),
      ])
    );
    expect(byEvidence('ev_spread')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ interpretationKind: 'RETURN_SPREAD_OBSERVATION' }),
      ])
    );
    expect(byEvidence('ev_spread').some((option) =>
      option.qualitativeInterpretation.includes('not the percentage change')
    )).toBe(true);
    for (const id of ['ev_funding', 'ev_oi']) {
      expect(
        byEvidence(id).every(
          (option) =>
            /\b(?:do|does) not\b/i.test(option.qualitativeInterpretation) &&
            !/\b(?:establishes|confirms|proves)\b.*\b(?:directional positioning|institutional participation|crowding)\b/i.test(
              option.qualitativeInterpretation
            )
        )
      ).toBe(true);
      expect(
        byEvidence(id).some(
          (option) =>
            option.qualitativeInterpretation.includes('directional positioning') &&
            option.qualitativeInterpretation.includes('institutional participation') &&
            option.qualitativeInterpretation.includes('crowding')
        )
      ).toBe(true);
    }
    expect(options.every((option) => !/\bwill (?:outperform|underperform)\b/i.test(
      option.qualitativeInterpretation
    ))).toBe(true);
  });

  it.each(['LONG', 'SHORT'] as const)(
    'builds grounded single-asset %s options without relative claims',
    async (direction) => {
      const thesis = singleAssetThesis(direction);
      const ledger = capabilityLedger();
      const assumptions = makeAssumptions();
      const advocateOptions = authorizedArgumentPointCatalog({
        thesis,
        ledger,
        assumptions,
        stance: 'ADVOCATE',
      });
      const dissentOptions = authorizedArgumentPointCatalog({
        thesis,
        ledger,
        assumptions,
        stance: 'DISSENTER',
      });

      for (const options of [advocateOptions, dissentOptions]) {
        expect(options.length).toBeGreaterThan(0);
        expect(
          options.every(
            (option) =>
              option.interpretationKind !== 'RELATIVE_RETURN_OBSERVATION' &&
              option.interpretationKind !== 'RETURN_SPREAD_OBSERVATION' &&
              !option.evidenceClaimIds.includes('ev_relative') &&
              !option.evidenceClaimIds.includes('ev_spread')
          )
        ).toBe(true);
        expect(options).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              interpretationKind: 'SINGLE_ASSET_HISTORICAL_PRICE_OBSERVATION',
              qualitativeInterpretation: expect.stringContaining(
                'does not establish future direction or persistence'
              ),
            }),
          ])
        );
      }

      const model = new QueueModel([
        argumentSelectionPlanFromRequest,
        argumentSelectionPlanFromRequest,
      ]);
      const analyst = new DeepSeekAnalystAdapter({
        model,
        now: () => new Date(FIXED_AT),
      });
      const advocate = await analyst.buildAdvocateCase(thesis, ledger, assumptions);
      const dissent = await analyst.buildDissentCase(thesis, ledger, assumptions);

      expect(() => assertArgumentEvidenceGrounding(advocate, ledger)).not.toThrow();
      expect(() => assertArgumentEvidenceGrounding(dissent, ledger)).not.toThrow();
      expect(() => assertAdvocateDissenterDistinct(advocate, dissent)).not.toThrow();
      expect(model.requests).toHaveLength(2);
    }
  );

  it('assembles one through five grounded points with slot-owned weights', async () => {
    const ledger = capabilityLedger();
    for (let count = 1; count <= 5; count += 1) {
      const model = new QueueModel([
        (request: Parameters<typeof argumentSelectionPlanFromRequest>[0]) =>
          argumentSelectionPlanFromRequest(request, count),
      ]);
      const argument = await new DeepSeekAnalystAdapter({
        model,
        now: () => new Date(FIXED_AT),
      }).buildDissentCase(makeStructuredThesis(), ledger, makeAssumptions());

      expect(argument.points).toHaveLength(count);
      expect(argument.points.map((point) => point.weight)).toEqual(
        ['PRIMARY', 'SECONDARY', 'SECONDARY', 'CONTEXTUAL', 'CONTEXTUAL'].slice(
          0,
          count
        )
      );
      expect(model.requests).toHaveLength(1);
      expect(() => assertArgumentEvidenceGrounding(argument, ledger)).not.toThrow();
    }
  });

  it('preserves exact evidence and server-bound assumption linkage during assembly', async () => {
    const ledger = capabilityLedger();
    const originalLedger = structuredClone(ledger);
    const assumptions = makeAssumptions();
    let selectedOptionId = '';
    const model = new QueueModel([
      (request: Parameters<typeof argumentSelectionPlanFromRequest>[0]) => {
        const options = request.userPayload.authorizedArgumentOptions as Array<{
          optionId: string;
          evidenceClaimIds: string[];
        }>;
        const option = options.find((item) => item.evidenceClaimIds.includes('ev_relative'))!;
        selectedOptionId = option.optionId;
        return argumentSelectionPlan([option.optionId]);
      },
    ]);
    const argument = await new DeepSeekAnalystAdapter({
      model,
      now: () => new Date(FIXED_AT),
    }).buildAdvocateCase(makeStructuredThesis(), ledger, assumptions);
    const option = authorizedArgumentPointCatalog({
      thesis: makeStructuredThesis(),
      ledger,
      assumptions,
      stance: 'ADVOCATE',
    }).find((item) => item.optionId === selectedOptionId)!;
    const evidenceItem = ledger.items.find((item) => item.id === 'ev_relative')!;

    expect(argument.points[0]).toMatchObject({
      evidenceIds: option.evidenceClaimIds,
      targetAssumptionIds: [option.targetAssumptionId],
      title: option.title,
    });
    expect(argument.points[0]?.reasoning).toContain(
      `[${evidenceItem.id}] ${evidenceItem.claim}`
    );
    expect(argument.points[0]?.reasoning).toContain(option.qualitativeInterpretation);
    expect(ledger).toEqual(originalLedger);
    expect(argument).not.toHaveProperty('humanDecision');
  });

  it('rejects invalid ledger and assumption boundaries before making a provider call', async () => {
    const cases = [
      {
        thesis: makeStructuredThesis(),
        ledger: { ...makeEvidenceLedger(), items: [], summary: {
          ...makeEvidenceLedger().summary,
          totalCount: 0,
          neutralCount: 0,
          categoriesPresent: [],
        } },
        assumptions: makeAssumptions(),
        code: 'EVIDENCE_UNAVAILABLE',
      },
      {
        thesis: makeStructuredThesis(),
        ledger: makeEvidenceLedger('th_other'),
        assumptions: makeAssumptions(),
        code: 'INVALID_INPUT',
      },
      {
        thesis: makeStructuredThesis(),
        ledger: makeEvidenceLedger(),
        assumptions: makeAssumptions('th_other'),
        code: 'INVALID_INPUT',
      },
    ];

    for (const testCase of cases) {
      const model = new QueueModel([argumentSelectionPlanFromRequest]);
      await expect(
        new DeepSeekAnalystAdapter({ model }).buildAdvocateCase(
          testCase.thesis,
          testCase.ledger,
          testCase.assumptions
        )
      ).rejects.toMatchObject({ code: testCase.code });
      expect(model.requests).toHaveLength(0);
    }
  });

  it('fails unknown, duplicated, and role-ineligible selections closed without another call', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ledger = capabilityLedger();
    const assumptions = makeAssumptions();
    const dissentOption = authorizedArgumentPointCatalog({
      thesis: makeStructuredThesis(),
      ledger,
      assumptions,
      stance: 'DISSENTER',
    })[0]!;
    const invalidPlans = [
      argumentSelectionPlan(['unknown_option']),
      {
        ...argumentSelectionPlan(['placeholder']),
        primary: dissentOption.optionId,
      },
      {
        primary: dissentOption.optionId,
        secondaryA: dissentOption.optionId,
        secondaryB: null,
        contextualA: null,
        contextualB: null,
      },
    ];

    for (const plan of invalidPlans) {
      const model = new QueueModel([
        plan,
        (request: Parameters<typeof argumentSelectionPlanFromRequest>[0]) =>
          argumentSelectionPlanFromRequest(request),
      ]);
      await expect(
        new DeepSeekAnalystAdapter({ model }).buildAdvocateCase(
          makeStructuredThesis(),
          ledger,
          assumptions
        )
      ).rejects.toMatchObject({ code: 'MODEL_OUTPUT_INVALID' });
      expect(model.requests).toHaveLength(1);
    }
    warning.mockRestore();
  });

  it('keeps server prose bounded and produces genuinely distinct role arguments', async () => {
    const ledger = capabilityLedger();
    const assumptions = makeAssumptions();
    const model = new QueueModel([
      argumentSelectionPlanFromRequest,
      argumentSelectionPlanFromRequest,
    ]);
    const analyst = new DeepSeekAnalystAdapter({
      model,
      now: () => new Date(FIXED_AT),
    });
    const advocate = await analyst.buildAdvocateCase(
      makeStructuredThesis(),
      ledger,
      assumptions
    );
    const dissent = await analyst.buildDissentCase(
      makeStructuredThesis(),
      ledger,
      assumptions
    );

    for (const argument of [advocate, dissent]) {
      expect(argument.points.every((point) => point.title.length <= 120)).toBe(true);
      expect(() =>
        assertSafeModelAuthoredText(
          'argumentTest',
          argument.points.map((point, index) => ({
            field: `points[${index}].title`,
            value: point.title,
          }))
        )
      ).not.toThrow();
    }
    expect(() => assertAdvocateDissenterDistinct(advocate, dissent)).not.toThrow();
    expect(advocate.points[0]?.reasoning).not.toBe(dissent.points[0]?.reasoning);
    expect(model.requests).toHaveLength(2);
    expect(analyst.getModelCallRecords()).toEqual([
      expect.objectContaining({ operation: 'buildAdvocateCase', attempt: 1 }),
      expect.objectContaining({ operation: 'buildDissentCase', attempt: 1 }),
    ]);

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => assertAdvocateDissenterDistinct(advocate, advocate)).toThrowError(
      expect.objectContaining({
        code: 'MODEL_OUTPUT_INVALID',
        details: expect.objectContaining({
          validationCategory: 'CROSS_ARGUMENT_VALIDATION',
          invariantCode: 'ADVOCATE_DISSENTER_MUST_BE_MATERIALLY_DISTINCT',
          issuePath: 'arguments',
        }),
      })
    );
    warning.mockRestore();
  });

  it('keeps only provider truncation recovery on the active argument path', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const model = new QueueModel([
      () => {
        throw DissentError.outputTruncated('buildAdvocateCase', {
          operation: 'buildAdvocateCase',
        });
      },
      argumentSelectionPlanFromRequest,
    ]);
    const argument = await new DeepSeekAnalystAdapter({ model }).buildAdvocateCase(
      makeStructuredThesis(),
      makeEvidenceLedger(),
      makeAssumptions()
    );

    expect(argument.points).toHaveLength(1);
    expect(model.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(model.requests.map((request) => request.maxOutputTokens)).toEqual([
      6_000,
      7_500,
    ]);
    warning.mockRestore();
  });

  it('stops after a second truncated argument response', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const truncated = () => {
      throw DissentError.outputTruncated('buildAdvocateCase', {
        operation: 'buildAdvocateCase',
      });
    };
    const model = new QueueModel([truncated, truncated, argumentSelectionPlanFromRequest]);

    await expect(
      new DeepSeekAnalystAdapter({ model }).buildAdvocateCase(
        makeStructuredThesis(),
        makeEvidenceLedger(),
        makeAssumptions()
      )
    ).rejects.toMatchObject({ code: 'OUTPUT_TRUNCATED' });
    expect(model.requests.map((request) => request.attempt)).toEqual([1, 2]);
    warning.mockRestore();
  });

  it('does not start argument truncation recovery after the retry cutoff', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timer = vi.fn().mockReturnValueOnce(0).mockReturnValue(85_001);
    const model = new QueueModel([
      () => {
        throw DissentError.outputTruncated('buildDissentCase', {
          operation: 'buildDissentCase',
        });
      },
      argumentSelectionPlanFromRequest,
    ]);

    await expect(
      new DeepSeekAnalystAdapter({ model, timer }).buildDissentCase(
        makeStructuredThesis(),
        makeEvidenceLedger(),
        makeAssumptions()
      )
    ).rejects.toMatchObject({ code: 'OUTPUT_TRUNCATED' });
    expect(model.requests).toHaveLength(1);
    warning.mockRestore();
  });

  it('keeps the option catalog and serialized argument prompt within deterministic bounds', async () => {
    const manyItems = Array.from({ length: 20 }, (_, index) =>
      evidence({ id: `ev_many_${index}`, type: 'PRICE_CHANGE_24H' })
    );
    const ledger = ledgerWith(...manyItems);
    const model = new QueueModel([argumentSelectionPlanFromRequest]);
    await new DeepSeekAnalystAdapter({ model }).buildAdvocateCase(
      makeStructuredThesis(),
      ledger,
      makeAssumptions()
    );
    const request = model.requests[0]!;
    const options = request.userPayload.authorizedArgumentOptions as unknown[];
    const promptCharacters =
      request.systemPrompt.length + JSON.stringify(request.userPayload).length;

    expect(options).toHaveLength(ARGUMENT_OPTION_CATALOG_MAX_ITEMS);
    expect(promptCharacters).toBeLessThan(120_000);
  });

  it('defensively rejects a role-ineligible option during direct materialization', () => {
    const ledger = capabilityLedger();
    const assumptions = makeAssumptions();
    const dissentOption = authorizedArgumentPointCatalog({
      thesis: makeStructuredThesis(),
      ledger,
      assumptions,
      stance: 'DISSENTER',
    })[0]!;
    expect(() =>
      materializeArgumentSelection({
        operation: 'buildAdvocateCase',
        stance: 'ADVOCATE',
        thesis: makeStructuredThesis(),
        ledger,
        assumptions,
        options: [dissentOption],
        plan: argumentSelectionPlan([dissentOption.optionId]),
        createdAt: FIXED_AT,
      })
    ).toThrowError(DissentError);
  });
});
