'use client';

import * as React from 'react';
import { useState } from 'react';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import {
  formatUtcDateTime,
  getEvidenceFreshness,
  getSafeExternalUrl,
} from '@/lib/formatters/market-formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Database,
  Calendar,
  ExternalLink,
  Layers,
  Copy,
  Check,
  Clock,
  Fingerprint,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';

interface EvidenceInspectorProps {
  ledger: EvidenceLedgerV1;
  selectedEvidenceId: string | null;
  onClearSelectedEvidence: () => void;
}

export function EvidenceInspector({
  ledger,
  selectedEvidenceId,
  onClearSelectedEvidence,
}: EvidenceInspectorProps) {
  const [stanceFilter, setStanceFilter] = useState<'ALL' | 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL'>('ALL');
  const [activeEvidenceModal, setActiveEvidenceModal] = useState<EvidenceV1 | null>(null);

  const items = ledger.items;

  const filteredItems = items.filter((item) => {
    if (stanceFilter !== 'ALL' && item.stance !== stanceFilter) return false;
    return true;
  });

  const handleOpenDetail = (item: EvidenceV1) => {
    setActiveEvidenceModal(item);
  };

  const selectedItem = selectedEvidenceId ? items.find((i) => i.id === selectedEvidenceId) : null;
  const currentModalItem = activeEvidenceModal ?? selectedItem;

  const handleCloseModal = () => {
    setActiveEvidenceModal(null);
    onClearSelectedEvidence();
  };

  return (
    <div id="evidence-ledger-section" className="space-y-4">
      {/* Section Header with Ledger Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-400" />
            <h3 className="text-lg sm:text-xl font-semibold text-foreground font-sans tracking-tight">
              Evidence Ledger & Provenance
            </h3>
            <Badge variant="outline" className="text-xs font-mono font-normal">
              {ledger.summary.totalCount} Immutable Observations
            </Badge>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
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

        <div className="text-muted-foreground text-[11px] flex items-center gap-1.5">
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
              onClick={() => handleOpenDetail(item)}
              className={`p-4 transition-all cursor-pointer flex flex-col justify-between space-y-3 active:scale-[0.99] select-none ${
                isSelected
                  ? 'border-ring ring-1 ring-ring bg-secondary/90 shadow-md'
                  : 'border-border/80 bg-card hover:border-muted-foreground/40 hover:bg-card/90 shadow-xs'
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
                <div className="space-y-1 text-[11px] font-mono text-muted-foreground bg-background/90 p-2.5 rounded-md border border-border/60 shadow-inner">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/80">Market / Sym:</span>
                    <span className="text-foreground font-medium">
                      {item.observation.market} ({item.observation.providerSymbol})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/80">Obs Type:</span>
                    <span className="text-foreground/90">{item.observation.type}</span>
                  </div>
                  {item.value !== undefined && (
                    <div className="flex justify-between border-t border-border/40 pt-1 mt-1">
                      <span className="text-muted-foreground/80">Observed Value:</span>
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
                <span className="text-sky-400/90 group-hover:text-sky-300">Inspect provenance →</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Detailed Modal for In-Depth Provenance Inspection */}
      <Dialog open={!!currentModalItem} onOpenChange={(open) => !open && handleCloseModal()}>
        {currentModalItem && (
          <EvidenceDetailDialogContent
            evidence={currentModalItem}
            onClose={handleCloseModal}
          />
        )}
      </Dialog>
    </div>
  );
}

