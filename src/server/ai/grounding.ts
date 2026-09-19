import { createHash } from 'node:crypto';
import { ArgumentV1Schema, type ArgumentStanceV1, type ArgumentV1 } from '@/core/contracts/argument';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { EvidenceLedgerV1, EvidenceObservationTypeV1 } from '@/core/contracts/evidence';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { assertArgumentEvidenceGrounding } from '@/core/domain/invariants';
import { DissentError } from '@/core/errors/domain-errors';
import type { z } from 'zod';
import { ArgumentDraftOutputSchema } from './ai-output.schemas';

type ArgumentDraft = z.infer<typeof ArgumentDraftOutputSchema>;

const NUMERIC_FACT_PATTERN = /(?:[$€£¥]|\b\d+(?:[.,]\d+)?\b|%)/;
const DECISION_PATTERN = /\b(?:PROCEED|WATCH|PASS|BUY|SELL)\b/i;

const SEMANTIC_EVIDENCE_RULES: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  allowedTypes: ReadonlySet<EvidenceObservationTypeV1>;
}> = [
  {
    label: 'funding',
    pattern: /\b(?:funding|funding rate)\b/i,
    allowedTypes: new Set(['FUNDING_RATE']),
  },
  {
    label: 'positioning',
    pattern: /\b(?:open interest|positioning)\b/i,
    allowedTypes: new Set(['OPEN_INTEREST']),
  },
  {
    label: 'relative-performance',
    pattern: /\b(?:relative return|return spread|outperform|underperform|relative momentum)\b/i,
    allowedTypes: new Set(['RELATIVE_RETURN', 'RETURN_SPREAD', 'INTERVAL_PRICE_CHANGE']),
  },
  {
    label: 'volume',
    pattern: /\bvolume\b/i,
    allowedTypes: new Set(['BASE_VOLUME_24H']),
  },
];

