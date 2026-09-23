'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import type { AssumptionV1, AssumptionStatusV1 } from '@/core/contracts/assumption';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface AssumptionDistributionProps {
  assumptions: AssumptionV1[];
  evidenceLedger?: EvidenceLedgerV1 | null;
  onInspectEvidence?: (evidence: EvidenceV1) => void;
  className?: string;
}

interface StatusMeta {
  status: AssumptionStatusV1;
  label: string;
  dotColor: string;
  barColor: string;
  activeBorder: string;
  activeBg: string;
}

const STATUS_METAS: StatusMeta[] = [
  {
    status: 'SUPPORTED',
    label: 'Supported',
    dotColor: 'bg-emerald-600',
    barColor: 'bg-emerald-600',
    activeBorder: 'border-emerald-300',
    activeBg: 'bg-emerald-50 text-emerald-800',
  },
  {
    status: 'QUESTIONED',
    label: 'Questioned',
    dotColor: 'bg-amber-600',
    barColor: 'bg-amber-600',
    activeBorder: 'border-amber-300',
    activeBg: 'bg-amber-50 text-amber-800',
  },
  {
    status: 'UNTESTED',
    label: 'Untested',
    dotColor: 'bg-stone-400',
    barColor: 'bg-stone-400',
    activeBorder: 'border-stone-300',
    activeBg: 'bg-stone-100 text-stone-800',
  },
  {
    status: 'CONTRADICTED',
    label: 'Contradicted',
    dotColor: 'bg-rose-600',
    barColor: 'bg-rose-600',
    activeBorder: 'border-rose-300',
    activeBg: 'bg-rose-50 text-rose-800',
  },
  {
    status: 'INSUFFICIENT_EVIDENCE',
    label: 'Insufficient Evidence',
    dotColor: 'bg-purple-600',
    barColor: 'bg-purple-600',
    activeBorder: 'border-purple-300',
    activeBg: 'bg-purple-50 text-purple-800',
  },
];

