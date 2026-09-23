'use client';

import React, { useState } from 'react';
import type { StressScenarioV1, InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { getPlausibilityStyle } from '@/lib/formatters/market-formatters';
import { EvidenceCitationBadge } from './EvidenceCitationBadge';
import { InvalidationMonitor } from './InvalidationMonitor';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, AlertOctagon, GitBranch } from 'lucide-react';

interface ScenarioMatrixProps {
  scenarios: StressScenarioV1[];
  conditions?: InvalidationConditionV1[];
  onSelectEvidence?: (evidenceId: string) => void;
  ledger?: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
  defaultExpanded?: boolean;
}

export function ScenarioMatrix({
  scenarios,
  conditions,
  onSelectEvidence,
  ledger,
  onInspectEvidence,
  defaultExpanded = false,
}: ScenarioMatrixProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleInspect = (ev: EvidenceV1, triggerEl?: HTMLElement) => {
    if (onInspectEvidence) {
      onInspectEvidence(ev, triggerEl);
    } else if (onSelectEvidence) {
      onSelectEvidence(ev.id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Hypothetical Stress Regimes
            </span>
            <span className="text-xs font-mono text-muted-foreground/60">•</span>
            <span className="text-xs font-mono text-foreground font-semibold">
              {scenarios.length} Scenarios Evaluated
            </span>
          </div>
          <p className="text-xs font-sans text-muted-foreground mt-0.5">
            Structured alternatives that would invalidate key axioms. Visualized as: Change → Thesis Consequence.
          </p>
        </div>

        {/* Toggle to expand mechanisms & review triggers */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="inline-flex items-center justify-between sm:justify-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/80 hover:bg-secondary text-xs font-mono text-foreground border border-border/80 transition-colors cursor-pointer select-none self-start sm:self-auto shrink-0"
        >
          <span>{isExpanded ? 'Hide Full Mechanisms' : 'View Mechanisms & Triggers'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Concise 2-Scenario Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((sc) => {
          const plausibilityClass = getPlausibilityStyle(sc.plausibility);

          return (
            <div
              key={sc.id}
              className="border border-border/80 bg-card rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-xs"
            >
              <div className="space-y-3">
                {/* Plausibility and scenario type */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className={`px-2 py-0.5 rounded border uppercase font-medium ${plausibilityClass}`}>
                    {sc.plausibility} Plausibility
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono uppercase">
                    {sc.scenarioType.replace(/_/g, ' ')}
                  </Badge>
                </div>

                {/* Scenario Title */}
                <h4 className="text-sm font-bold text-foreground font-sans tracking-tight">
                  {sc.name}
                </h4>

                {/* Clear visual relationship: Hypothetical Change -> Consequence */}
                <div className="space-y-2">
                  <div className="text-xs font-sans text-foreground/85 leading-relaxed">
                    <span className="font-semibold text-foreground/95">Hypothetical Change: </span>
                    {sc.description}
                  </div>

                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/25 space-y-1">
                    <div className="text-[10px] font-mono uppercase font-bold text-rose-400 flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3 shrink-0" />
                      <span>↳ Potential Thesis Consequence</span>
                    </div>
                    <p className="text-xs font-sans text-rose-200/90 leading-relaxed font-medium">
                      {sc.consequenceForThesis}
                    </p>
                  </div>
                </div>

                {/* Details revealed on demand: Transmission Mechanism & Uncertainties */}
                {isExpanded && (
                  <div className="pt-2 border-t border-border/40 space-y-2.5 animate-in fade-in-0 duration-150 text-xs">
                    <div className="space-y-1">
                      <div className="font-mono text-muted-foreground uppercase text-[10px] flex items-center gap-1 font-semibold">
                        <GitBranch className="w-3 h-3 text-sky-400" />
                        <span>Transmission Mechanism:</span>
                      </div>
                      <div className="text-muted-foreground font-sans bg-secondary/50 p-2.5 rounded-md border border-border/50 text-[11px] leading-relaxed">
                        {sc.transmissionMechanism}
                      </div>
                    </div>

                    {sc.uncertainties.length > 0 && (
                      <div className="space-y-1">
                        <div className="font-mono text-muted-foreground uppercase text-[10px] font-semibold">
                          Explicit Uncertainties:
                        </div>
                        <ul className="list-disc pl-4 text-muted-foreground font-sans text-[11px] space-y-0.5">
                          {sc.uncertainties.map((u, i) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Context evidence citations */}
              {sc.relevantEvidenceIds.length > 0 && (
                <div className="pt-2.5 border-t border-border/40 flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">Context:</span>
                  {sc.relevantEvidenceIds.map((evId) => (
                    <EvidenceCitationBadge
                      key={evId}
                      evidenceId={evId}
                      ledger={ledger}
                      onInspect={handleInspect}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progressively Disclosed Thesis Review Conditions */}
      {isExpanded && conditions && conditions.length > 0 && (
        <div className="pt-3 border-t border-border/40 animate-in fade-in-0 duration-150">
          <InvalidationMonitor
            conditions={conditions}
            onSelectEvidence={onSelectEvidence}
            ledger={ledger}
            onInspectEvidence={onInspectEvidence}
          />
        </div>
      )}
    </div>
  );
}