export function deterministicId(prefix: string, value: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${prefix}_${digest}`;
}

export function assertSafeModelAuthoredText(
  operation: string,
  values: Array<{ field: string; value: string }>
): void {
  for (const { field, value } of values) {
    if (NUMERIC_FACT_PATTERN.test(value)) {
      throw DissentError.modelOutputInvalid(
        operation,
        'Model-authored argument text contains numeric content; numeric facts must come from deterministic evidence quotations.',
        { field }
      );
    }
    if (DECISION_PATTERN.test(value)) {
      throw DissentError.modelOutputInvalid(
        operation,
        'Model-authored argument text contains prohibited trading-decision language.'
      );
    }
  }
}

export function evidenceCatalog(ledger: EvidenceLedgerV1): Array<Record<string, unknown>> {
  return ledger.items.map((item) => ({
    id: item.id,
    exactClaim: item.claim,
    category: item.category,
    nature: item.nature,
    observationType: item.observation.type,
    market: item.observation.market,
    value: item.value,
    unit: item.unit,
    observedAt: item.provenance.observedAt,
    sourceName: item.provenance.sourceName,
  }));
}

export function deriveResearchLimitations(ledger: EvidenceLedgerV1): string[] {
  const categories = new Set(ledger.items.map((item) => item.category));
  const sourceTypes = new Set(ledger.items.map((item) => item.provenance.sourceType));
  const observationTypes = new Set(ledger.items.map((item) => item.observation.type));
  const limitations: string[] = [];

  if (!categories.has('MACRO_METRIC')) {
    limitations.push('Research limitation: the evidence ledger contains no macro observations.');
  }
  if (!sourceTypes.has('NEWS_WIRE')) {
    limitations.push('Research limitation: the evidence ledger contains no news-wire observations.');
  }
  if (!categories.has('SENTIMENT_METRIC')) {
    limitations.push('Research limitation: the evidence ledger contains no sentiment observations.');
  }
  if (observationTypes.has('FUNDING_RATE') || observationTypes.has('OPEN_INTEREST')) {
    limitations.push(
      'Research limitation: positioning coverage is limited to available funding-rate or open-interest snapshots.'
    );
  } else {
    limitations.push('Research limitation: the evidence ledger contains no positioning observations.');
  }

  return limitations;
}

function assertSemanticEvidenceMatch(
  operation: string,
  text: string,
  evidenceTypes: Set<EvidenceObservationTypeV1>
): void {
  for (const rule of SEMANTIC_EVIDENCE_RULES) {
    if (rule.pattern.test(text) && ![...evidenceTypes].some((type) => rule.allowedTypes.has(type))) {
      throw DissentError.modelOutputInvalid(
        operation,
        `Interpretation mentions a measurement not supported by its selected evidence types.`,
        {
          measurementRule: rule.label,
          selectedEvidenceTypes: [...evidenceTypes].sort(),
          allowedEvidenceTypes: [...rule.allowedTypes].sort(),
        }
      );
    }
  }
}

export function materializeGroundedArgument(input: {
  operation: string;
  stance: ArgumentStanceV1;
  thesis: StructuredThesisV1;
  ledger: EvidenceLedgerV1;
  assumptions: AssumptionV1[];
  draft: ArgumentDraft;
  createdAt: string;
}): ArgumentV1 {
  const evidenceById = new Map(input.ledger.items.map((item) => [item.id, item]));
  const assumptionIds = new Set(input.assumptions.map((item) => item.id));
  const modelText = [
    { field: 'summaryInterpretation', value: input.draft.summaryInterpretation },
    ...input.draft.counterweights.map((value, index) => ({
      field: `counterweights[${index}]`,
      value,
    })),
    ...input.draft.points.flatMap((point, index) => [
      { field: `points[${index}].title`, value: point.title },
      { field: `points[${index}].interpretation`, value: point.interpretation },
    ]),
  ];
  assertSafeModelAuthoredText(input.operation, modelText);

  const points = input.draft.points.map((point, index) => {
    const evidence = point.evidenceIds.map((id) => {
      const item = evidenceById.get(id);
      if (!item) {
        throw DissentError.modelOutputInvalid(
          input.operation,
          `Argument selected evidence ID ${id} outside the supplied ledger.`
        );
      }
      return item;
    });
    for (const assumptionId of point.targetAssumptionIds) {
      if (!assumptionIds.has(assumptionId)) {
        throw DissentError.modelOutputInvalid(
          input.operation,
          `Argument selected assumption ID ${assumptionId} outside the supplied assumptions.`
        );
      }
    }
    assertSemanticEvidenceMatch(
      input.operation,
      `${point.title} ${point.interpretation}`,
      new Set(evidence.map((item) => item.observation.type))
    );

    const exactEvidence = evidence
      .map((item) => `[${item.id}] ${item.claim}`)
      .join('\n');
    return {
      id: deterministicId('argp', {
        thesisId: input.thesis.id,
        stance: input.stance,
        index,
        evidenceIds: point.evidenceIds,
        interpretation: point.interpretation,
      }),
      title: point.title,
      reasoning: `Evidence:\n${exactEvidence}\nInterpretation: ${point.interpretation}`,
      evidenceIds: [...point.evidenceIds],
      targetAssumptionIds: [...point.targetAssumptionIds],
      weight: point.weight,
    };
  });

  const argument = ArgumentV1Schema.parse({
    id: deterministicId('arg', {
      thesisId: input.thesis.id,
      stance: input.stance,
      points: points.map((point) => point.id),
      summary: input.draft.summaryInterpretation,
    }),
    thesisId: input.thesis.id,
    stance: input.stance,
    summary: `Evidence-bound interpretation: ${input.draft.summaryInterpretation}`,
    points,
    risksOrCounterweightsConsidered: [
      ...input.draft.counterweights,
      ...deriveResearchLimitations(input.ledger),
    ],
    createdAt: input.createdAt,
    schemaVersion: 1,
  });
  assertArgumentEvidenceGrounding(argument, input.ledger);
  return argument;
}
