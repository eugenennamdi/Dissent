'use client';

import * as React from 'react';
import { useState } from 'react';
import type { StressScenarioV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { ChevronDown, ChevronUp, ArrowDown } from 'lucide-react';

export interface StressScenarioCausalFlowProps {
  scenarios: StressScenarioV1[];
  evidenceLedger?: EvidenceLedgerV1 | null;
  onInspectEvidence?: (evidence: EvidenceV1) => void;
  className?: string;
}

export function StressScenarioCausalFlow({
  scenarios,
  evidenceLedger,
  onInspectEvidence,
  className = '',
}: StressScenarioCausalFlowProps) {
  const [activeScenarioIndex, setActiveScenarioIndex] = useState(0);
  const [showUncertainties, setShowUncertainties] = useState(false);

  if (scenarios.length === 0) {
    return (
      <div className={`p-5 rounded-2xl bg-card border border-border text-xs text-muted-foreground ${className}`}>
        No stress scenarios evaluated.
      </div>
    );
  }

  const scenario = scenarios[activeScenarioIndex] ?? scenarios[0];
  if (!scenario) return null;

  return (
    <div className={`p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4 ${className}`}>
      {/* Header & Scenario Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            Stress Testing &amp; Causal Flow
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Plausible forward regime changes and transmission mechanisms evaluated
          </p>
        </div>

        {/* Multi-scenario selector tabs without artificial hierarchy */}
        {scenarios.length > 1 && (
          <div
            role="tablist"
            aria-label="Stress scenarios"
            className="flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 text-xs"
          >
            {scenarios.map((sc, idx) => (
              <button
                key={sc.id}
                type="button"
                role="tab"
                aria-selected={activeScenarioIndex === idx}
                onClick={() => {
                  setActiveScenarioIndex(idx);
                  setShowUncertainties(false);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors ${
                  activeScenarioIndex === idx
                    ? 'bg-white text-stone-900 font-medium shadow-xs border border-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Scenario {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scenario Metadata Bar */}
      <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-stone-200 text-xs font-mono">
        <span className="text-foreground font-semibold font-sans text-sm">
          {scenario.name}
        </span>
        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700 text-[11px]">
          {scenario.scenarioType.replace(/_/g, ' ')}
        </span>
        <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-800 text-[11px] font-medium">
          {scenario.plausibility} Plausibility
        </span>
      </div>

      {/* Restrained Causal Sequence */}
      <div className="space-y-2 pt-1 text-xs">
        {/* Step 1: Hypothetical Shock */}
        <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              1. Hypothetical Shock
            </span>
            <span className="text-[10px] text-muted-foreground">Regime Shift</span>
          </div>
          <p className="text-stone-800 leading-relaxed">
            {scenario.description}
          </p>
        </div>

        {/* Connector */}
        <div className="flex items-center justify-center py-0.5 text-stone-400">
          <ArrowDown className="w-3.5 h-3.5 opacity-60" />
        </div>

        {/* Step 2: Transmission Mechanism */}
        <div className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              2. Transmission Mechanism
            </span>
            <span className="text-[10px] text-muted-foreground">Market Channel</span>
          </div>
          <p className="text-stone-800 leading-relaxed font-mono text-xs">
            {scenario.transmissionMechanism}
          </p>
        </div>

        {/* Connector */}
        <div className="flex items-center justify-center py-0.5 text-stone-400">
          <ArrowDown className="w-3.5 h-3.5 opacity-60" />
        </div>

        {/* Step 3: Potential Thesis Consequence */}
        <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-800">
              3. Potential Thesis Consequence
            </span>
            <span className="text-[10px] text-muted-foreground">Risk Assessment</span>
          </div>
          <p className="text-foreground leading-relaxed font-medium">
            {scenario.consequenceForThesis}
          </p>
        </div>
      </div>

      {/* Progressive Disclosure: Uncertainties & Evidence Grounding */}
      <div className="pt-2 border-t border-stone-200">
        <button
          type="button"
          onClick={() => setShowUncertainties(!showUncertainties)}
          className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-stone-50 hover:bg-stone-100 text-xs font-mono text-stone-600 hover:text-stone-900 transition-colors border border-stone-200"
        >
          <span>
            {showUncertainties
              ? 'Hide Scenario Uncertainties & Supporting Evidence'
              : `Inspect Scenario Uncertainties & Evidence (${scenario.uncertainties.length} items)`}
          </span>
          {showUncertainties ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showUncertainties && (
          <div className="mt-3 p-3.5 rounded-xl bg-white border border-stone-200 space-y-3 text-xs shadow-2xs">
            {/* Uncertainties list */}
            <div className="space-y-1.5">
              <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                Uncertainties &amp; Analytical Limitations:
              </span>
              <ul className="space-y-1 list-disc list-inside text-stone-700 text-[11px] leading-relaxed">
                {scenario.uncertainties.map((unc, i) => (
                  <li key={i}>{unc}</li>
                ))}
              </ul>
            </div>

            {/* Mitigation / Hedge if present */}
            {scenario.suggestedMitigationOrHedge && (
              <div className="pt-2 border-t border-stone-200 text-[11px]">
                <span className="font-mono text-muted-foreground uppercase tracking-wider">
                  Suggested Risk Mitigation:
                </span>
                <p className="text-stone-700 mt-0.5 italic">
                  {scenario.suggestedMitigationOrHedge}
                </p>
              </div>
            )}

            {/* Relevant Evidence Citations */}
            {scenario.relevantEvidenceIds.length > 0 && (
              <div className="pt-2 border-t border-stone-200 space-y-1.5">
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Supporting Context Evidence:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {scenario.relevantEvidenceIds.map((evId) => (
                    <EvidenceCitationBadge
                      key={evId}
                      evidenceId={evId}
                      ledger={evidenceLedger}
                      onInspect={(ev) => onInspectEvidence?.(ev)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
