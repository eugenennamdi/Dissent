'use client';

import * as React from 'react';
import { useState } from 'react';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import {
  formatUtcDateTime,
  getEvidenceFreshness,
} from '@/lib/formatters/market-formatters';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EvidenceDetailDialog } from './EvidenceDetailDialog';
import { Database, Clock } from 'lucide-react';

interface EvidenceInspectorProps {
  ledger: EvidenceLedgerV1;
  selectedEvidenceId: string | null;
  onClearSelectedEvidence: () => void;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
}

export function EvidenceInspector({
  ledger,
  selectedEvidenceId,
  onClearSelectedEvidence,
  onInspectEvidence,
}: EvidenceInspectorProps) {
  const [stanceFilter, setStanceFilter] = useState<'ALL' | 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL'>('ALL');
  const [internalModalItem, setInternalModalItem] = useState<EvidenceV1 | null>(null);

  const items = ledger.items;

  const filteredItems = items.filter((item) => {
    if (stanceFilter !== 'ALL' && item.stance !== stanceFilter) return false;
    return true;
  });

  const handleOpenDetail = (item: EvidenceV1, e: React.MouseEvent<HTMLDivElement>) => {
    if (onInspectEvidence) {
      onInspectEvidence(item, e.currentTarget);
    } else {
      setInternalModalItem(item);
    }
  };

  const selectedItem = selectedEvidenceId ? items.find((i) => i.id === selectedEvidenceId) : null;
  const currentModalItem = internalModalItem ?? selectedItem;

  const handleCloseModal = () => {
    setInternalModalItem(null);
    onClearSelectedEvidence();
  };

  return (
    <div id="evidence-ledger-section" className="space-y-4">
      {/* Section Header with Ledger Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-400" />
            <h3 className="text-base sm:text-lg font-semibold text-foreground font-sans tracking-tight">
              Evidence Ledger & Provenance
            </h3>
            <Badge variant="outline" className="text-xs font-mono font-normal">
              {ledger.summary.totalCount} Immutable Observations
            </Badge>
          </div>
          <p className="text-xs font-sans text-muted-foreground">
            Audit-grade market facts from Bitget with cryptographic lineage and exact timestamps.
          </p>
        </div>

        {/* Ledger Summary Stats */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <Badge variant="supporting" className="px-2.5 py-0.5">
            {ledger.summary.supportingCount} Supporting
          </Badge>
          <Badge variant="contradicting" className="px-2.5 py-0.5">
            {ledger.summary.contradictingCount} Contradicting
          </Badge>
          <Badge variant="neutral" className="px-2.5 py-0.5">
            {ledger.summary.neutralCount} Neutral
          </Badge>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="inline-flex items-center p-0.5 rounded-lg bg-secondary/80 border border-border/80">
          <button
            type="button"
            onClick={() => setStanceFilter('ALL')}
            className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer select-none active:scale-[0.98] ${
              stanceFilter === 'ALL'
                ? 'bg-card text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setStanceFilter('SUPPORTING')}
            className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer select-none active:scale-[0.98] ${
              stanceFilter === 'SUPPORTING'
                ? 'bg-emerald-950/60 text-emerald-300 font-semibold border border-emerald-500/30 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Supporting ({ledger.summary.supportingCount})
          </button>
          <button
            type="button"
            onClick={() => setStanceFilter('CONTRADICTING')}
            className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer select-none active:scale-[0.98] ${
              stanceFilter === 'CONTRADICTING'
                ? 'bg-amber-950/60 text-amber-300 font-semibold border border-amber-500/30 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Contradicting ({ledger.summary.contradictingCount})
          </button>
          <button
            type="button"
            onClick={() => setStanceFilter('NEUTRAL')}
            className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer select-none active:scale-[0.98] ${
              stanceFilter === 'NEUTRAL'
                ? 'bg-card text-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Neutral ({ledger.summary.neutralCount})
          </button>
        </div>

        <div className="text-muted-foreground text-[11px] font-mono flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground/70" />
          <span>Ledger Assembled:</span>
          <span className="text-foreground tabular-nums">{formatUtcDateTime(ledger.assembledAt)}</span>
        </div>
      </div>

      {/* Evidence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredItems.map((item) => {
          const freshness = getEvidenceFreshness(item);
          const isSelected = selectedEvidenceId === item.id;

          return (
            <Card
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={(e) => handleOpenDetail(item, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenDetail(item, e as unknown as React.MouseEvent<HTMLDivElement>);
                }
              }}
              className={`p-4 transition-all cursor-pointer flex flex-col justify-between space-y-3 active:scale-[0.99] select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                isSelected
                  ? 'border-ring ring-1 ring-ring bg-secondary/90 shadow-md'
                  : 'border-border/80 bg-card hover:border-border hover:bg-card/90 shadow-xs'
              }`}
            >
              <div className="space-y-2.5">
                {/* Header row: ID, Stance & Freshness */}
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-sky-400 font-bold">
                    #{item.id.length > 10 ? `${item.id.slice(0, 8)}…` : item.id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={
                        freshness.level === 'REALTIME'
                          ? 'supporting'
                          : freshness.level === 'HISTORICAL'
                            ? 'highlight'
                            : 'neutral'
                      }
                      className="text-[10px] py-0 px-1.5 font-mono uppercase"
                    >
                      {freshness.level}
                    </Badge>
                    <Badge
                      variant={
                        item.stance === 'SUPPORTING'
                          ? 'supporting'
                          : item.stance === 'CONTRADICTING'
                            ? 'contradicting'
                            : 'neutral'
                      }
                      className="text-[10px] py-0 px-1.5 font-mono uppercase"
                    >
                      {item.stance}
                    </Badge>
                  </div>
                </div>

                {/* Claim narrative */}
                <div className="text-xs font-medium text-foreground font-sans line-clamp-2 leading-relaxed">
                  {item.claim}
                </div>

                {/* Observation Meta */}
                <div className="space-y-1 text-[11px] font-mono text-muted-foreground bg-secondary/60 p-2.5 rounded-md border border-border/60 shadow-inner">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Market / Sym:</span>
                    <span className="text-foreground font-medium">
                      {item.observation.market} ({item.observation.providerSymbol})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Obs Type:</span>
                    <span className="text-foreground/90">{item.observation.type}</span>
                  </div>
                  {item.value !== undefined && (
                    <div className="flex justify-between border-t border-border/40 pt-1 mt-1">
                      <span className="text-muted-foreground">Observed Value:</span>
                      <span className="text-emerald-400 font-bold tabular-nums">
                        {item.value} {item.unit ?? ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Provenance Footer */}
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span className="truncate max-w-[140px]">{item.provenance.sourceName}</span>
                <span className="text-sky-400 group-hover:text-sky-300">Inspect provenance →</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Internal dialog if not managed by parent */}
      {!onInspectEvidence && currentModalItem && (
        <EvidenceDetailDialog
          evidence={currentModalItem}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