function EvidenceDetailDialogContent({
  evidence,
  onClose,
}: {
  evidence: EvidenceV1;
  onClose: () => void;
}) {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const freshness = getEvidenceFreshness(evidence);
  const safeExternalUrl = getSafeExternalUrl(evidence.provenance.endpointOrLocator);
  const isDerived = evidence.nature === 'DERIVED';

  const handleCopyRaw = async () => {
    if (!evidence.provenance.rawSnapshot) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(evidence.provenance.rawSnapshot, null, 2));
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch {
      // non-fatal
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
      {/* Header */}
      <DialogHeader className="text-left space-y-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2 text-xs font-mono">
          <Badge variant="highlight" className="gap-1 px-2 py-0.5 text-xs">
            <Fingerprint className="w-3.5 h-3.5 text-sky-400" />
            <span>Immutable Observation</span>
          </Badge>
          <span className="text-muted-foreground/60">•</span>
          <span className="text-muted-foreground font-mono text-[11px]">#{evidence.id}</span>
        </div>
        <DialogTitle className="text-base sm:text-lg font-semibold text-foreground font-sans leading-snug">
          {evidence.claim}
        </DialogTitle>
        <DialogDescription className="text-xs font-mono text-muted-foreground">
          Cryptographically referenced market observation ingested directly from Bitget exchange data.
        </DialogDescription>
      </DialogHeader>

      {/* Categorization & Stance Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="p-2.5 rounded-lg bg-background/90 border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase">Stance</div>
          <div className="mt-1">
            <Badge
              variant={
                evidence.stance === 'SUPPORTING'
                  ? 'supporting'
                  : evidence.stance === 'CONTRADICTING'
                    ? 'contradicting'
                    : 'neutral'
              }
              className="text-xs py-0 px-1.5 font-mono uppercase"
            >
              {evidence.stance}
            </Badge>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background/90 border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase">Category</div>
          <div className="text-foreground font-semibold mt-1">{evidence.category}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-background/90 border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase">Nature</div>
          <div className="text-foreground font-semibold mt-1">{evidence.nature}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-background/90 border border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase">Freshness</div>
          <div className="text-foreground font-semibold mt-1">{freshness.level}</div>
        </div>
      </div>

      {/* Observation Details */}
      <div className="space-y-2">
        <div className="text-xs font-mono uppercase text-muted-foreground font-medium">
          Market Observation Details
        </div>
        <div className="p-3.5 rounded-lg bg-background/90 border border-border/60 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Target Market:</span>
            <span className="text-foreground font-semibold">{evidence.observation.market}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Instrument Type:</span>
            <span className="text-foreground">{evidence.observation.instrumentType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provider Symbol:</span>
            <span className="text-foreground">{evidence.observation.providerSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Observation Type:</span>
            <span className="text-foreground">{evidence.observation.type}</span>
          </div>
          {evidence.observation.interval && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interval:</span>
              <span className="text-foreground">{evidence.observation.interval}</span>
            </div>
          )}
          {evidence.value !== undefined && (
            <div className="flex justify-between border-t border-border/40 pt-2 mt-2">
              <span className="text-muted-foreground">Canonical Value:</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {evidence.value} {evidence.unit ?? ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Provenance & Timestamps (Strict Separation) */}
      <div className="space-y-2">
        <div className="text-xs font-mono uppercase text-muted-foreground font-medium">
          Provenance Lineage & Ingestion Timestamps
        </div>
        <div className="p-3.5 rounded-lg bg-background/90 border border-border/60 space-y-2 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source Provider:</span>
            <span className="text-foreground font-semibold">{evidence.provenance.sourceName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source Type:</span>
            <span className="text-foreground">{evidence.provenance.sourceType}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Endpoint / Locator:</span>
            {safeExternalUrl ? (
              <a
                href={safeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
              >
                <span>{evidence.provenance.endpointOrLocator}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-foreground/90">{evidence.provenance.endpointOrLocator}</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Observed At (Source Event):</span>
            <span className="text-foreground tabular-nums">
              {formatUtcDateTime(evidence.provenance.observedAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Retrieved At (Desk Ingestion):</span>
            <span className="text-foreground tabular-nums">
              {formatUtcDateTime(evidence.provenance.retrievedAt)}
            </span>
          </div>
          {evidence.provenance.contentHash && (
            <div className="flex justify-between items-center border-t border-border/40 pt-2 mt-2">
              <span className="text-muted-foreground">Cryptographic Content Hash:</span>
              <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                {evidence.provenance.contentHash.slice(0, 16)}…
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Derived Evidence Lineage */}
      {isDerived && evidence.derivedFromEvidenceIds.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase text-muted-foreground font-medium">
            Derived Formula Lineage
          </div>
          <div className="p-3 rounded-lg bg-background/90 border border-border/60 text-xs font-mono space-y-1.5">
            <div className="text-muted-foreground">Computed deterministically from source observations:</div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {evidence.derivedFromEvidenceIds.map((parentId) => (
                <Badge
                  key={parentId}
                  variant="outline"
                  className="bg-card text-sky-400 border-border/80"
                >
                  #{parentId.slice(0, 12)}…
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Raw Snapshot (if present) */}
      {evidence.provenance.rawSnapshot && (
        <details className="text-xs font-mono text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors py-1 flex items-center justify-between select-none">
            <span className="flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5" />
              <span>View Raw Ingestion Snapshot</span>
            </span>
          </summary>
          <div className="relative mt-2">
            <pre className="p-3 rounded-lg bg-background/95 border border-border/80 overflow-x-auto text-[11px] text-foreground/90 max-h-48 leading-tight font-mono">
              {JSON.stringify(evidence.provenance.rawSnapshot, null, 2)}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyRaw}
              className="absolute top-2 right-2 h-7 text-[10px] font-mono gap-1"
            >
              {copiedRaw ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-muted-foreground" />
                  <span>Copy JSON</span>
                </>
              )}
            </Button>
          </div>
        </details>
      )}

      <div className="pt-2 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="text-xs font-mono"
        >
          Close Audit View
        </Button>
      </div>
    </DialogContent>
  );
}
