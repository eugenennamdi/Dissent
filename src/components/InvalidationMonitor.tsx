'use client';

import React from 'react';
import type { InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { getInvalidationUrgencyLabel } from '@/lib/formatters/market-formatters';
import { EvidenceCitationBadge } from './EvidenceCitationBadge';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';

interface InvalidationMonitorProps {
  conditions: InvalidationConditionV1[];
  onSelectEvidence?: (evidenceId: string) => void;
  ledger?: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
}

export function InvalidationMonitor({
  conditions,
  onSelectEvidence,
  ledger,
  onInspectEvidence,
}: InvalidationMonitorProps) {
  const handleInspect = (ev: EvidenceV1, triggerEl?: HTMLElement) => {
    if (onInspectEvidence) {
      onInspectEvidence(ev, triggerEl);
    } else if (onSelectEvidence) {
      onSelectEvidence(ev.id);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Thesis Review Triggers
            </span>
            <span className="text-xs font-mono text-muted-foreground/60">•</span>
            <span className="text-xs font-mono text-foreground font-semibold">
              {conditions.length} {conditions.length === 1 ? 'Condition' : 'Conditions'} Monitored
            </span>
          </div>
          <p className="text-[11px] font-sans text-muted-foreground">
            Observable developments that would prompt thesis review. Not automated stop-losses or trade execution calls.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {conditions.map((item) => {
          const { label: urgencyLabel, badgeStyle } = getInvalidationUrgencyLabel(item.urgency);

          return (
            <div
              key={item.id}
              className="border border-border/80 bg-card rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-xs"
            >
              <div className="space-y-2.5">
                {/* Type and urgency badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className={`px-2 py-0.5 rounded border uppercase font-medium ${badgeStyle}`}>
                    {urgencyLabel}
                  </span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono uppercase">
                    {item.type}
                  </Badge>
                </div>

                {/* Primary statement */}
                <div className="text-sm font-semibold text-foreground font-sans leading-snug">
                  {item.statement}
                </div>

                {/* Metric or Event Details */}
                {item.type === 'QUANTITATIVE' ? (
                  <div className="space-y-1.5 p-3 rounded-lg bg-secondary/60 border border-border/60 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Metric:</span>
                      <span className="text-foreground font-medium">{item.targetMetric}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trigger Threshold:</span>
                      <span className="text-rose-400 font-bold tabular-nums">{item.triggerThreshold}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Timeframe:</span>
                      <span className="text-foreground">{item.timeframe}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5">
                      <span className="text-muted-foreground">Observation Source:</span>
                      <span className="text-foreground/90">{item.observableDataSource}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 p-3 rounded-lg bg-secondary/60 border border-border/60 text-xs font-sans">
                    <div>
                      <span className="text-muted-foreground font-mono text-[10px] uppercase block mb-1 font-semibold">
                        Observable Event:
                      </span>
                      <span className="text-foreground/95 leading-relaxed">{item.observableEvent}</span>
                    </div>
                    <div className="pt-2 border-t border-border/40 flex justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Verification Source:</span>
                      <span className="text-foreground/90">{item.verificationSource}</span>
                    </div>
                    {item.expectedWindow && (
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Expected Window:</span>
                        <span className="text-foreground">{item.expectedWindow}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Linked Evidence */}
              {item.relevantEvidenceIds && item.relevantEvidenceIds.length > 0 && (
                <div className="pt-2.5 border-t border-border/40 flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">Baseline:</span>
                  {item.relevantEvidenceIds.map((id) => (
                    <EvidenceCitationBadge
                      key={id}
                      evidenceId={id}
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
    </div>
  );
}
