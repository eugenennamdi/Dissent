'use client';

import React, { useState } from 'react';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { getAssumptionStatusStyle } from '@/lib/formatters/market-formatters';
import { EvidenceCitationBadge } from './EvidenceCitationBadge';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChevronDown, ChevronUp, Layers } from 'lucide-react';

interface AssumptionStressLedgerProps {
  assumptions: AssumptionV1[];
  onSelectEvidence?: (evidenceId: string) => void;
  ledger?: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
  defaultExpanded?: boolean;
}

export function AssumptionStressLedger({
  assumptions,
  onSelectEvidence,
  ledger,
  onInspectEvidence,
  defaultExpanded = false,
}: AssumptionStressLedgerProps) {
  const [filter, setFilter] = useState<'ALL' | 'EXPLICIT' | 'INFERRED'>('ALL');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Exact categorical counts
  const countSupported = assumptions.filter((a) => a.status === 'SUPPORTED').length;
  const countQuestioned = assumptions.filter((a) => a.status === 'QUESTIONED').length;
  const countContradicted = assumptions.filter((a) => a.status === 'CONTRADICTED').length;
  const countInsufficient = assumptions.filter(
    (a) => a.status === 'INSUFFICIENT_EVIDENCE'
  ).length;
  const countUntested = assumptions.filter((a) => a.status === 'UNTESTED').length;

  const filtered = assumptions.filter((item) => {
    if (filter === 'ALL') return true;
    return item.type === filter;
  });

  const handleInspect = (ev: EvidenceV1, triggerEl?: HTMLElement) => {
    if (onInspectEvidence) {
      onInspectEvidence(ev, triggerEl);
    } else if (onSelectEvidence) {
      onSelectEvidence(ev.id);
    }
  };

  return (
    <div className="space-y-3">
      {/* Compact Categorical Status Representation */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-border/80 bg-card/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Axiom Reality Check
            </span>
            <span className="text-xs font-mono text-muted-foreground/60">•</span>
            <span className="text-xs font-mono text-foreground font-semibold">
              {assumptions.length} Assumptions Evaluated
            </span>
          </div>

          {/* Categorical status summary pills (strictly discrete tallies, no invented scores) */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-md bg-emerald-950/30 text-emerald-300 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-semibold tabular-nums">{countSupported}</span> Supported
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-md bg-amber-950/30 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="font-semibold tabular-nums">{countQuestioned}</span> Questioned
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-md bg-rose-950/30 text-rose-300 border border-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span className="font-semibold tabular-nums">{countContradicted}</span> Contradicted
            </span>
            {countInsufficient > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-md bg-purple-950/30 text-purple-300 border border-purple-500/30">
                <span className="font-semibold tabular-nums">{countInsufficient}</span> Insufficient Evidence
              </span>
            )}
            {countUntested > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/80">
                <span className="font-semibold tabular-nums">{countUntested}</span> Untested
              </span>
            )}
          </div>
        </div>

        {/* Toggle button to inspect individual assumptions on demand */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="inline-flex items-center justify-between sm:justify-center gap-2 px-3 py-1.5 rounded-md bg-secondary/80 hover:bg-secondary text-xs font-mono text-foreground border border-border/80 transition-colors cursor-pointer select-none shrink-0"
        >
          <span>{isExpanded ? 'Hide Details' : 'Inspect Assumptions'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>

      {/* Progressively Disclosed Detail Grid */}
      {isExpanded && (
        <div className="space-y-3 pt-2 animate-in fade-in-0 duration-150">
          {/* Sub-filter tabs */}
          <div className="flex items-center justify-between gap-2 text-xs font-mono">
            <span className="text-muted-foreground text-[11px]">
              Empirical market tests for individual axioms:
            </span>
            <div className="flex items-center p-0.5 rounded-md bg-secondary/80 border border-border/80">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                  filter === 'ALL' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({assumptions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('EXPLICIT')}
                className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                  filter === 'EXPLICIT' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Explicit
              </button>
              <button
                type="button"
                onClick={() => setFilter('INFERRED')}
                className={`px-2 py-0.5 rounded text-xs transition-colors cursor-pointer ${
                  filter === 'INFERRED' ? 'bg-card text-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Inferred
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filtered.map((item) => {
              const statusStyle = getAssumptionStatusStyle(item.status);

              return (
                <div
                  key={item.id}
                  className="border border-border/80 bg-card rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-xs"
                >
                  <div className="space-y-2.5">
                    {/* Status and category tags */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded border uppercase font-medium ${statusStyle.bg}`}>
                          {statusStyle.label}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                          {item.type}
                        </Badge>
                      </div>

                      <span className="text-muted-foreground uppercase text-[10px]">{item.category}</span>
                    </div>

                    {/* Core assumption claim */}
                    <div className="text-sm font-semibold text-foreground font-sans leading-snug">
                      {item.claim}
                    </div>

                    {/* Challenge scenario */}
                    <div className="space-y-1 text-xs">
                      <div className="font-mono text-muted-foreground uppercase text-[10px]">
                        Empirical Challenge:
                      </div>
                      <div className="text-foreground/90 font-sans bg-secondary/60 p-2.5 rounded-md border border-border/60 leading-relaxed">
                        {item.challenge}
                      </div>
                    </div>

                    {/* Invalidation condition */}
                    <div className="space-y-1 text-xs">
                      <div className="font-mono text-muted-foreground uppercase text-[10px]">
                        Invalidation Trigger:
                      </div>
                      <div className="text-muted-foreground font-sans bg-secondary/40 p-2.5 rounded-md border border-border/40 text-[11px] leading-relaxed">
                        {item.invalidationCondition}
                      </div>
                    </div>
                  </div>

                  {/* Grounded Evidence citations */}
                  <div className="pt-2.5 border-t border-border/40 space-y-1.5 text-xs font-mono">
                    {item.supportingEvidenceIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-emerald-400 text-[10px] uppercase font-semibold">Supporting:</span>
                        {item.supportingEvidenceIds.map((id) => (
                          <EvidenceCitationBadge
                            key={id}
                            evidenceId={id}
                            ledger={ledger}
                            onInspect={handleInspect}
                          />
                        ))}
                      </div>
                    )}

                    {item.opposingEvidenceIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-amber-400 text-[10px] uppercase font-semibold">Opposing:</span>
                        {item.opposingEvidenceIds.map((id) => (
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