export function AssumptionDistribution({
  assumptions,
  evidenceLedger,
  onInspectEvidence,
  className = '',
}: AssumptionDistributionProps) {
  const totalCount = assumptions.length;

  const statusBuckets = useMemo(() => {
    const buckets: Record<AssumptionStatusV1, AssumptionV1[]> = {
      SUPPORTED: [],
      QUESTIONED: [],
      UNTESTED: [],
      CONTRADICTED: [],
      INSUFFICIENT_EVIDENCE: [],
    };
    for (const a of assumptions) {
      if (buckets[a.status]) {
        buckets[a.status].push(a);
      } else {
        buckets.UNTESTED.push(a);
      }
    }
    return buckets;
  }, [assumptions]);

  // Default selected status: prefer QUESTIONED, then first non-zero status
  const defaultStatus = useMemo<AssumptionStatusV1>(() => {
    if (statusBuckets.QUESTIONED.length > 0) return 'QUESTIONED';
    if (statusBuckets.SUPPORTED.length > 0) return 'SUPPORTED';
    if (statusBuckets.CONTRADICTED.length > 0) return 'CONTRADICTED';
    if (statusBuckets.UNTESTED.length > 0) return 'UNTESTED';
    return 'SUPPORTED';
  }, [statusBuckets]);

  const [selectedStatus, setSelectedStatus] = useState<AssumptionStatusV1>(defaultStatus);

  if (totalCount === 0) {
    return (
      <div className={`p-5 rounded-2xl bg-card border border-border text-xs text-muted-foreground ${className}`}>
        No underlying thesis assumptions recorded.
      </div>
    );
  }

  const selectedList = statusBuckets[selectedStatus] ?? [];
  const selectedMeta = STATUS_METAS.find((m) => m.status === selectedStatus) ?? STATUS_METAS[0]!;

  return (
    <TooltipProvider delayDuration={150}>
      <div className={`p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Assumption Distribution
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Share of {totalCount} assessed assumptions (categorical, not probability)
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full">
            {totalCount} Total
          </span>
        </div>

        {/* Segmented Distribution Bar */}
        <div
          role="region"
          aria-label="Assumption distribution bar"
          className="h-2.5 w-full rounded-full overflow-hidden flex bg-stone-100 border border-stone-200"
        >
          {STATUS_METAS.map((meta) => {
            const count = statusBuckets[meta.status].length;
            if (count === 0) return null;
            const pct = (count / totalCount) * 100;
            const isSelected = selectedStatus === meta.status;

            return (
              <Tooltip key={meta.status}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSelectedStatus(meta.status)}
                    style={{ width: `${pct}%` }}
                    className={`${meta.barColor} h-full transition-opacity cursor-pointer focus:outline-none focus:ring-1 focus:ring-stone-400 ${
                      isSelected ? 'opacity-100 ring-1 ring-stone-900/30' : 'opacity-75 hover:opacity-100'
                    }`}
                    aria-label={`${meta.label}: ${count} of ${totalCount} assumptions (${Math.round(pct)}%)`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-1">
                    <div className="font-semibold text-stone-900">
                      {meta.label}: {count} of {totalCount} ({Math.round(pct)}% share)
                    </div>
                    <div className="text-[11px] text-stone-600">
                      Click to inspect {count} {count === 1 ? 'assumption' : 'assumptions'}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Unified Legend & Category Selector (No duplicate filter rows) */}
        <div
          role="tablist"
          aria-label="Assumption categories"
          className="flex flex-wrap items-center gap-1.5 pt-1"
        >
          {STATUS_METAS.map((meta) => {
            const count = statusBuckets[meta.status].length;
            const isSelected = selectedStatus === meta.status;

            return (
              <button
                key={meta.status}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedStatus(meta.status)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors border ${
                  isSelected
                    ? `${meta.activeBorder} ${meta.activeBg} font-medium shadow-2xs`
                    : 'border-border bg-white text-stone-600 hover:text-foreground hover:bg-stone-50'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                <span>{meta.label}</span>
                <span className="text-[11px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Selected Category Assumptions Detail */}
        <div className="pt-2 border-t border-stone-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground uppercase tracking-wider text-[10px]">
              Inspecting {selectedMeta.label} ({selectedList.length})
            </span>
          </div>

          {selectedList.length === 0 ? (
            <p className="text-xs italic text-muted-foreground py-1">
              No assumptions currently categorized as {selectedMeta.label.toLowerCase()}.
            </p>
          ) : (
            <div className="space-y-3">
              {selectedList.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2 text-xs shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-foreground font-medium leading-snug">
                      &ldquo;{item.claim}&rdquo;
                    </span>
                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700">
                        {item.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-700">
                        {item.category.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {item.challenge && (
                    <div className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                      <span className="font-mono text-stone-500">Challenge: </span>
                      <span className="italic text-stone-700">{item.challenge}</span>
                    </div>
                  )}

                  {item.invalidationCondition && (
                    <div className="text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-mono text-stone-500">Invalidation: </span>
                      <span className="font-mono text-stone-800">{item.invalidationCondition}</span>
                    </div>
                  )}

                  {/* Supporting or Opposing Evidence Citations */}
                  {(item.supportingEvidenceIds.length > 0 || item.opposingEvidenceIds.length > 0) && (
                    <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground">Linked Evidence:</span>
                      {item.supportingEvidenceIds.map((evId) => (
                        <EvidenceCitationBadge
                          key={`sup-${evId}`}
                          evidenceId={evId}
                          ledger={evidenceLedger}
                          onInspect={(ev) => onInspectEvidence?.(ev)}
                        />
                      ))}
                      {item.opposingEvidenceIds.map((evId) => (
                        <EvidenceCitationBadge
                          key={`opp-${evId}`}
                          evidenceId={evId}
                          ledger={evidenceLedger}
                          onInspect={(ev) => onInspectEvidence?.(ev)}
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
    </TooltipProvider>
  );
}
