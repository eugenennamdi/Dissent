'use client';

import * as React from 'react';
import { useState } from 'react';
import type { InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface ThesisReviewConditionsProps {
  conditions: InvalidationConditionV1[];
  evidenceLedger?: EvidenceLedgerV1 | null;
  onInspectEvidence?: (evidence: EvidenceV1) => void;
  className?: string;
}

function cleanConditionStatement(statement: string): string {
  return statement.replace(/^Thesis invalidation condition:\s*/i, '').trim();
}

function cleanObservableEvent(event?: string): string {
  if (!event) return '';
  return event.replace(/^If observed:\s*/i, '').trim();
}

export function ThesisReviewConditions({
  conditions,
  evidenceLedger,
  onInspectEvidence,
  className = '',
}: ThesisReviewConditionsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (conditions.length === 0) {
    return (
      <div className={`p-5 rounded-2xl bg-card border border-border text-xs text-muted-foreground ${className}`}>
        No thesis review conditions established.
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getUrgencyDisplay = (urgency: string) => {
    switch (urgency) {
      case 'IMMEDIATE_EXIT':
        return {
          label: 'Immediate Review Trigger',
          badgeClass: 'bg-amber-50 text-amber-900 border-amber-200/90 font-medium',
        };
      case 'THESIS_REVIEW':
        return {
          label: 'Thesis Review Trigger',
          badgeClass: 'bg-stone-100 text-stone-800 border-stone-200 font-medium',
        };
      case 'WATCHLIST_ONLY':
      default:
        return {
          label: 'Watchlist Observation',
          badgeClass: 'bg-stone-50 text-stone-700 border-stone-200 font-medium',
        };
    }
  };

  return (
    <div className={`p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            Thesis Review Conditions
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Observable market conditions established to prompt formal reassessment
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded-full">
          {conditions.length} Established
        </span>
      </div>

      {/* Condition Rows */}
      <div className="space-y-3">
        {conditions.map((condition, index) => {
          const isExpanded = expandedId === condition.id;
          const urgency = getUrgencyDisplay(condition.urgency);

          return (
            <div
              key={condition.id}
              className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 text-xs transition-colors hover:border-stone-400 shadow-2xs"
            >
              {/* Row Header & Statement */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground font-bold tracking-wider">
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                    <span className="font-mono text-[10px] text-stone-700 uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200">
                      {condition.type}
                    </span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium ${urgency.badgeClass}`}
                    >
                      {urgency.label}
                    </span>
                  </div>
                  <p className="text-foreground font-medium text-xs sm:text-sm leading-relaxed font-sans pt-0.5">
                    {cleanConditionStatement(condition.statement)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpand(condition.id)}
                  aria-expanded={isExpanded}
                  className="self-start sm:self-auto inline-flex items-center gap-1 text-[11px] font-mono text-stone-600 hover:text-stone-900 transition-colors p-1 rounded hover:bg-stone-100 active:scale-[0.98]"
                >
                  <span>{isExpanded ? 'Less' : 'Details'}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Requirement Specifications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-stone-200 font-mono text-[11px]">
                {condition.type === 'QUANTITATIVE' ? (
                  <>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span className="text-muted-foreground">Target Metric:</span>
                      <span className="text-foreground font-medium">{condition.targetMetric}</span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span className="text-muted-foreground">Threshold:</span>
                      <span className="text-amber-700 font-semibold">{condition.triggerThreshold}</span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span className="text-muted-foreground">Window:</span>
                      <span className="text-foreground">{condition.timeframe}</span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span className="text-muted-foreground">Source:</span>
                      <span className="text-foreground truncate">{condition.observableDataSource}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between sm:justify-start sm:gap-2 col-span-2">
                      <span className="text-muted-foreground">Observable Event:</span>
                      <span className="text-stone-800 font-sans">{cleanObservableEvent(condition.observableEvent)}</span>
                    </div>
                    <div className="flex justify-between sm:justify-start sm:gap-2">
                      <span className="text-muted-foreground">Source:</span>
                      <span className="text-foreground truncate">{condition.verificationSource}</span>
                    </div>
                    {condition.expectedWindow && (
                      <div className="flex justify-between sm:justify-start sm:gap-2">
                        <span className="text-muted-foreground">Expected Window:</span>
                        <span className="text-foreground">{condition.expectedWindow}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Progressive Disclosure: Relevant Evidence */}
              {isExpanded && condition.relevantEvidenceIds.length > 0 && (
                <div className="pt-2 border-t border-stone-200 space-y-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                    Linked Grounding Evidence:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {condition.relevantEvidenceIds.map((evId) => (
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
          );
        })}
      </div>
    </div>
  );
}
