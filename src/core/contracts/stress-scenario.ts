import { z } from 'zod';

/**
 * Domain-general scenario classification.
 * Supports thesis-relevant macro, liquidity, positioning, correlation,
 * volatility, and market structure deterioration scenarios.
 */
export const ScenarioTypeV1Schema = z.enum([
  'MACRO_REGIME_CHANGE',
  'LIQUIDITY_SHOCK',
  'POSITIONING_REVERSAL',
  'LIQUIDATION_CASCADE',
  'VOLATILITY_EXPANSION',
  'CORRELATION_BREAKDOWN',
  'ASSET_SPECIFIC_EVENT',
  'MARKET_STRUCTURE_DETERIORATION',
  'OTHER',
]);
export type ScenarioTypeV1 = z.infer<typeof ScenarioTypeV1Schema>;

// Backward-compatible alias for regime classification
export const RegimeTypeV1Schema = ScenarioTypeV1Schema;
export type RegimeTypeV1 = ScenarioTypeV1;

export const PlausibilityBandV1Schema = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
  'TAIL_RISK',
]);
export type PlausibilityBandV1 = z.infer<typeof PlausibilityBandV1Schema>;

/**
 * StressScenarioV1
 * Plausible alternative condition/regime and its concrete consequences for the thesis.
 */
export const StressScenarioV1Schema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  name: z.string().min(1, 'Scenario name is required'),
  description: z.string().min(1, 'Scenario description is required'),
  affectedAssumptionIds: z.array(z.string()).default([]),
  transmissionMechanism: z.string().min(1, 'Transmission mechanism is required'),
  scenarioType: ScenarioTypeV1Schema,
  plausibility: PlausibilityBandV1Schema,
  consequenceForThesis: z.string().min(1, 'Consequence for thesis is required'),
  suggestedMitigationOrHedge: z.string().optional(),
  schemaVersion: z.literal(1).default(1),
});

export type StressScenarioV1 = z.infer<typeof StressScenarioV1Schema>;

export const InvalidationUrgencyV1Schema = z.enum([
  'IMMEDIATE_EXIT',
  'THESIS_REVIEW',
  'WATCHLIST_ONLY',
]);
export type InvalidationUrgencyV1 = z.infer<typeof InvalidationUrgencyV1Schema>;

/**
 * Quantitative Invalidation: Observable numeric metric crossing a threshold.
 * Example: "ETH/BTC closes below 0.0315 on 4H candle"
 */
export const QuantitativeInvalidationConditionV1Schema = z.object({
  type: z.literal('QUANTITATIVE'),
  id: z.string().min(1),
  thesisId: z.string().min(1),
  statement: z.string().min(1, 'Invalidation statement is required'),
  targetMetric: z.string().min(1, 'Target metric is required'),
  triggerThreshold: z.string().min(1, 'Trigger threshold is required'),
  timeframe: z.string().min(1, 'Timeframe is required'),
  observableDataSource: z.string().min(1, 'Observable data source is required'),
  urgency: InvalidationUrgencyV1Schema.default('IMMEDIATE_EXIT'),
  schemaVersion: z.literal(1).default(1),
});
export type QuantitativeInvalidationConditionV1 = z.infer<typeof QuantitativeInvalidationConditionV1Schema>;

/**
 * Qualitative / Event-Based Invalidation: Observable non-numeric real-world or market event.
 * Example: "Scheduled network hard fork delayed or cancelled by core developers"
 */
export const QualitativeInvalidationConditionV1Schema = z.object({
  type: z.literal('QUALITATIVE'),
  id: z.string().min(1),
  thesisId: z.string().min(1),
  statement: z.string().min(1, 'Invalidation statement is required'),
  observableEvent: z.string().min(1, 'Observable event description is required'),
  verificationSource: z.string().min(1, 'Verification source is required'),
  expectedWindow: z.string().optional(),
  urgency: InvalidationUrgencyV1Schema.default('IMMEDIATE_EXIT'),
  schemaVersion: z.literal(1).default(1),
});
export type QualitativeInvalidationConditionV1 = z.infer<typeof QualitativeInvalidationConditionV1Schema>;

/**
 * InvalidationConditionV1
 * Discriminated union of observable quantitative metrics and verifiable qualitative events
 * that would undermine or falsify the trade thesis.
 */
export const InvalidationConditionV1Schema = z.discriminatedUnion('type', [
  QuantitativeInvalidationConditionV1Schema,
  QualitativeInvalidationConditionV1Schema,
]);

export type InvalidationConditionV1 = z.infer<typeof InvalidationConditionV1Schema>;
