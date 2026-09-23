'use client';

import React from 'react';
import type { ContradictionPointV1 } from '@/core/contracts/brief';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { EvidenceCitationBadge } from './EvidenceCitationBadge';
import { AlertTriangle } from 'lucide-react';

interface ContradictionAlertsProps {
  contradictions: ContradictionPointV1[];
  onSelectEvidence?: (evidenceId: string) => void;
  ledger?: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
}

export function ContradictionAlerts({
  contradictions,
  onSelectEvidence,
  ledger,
  onInspectEvidence,
}: ContradictionAlertsProps) {
  const handleInspect = (ev: EvidenceV1, triggerEl?: HTMLElement) => {
    if (onInspectEvidence) {
      onInspectEvidence(ev, triggerEl);
    } else if (onSelectEvidence) {
      onSelectEvidence(ev.id);
    }
  };

  if (contradictions.length === 0) {
    return (
      <div className="p-3.5 rounded-xl bg-secondary/50 border border-border/60 text-xs font-mono text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>No direct empirical contradictions identified in the Evidence Ledger.</span>
        </div>
        <span className="text-[11px] text-muted-foreground/80">
          Adversarial challenges & stress regimes remain evaluated below.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <h4 className="text-sm sm:text-base font-semibold text-rose-400 font-sans tracking-tight">
            Empirical Contradictions Identified ({contradictions.length})
          </h4>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          Contradicting observations in ledger
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {contradictions.map((c) => {
          const severityBadge =
            c.severity === 'CRITICAL'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
              : c.severity === 'SIGNIFICANT'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium'
                : 'bg-secondary text-foreground border-border/80';

          return (
            <div
              key={c.id}
              className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/30 space-y-2.5 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded border text-[10px] uppercase ${severityBadge}`}>
                    {c.severity} Contradiction
                  </span>
                  <span className="text-muted-foreground">Target:</span>
                  <span className="text-foreground font-medium">{c.targetType}</span>
                </div>

                <EvidenceCitationBadge
                  evidenceId={c.contradictingEvidenceId}
                  ledger={ledger}
                  onInspect={handleInspect}
                />
              </div>

              <div className="text-sm font-semibold text-foreground font-sans leading-snug">
                {c.statement}
              </div>

              <div className="text-xs text-foreground/85 font-sans leading-relaxed bg-secondary/60 p-3 rounded-lg border border-border/60">
                {c.explanation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
