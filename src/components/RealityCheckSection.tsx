'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { StressScenarioV1, InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import {
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';

export interface RealityCheckSectionProps {
  assumptions: AssumptionV1[];
  stressScenarios: StressScenarioV1[];
  invalidationConditions: InvalidationConditionV1[];
  evidenceLedger: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1) => void;
  initialExpandedConditions?: boolean;
  className?: string;
}

function cleanConditionStatement(statement: string): string {
  return statement
    .replace(/^Thesis invalidation condition:\s*/i, '')
    .replace(/^Rationale:\s*/i, '')
    .trim();
}

function cleanObservableEvent(event?: string): string {
  if (!event) return '';
  return event
    .replace(/^If observed:\s*/i, '')
    .replace(/^Observable Trigger Event:\s*/i, '')
    .replace(/^Trigger Event:\s*/i, '')
    .trim();
}


export function RealityCheckSection({
  assumptions,
  stressScenarios,
  invalidationConditions,
  evidenceLedger,
  onInspectEvidence,
  initialExpandedConditions = false,
  className = '',
}: RealityCheckSectionProps) {
  const [showAllAssumptions, setShowAllAssumptions] = useState(false);
  const [expandedScenarioId, setExpandedScenarioId] = useState<string | null>(null);
  const [showAllConditions, setShowAllConditions] = useState(initialExpandedConditions);
  const handleInspect = onInspectEvidence ?? (() => {});

  // Assumption counts
  const supportedCount = assumptions.filter((a) => a.status === 'SUPPORTED').length;
  const questionedCount = assumptions.filter((a) => a.status === 'QUESTIONED').length;
  const untestedCount = assumptions.filter((a) => a.status === 'UNTESTED').length;
  const contradictedCount = assumptions.filter((a) => a.status === 'CONTRADICTED').length;
  const totalAssumptions = assumptions.length;

  const supportedPct = totalAssumptions > 0 ? (supportedCount / totalAssumptions) * 100 : 0;
  const questionedPct = totalAssumptions > 0 ? (questionedCount / totalAssumptions) * 100 : 0;
  const untestedPct = totalAssumptions > 0 ? (untestedCount / totalAssumptions) * 100 : 0;
  const contradictedPct = totalAssumptions > 0 ? (contradictedCount / totalAssumptions) * 100 : 0;

  // Primary tension assumption (prioritize QUESTIONED or CONTRADICTED)
  const primaryTensionAssumption =
    assumptions.find((a) => a.status === 'QUESTIONED') ??
    assumptions.find((a) => a.status === 'CONTRADICTED') ??
    assumptions[0];

  // Sort review conditions so that conditions with direct Bitget grounding appear first,
  // followed by mixed/derived desk analytics, followed by conditions with no evidence.
  const sortedConditions = useMemo(() => {
    const getGroundingScore = (cond: InvalidationConditionV1): number => {
      if (!cond.relevantEvidenceIds || cond.relevantEvidenceIds.length === 0) return 0;
      const items = cond.relevantEvidenceIds
        .map((id) => evidenceLedger.items.find((e) => e.id === id))
        .filter(Boolean) as EvidenceV1[];
      if (items.length === 0) return 0;

      const isBitget = (item: EvidenceV1) =>
        item.provenance.sourceName.toLowerCase().includes('bitget') ||
        item.provenance.sourceType === 'EXCHANGE_API';

      const bitgetCount = items.filter(isBitget).length;
      const nonBitgetCount = items.length - bitgetCount;

      if (bitgetCount > 0 && nonBitgetCount === 0) return 3; // Pure Bitget
      if (bitgetCount > 0) return 2; // Mixed Bitget
      return 1; // Desk Analytics / derived only
    };

    return [...invalidationConditions].sort((a, b) => {
      // 1. High urgency (IMMEDIATE_EXIT) takes precedence if present
      const aImmediate = a.urgency === 'IMMEDIATE_EXIT' ? 1 : 0;
      const bImmediate = b.urgency === 'IMMEDIATE_EXIT' ? 1 : 0;
      if (aImmediate !== bImmediate) return bImmediate - aImmediate;

      // 2. Bitget grounding priority (pure Bitget > mixed Bitget > Desk Analytics > none)
      const aScore = getGroundingScore(a);
      const bScore = getGroundingScore(b);
      if (aScore !== bScore) return bScore - aScore;

      return 0; // preserve original relative order
    });
  }, [invalidationConditions, evidenceLedger.items]);

  // Primary review trigger: first sorted condition (prioritizing direct Bitget grounding)
  const primaryCondition = sortedConditions[0];

  const toggleScenario = (id: string) => {
    setExpandedScenarioId((prev) => (prev === id ? null : id));
  };

  const renderConditionCard = (
    cond: InvalidationConditionV1
  ) => {
    const hasEvidence = cond.relevantEvidenceIds && cond.relevantEvidenceIds.length > 0;

    return (
      <div
        key={cond.id}
        className="p-4 sm:p-5 rounded-xl bg-stone-50/70 border border-stone-200/90 shadow-2xs space-y-3.5 transition-colors hover:border-stone-300"
      >

        {/* Observable Trigger Section */}
        {cond.type === 'QUANTITATIVE' ? (
          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-semibold block">
              Quantitative Threshold Trigger
            </span>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-sm font-semibold text-stone-900 font-sans">
                {cond.targetMetric}
              </span>
              <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100/80 border border-amber-200 px-2 py-0.5 rounded">
                {cond.triggerThreshold}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-semibold block">
              Observable Market Trigger
            </span>
            <p className="text-xs sm:text-sm font-semibold text-stone-900 leading-snug font-sans">
              {cleanObservableEvent(cond.observableEvent)}
            </p>
          </div>
        )}

        {/* Invalidation Rationale: Visually distinct indented block */}
        <div className="border-l-2 border-stone-300 pl-3 py-1 space-y-0.5 bg-stone-100/40 rounded-r-md">
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">
            Thesis Invalidation Rationale
          </span>
          <p className="text-xs text-stone-700 leading-relaxed font-sans">
            {cleanConditionStatement(cond.statement)}
          </p>
        </div>

        {/* Verification Specification Grid */}
        {cond.type === 'QUANTITATIVE' ? (
          <div className="pt-2.5 border-t border-stone-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">Target Metric</span>
              <span className="text-xs font-medium text-stone-900 font-sans block truncate">{cond.targetMetric}</span>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">Threshold</span>
              <span className="font-mono text-xs font-bold text-amber-800 block">{cond.triggerThreshold}</span>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">Review Window</span>
              <span className="text-xs text-stone-800 font-sans block">{cond.timeframe}</span>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">Source</span>
              <span className="text-xs text-stone-800 font-sans block">{cond.observableDataSource}</span>
            </div>
          </div>
        ) : (
          <div className="pt-2.5 border-t border-stone-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">
                Verification Source
              </span>
              <p className="text-xs text-stone-800 font-sans leading-relaxed">
                {cond.verificationSource}
              </p>
            </div>
            {cond.expectedWindow && (
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-medium block">
                  Observation Horizon
                </span>
                <p className="text-xs text-stone-800 font-sans leading-relaxed">
                  {cond.expectedWindow}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Grounding Baseline Evidence */}
        {hasEvidence && (
          <div className="pt-2.5 border-t border-stone-200/80 flex flex-col sm:flex-row sm:items-baseline gap-2 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500 font-semibold shrink-0">
              Grounding Baseline:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {cond.relevantEvidenceIds.map((evId) => (
                <EvidenceCitationBadge
                  key={evId}
                  evidenceId={evId}
                  ledger={evidenceLedger}
                  onInspect={handleInspect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="reality-check" className={`space-y-6 ${className}`}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-1 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">The Reality Check</h2>
          <p className="text-xs text-muted-foreground">
            Empirical validation of thesis assumptions, forward stress scenarios, and review criteria.
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Editorial Stress Testing
        </span>
      </div>

      {/* ========================================================================= */}
      {/* 1. ASSUMPTIONS: Compact Full-Width Status Distribution                   */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        {/* Header & Counts */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-stone-500" />
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Assumption Health &amp; Distribution
            </h3>
          </div>
          <span className="font-mono text-xs text-muted-foreground bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded-full w-fit">
            {totalAssumptions} Assessed Assumptions
          </span>
        </div>

        {/* Compact Full-Width Segmented Bar */}
        <div className="space-y-2.5">
          <div
            role="region"
            aria-label="Assumption status distribution"
            className="h-2.5 w-full rounded-full overflow-hidden flex bg-stone-100 border border-stone-200"
          >
            {supportedPct > 0 && (
              <div
                style={{ width: `${supportedPct}%` }}
                className="bg-emerald-600 h-full transition-all"
                title={`Supported: ${supportedCount} of ${totalAssumptions}`}
              />
            )}
            {questionedPct > 0 && (
              <div
                style={{ width: `${questionedPct}%` }}
                className="bg-amber-600 h-full transition-all"
                title={`Questioned: ${questionedCount} of ${totalAssumptions}`}
              />
            )}
            {untestedPct > 0 && (
              <div
                style={{ width: `${untestedPct}%` }}
                className="bg-stone-400 h-full transition-all"
                title={`Untested: ${untestedCount} of ${totalAssumptions}`}
              />
            )}
            {contradictedPct > 0 && (
              <div
                style={{ width: `${contradictedPct}%` }}
                className="bg-rose-600 h-full transition-all"
                title={`Contradicted: ${contradictedCount} of ${totalAssumptions}`}
              />
            )}
          </div>

          {/* Responsive Status Breakdown (2-col grid on mobile, 4-col grid on desktop) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 font-mono text-xs pt-1">
            <div className="flex items-center gap-2 text-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              <span>{supportedCount} Supported</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <span className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
              <span>{questionedCount} Questioned</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-stone-400 shrink-0" />
              <span>{untestedCount} Untested</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
              <span>{contradictedCount} Contradicted</span>
            </div>
          </div>
        </div>

        {/* Primary Tension Callout */}
        {primaryTensionAssumption && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-amber-800 uppercase tracking-wider font-semibold">
                Primary Tension ({primaryTensionAssumption.status})
              </span>
              <span className="text-stone-300">•</span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase">
                {primaryTensionAssumption.category.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-foreground font-medium leading-relaxed font-sans">
              &ldquo;{primaryTensionAssumption.claim}&rdquo;
            </p>
            {primaryTensionAssumption.challenge && (
              <p className="text-muted-foreground leading-relaxed italic font-sans">
                Risk: {primaryTensionAssumption.challenge}
              </p>
            )}
          </div>
        )}

        {/* Clear Interaction: Expand / Collapse All Assumptions */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAllAssumptions((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-600 hover:text-stone-900 transition-colors p-1.5 -ml-1.5 rounded hover:bg-stone-100 active:scale-[0.98]"
          >
            {showAllAssumptions ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Hide detailed assumptions</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>View all {totalAssumptions} assessed assumptions</span>
              </>
            )}
          </button>

          {/* Expanded Assumptions List */}
          {showAllAssumptions && (
            <div className="pt-3 space-y-3 border-t border-stone-200 mt-3">
              {assumptions.map((asm) => (
                <div
                  key={asm.id}
                  className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2 text-xs shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground font-medium leading-snug font-sans">
                      &ldquo;{asm.claim}&rdquo;
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700">
                        {asm.category.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded border font-semibold ${
                          asm.status === 'SUPPORTED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200/90'
                            : asm.status === 'QUESTIONED'
                            ? 'bg-amber-50 text-amber-800 border-amber-200/90'
                            : asm.status === 'CONTRADICTED'
                            ? 'bg-rose-50 text-rose-800 border-rose-200/90'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        {asm.status}
                      </span>
                    </div>
                  </div>

                  {asm.challenge && (
                    <div className="text-muted-foreground leading-relaxed font-sans">
                      <span className="font-mono text-stone-500 text-[11px]">Challenge:</span>{' '}
                      {asm.challenge}
                    </div>
                  )}

                  {asm.invalidationCondition && (
                    <div className="text-muted-foreground leading-relaxed font-mono text-[11px]">
                      <span className="text-stone-500">Invalidation:</span>{' '}
                      <span className="text-stone-800 font-medium">{asm.invalidationCondition}</span>
                    </div>
                  )}

                  {/* Linked Evidence */}
                  {(asm.supportingEvidenceIds.length > 0 || asm.opposingEvidenceIds.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {asm.supportingEvidenceIds.map((evId) => (
                        <EvidenceCitationBadge
                          key={evId}
                          evidenceId={evId}
                          ledger={evidenceLedger}
                          onInspect={handleInspect}
                        />
                      ))}
                      {asm.opposingEvidenceIds.map((evId) => (
                        <EvidenceCitationBadge
                          key={evId}
                          evidenceId={evId}
                          ledger={evidenceLedger}
                          onInspect={handleInspect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. STRESS SCENARIOS: Spacious 2-Column Editorial Summaries              */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-stone-500" />
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Forward Stress Scenarios
            </h3>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {stressScenarios.length} Scenarios Evaluated
          </span>
        </div>

        {/* 2-Column Responsive Grid (equal accessibility) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {stressScenarios.map((sc, idx) => {
            const isExpanded = expandedScenarioId === sc.id;
            return (
              <div
                key={sc.id}
                className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4 hover:border-stone-400 transition-colors flex flex-col"
              >
                <div className="space-y-3.5">
                  {/* Scenario Name & Plausibility */}
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-stone-200">
                    <div className="space-y-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                        Scenario {idx + 1}
                      </span>
                      <h4 className="text-sm font-semibold text-foreground font-sans">
                        {sc.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700">
                        {sc.scenarioType.replace(/_/g, ' ')}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-800 font-medium">
                        {sc.plausibility} Plausibility
                      </span>
                    </div>
                  </div>

                  {/* Clearly Distinguished: Hypothetical Change */}
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                      Hypothetical Regime Shift:
                    </span>
                    <p className="text-xs text-stone-700 leading-relaxed font-sans">
                      {sc.description}
                    </p>
                  </div>

                  {/* Clearly Distinguished: Potential Consequence */}
                  <div className="space-y-1 pt-1">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                      Potential Consequence for Thesis:
                    </span>
                    <p className="text-xs text-foreground font-medium leading-relaxed bg-stone-50 border border-stone-200 p-3 rounded-xl font-sans">
                      {sc.consequenceForThesis}
                    </p>
                  </div>

                  {/* On-Demand Transmission Mechanism, Uncertainties & Evidence */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-stone-200 space-y-3 text-xs">
                      <div className="space-y-1">
                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                          Transmission Mechanism:
                        </span>
                        <p className="text-xs text-stone-700 leading-relaxed font-sans">
                          {sc.transmissionMechanism}
                        </p>
                      </div>

                      {sc.uncertainties.length > 0 && (
                        <div className="space-y-1">
                          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                            Key Uncertainties:
                          </span>
                          <ul className="list-disc list-inside text-xs text-stone-600 space-y-0.5 font-sans">
                            {sc.uncertainties.map((u, i) => (
                              <li key={i}>{u}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {sc.relevantEvidenceIds.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                            Cited Evidence:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {sc.relevantEvidenceIds.map((evId) => (
                              <EvidenceCitationBadge
                                key={evId}
                                evidenceId={evId}
                                ledger={evidenceLedger}
                                onInspect={handleInspect}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Progressive Disclosure Action */}
                <div className="pt-2 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={() => toggleScenario(sc.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-600 hover:text-stone-900 transition-colors p-1.5 -ml-1.5 rounded hover:bg-stone-100 active:scale-[0.98]"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Hide transmission details</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>View transmission mechanism &amp; evidence</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. THESIS REVIEW CONDITIONS: Concise Summary + Expandable Matrix          */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        {/* Header & Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-stone-500" />
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Thesis Review Conditions
            </h3>
          </div>
          <span className="font-mono text-xs text-muted-foreground bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded-full w-fit">
            {invalidationConditions.length} Established Conditions
          </span>
        </div>

        {/* Section Concise Summary */}
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed font-sans">
            Observable market metrics established to trigger a formal reassessment of conviction. These represent empirical research review thresholds, not automated trade execution orders.
          </p>

          {/* Primary Trigger Highlight */}
          {primaryCondition && renderConditionCard(primaryCondition)}
        </div>

        {/* Clear Interaction: View All Conditions */}
        {invalidationConditions.length > 1 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAllConditions((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-600 hover:text-stone-900 transition-colors p-1.5 -ml-1.5 rounded hover:bg-stone-100 active:scale-[0.98]"
            >
              {showAllConditions ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Hide review conditions</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>View all {invalidationConditions.length} review conditions</span>
                </>
              )}
            </button>

            {/* Expanded Full Conditions Record */}
            {showAllConditions && (
              <div className="pt-3 space-y-3 border-t border-stone-200 mt-3">
                {sortedConditions.map((cond) => renderConditionCard(cond))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
