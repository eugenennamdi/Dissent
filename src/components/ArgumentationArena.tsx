'use client';

import * as React from 'react';
import { useState } from 'react';
import type { ArgumentV1, ArgumentPointV1 } from '@/core/contracts/argument';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EvidenceCitationBadge } from './EvidenceCitationBadge';
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface ArgumentationArenaProps {
  advocateCase: ArgumentV1;
  dissentCase: ArgumentV1;
  onSelectEvidence?: (evidenceId: string) => void;
  ledger?: EvidenceLedgerV1;
  onInspectEvidence?: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
  defaultExpanded?: boolean;
}

export function ArgumentationArena({
  advocateCase,
  dissentCase,
  onSelectEvidence,
  ledger,
  onInspectEvidence,
  defaultExpanded = false,
}: ArgumentationArenaProps) {
  const [showFullDossier, setShowFullDossier] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'BOTH' | 'ADVOCATE' | 'DISSENTER'>('BOTH');

  // Handle evidence inspection with fallback to onSelectEvidence if needed
  const handleInspect = (evidence: EvidenceV1, triggerEl?: HTMLElement) => {
    if (onInspectEvidence) {
      onInspectEvidence(evidence, triggerEl);
    } else if (onSelectEvidence) {
      onSelectEvidence(evidence.id);
    }
  };

  // Identify principal arguments (first PRIMARY point or fallback to first point)
  const principalAdvocate =
    advocateCase.points.find((p) => p.weight === 'PRIMARY') ?? advocateCase.points[0];
  const principalDissent =
    dissentCase.points.find((p) => p.weight === 'PRIMARY') ?? dissentCase.points[0];

  // Total points
  const totalPoints = advocateCase.points.length + dissentCase.points.length;

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">
              Adversarial Debate
            </span>
            <span className="text-xs font-mono text-muted-foreground/60">•</span>
            <span className="text-xs font-mono text-foreground font-semibold">
              Advocate vs. Dissenter
            </span>
          </div>
          <p className="text-xs font-sans text-muted-foreground">
            Principal cases juxtaposed on the surface; complete 10-point dossier accessible below.
          </p>
        </div>

        {/* Toggle to expand full dossier */}
        <button
          type="button"
          onClick={() => setShowFullDossier(!showFullDossier)}
          aria-expanded={showFullDossier}
          className="inline-flex items-center justify-between sm:justify-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/80 hover:bg-secondary text-xs font-mono text-foreground border border-border/80 transition-colors cursor-pointer select-none self-start sm:self-auto shrink-0"
        >
          <span>{showFullDossier ? 'Hide Full Debate' : `View Full Debate (${totalPoints} Points)`}</span>
          {showFullDossier ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* 1. PRINCIPAL DEBATE CONFRONTATION (Default Concise View) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Principal Advocate Case */}
        <div className="p-4 sm:p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10 space-y-3.5 flex flex-col justify-between shadow-xs">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Advocate Desk · Principal Argument
                </span>
              </div>
              {principalAdvocate && (
                <Badge variant="supporting" className="text-[10px] py-0 px-1.5 font-mono uppercase">
                  {principalAdvocate.weight}
                </Badge>
              )}
            </div>

            {principalAdvocate ? (
              <div className="space-y-1.5">
                <h4 className="text-sm sm:text-base font-bold text-foreground font-sans tracking-tight">
                  {principalAdvocate.title}
                </h4>
                <p className="text-xs sm:text-sm text-foreground/85 font-sans leading-relaxed">
                  {principalAdvocate.reasoning}
                </p>
              </div>
            ) : (
              <p className="text-xs font-sans text-muted-foreground">{advocateCase.summary}</p>
            )}
          </div>

          {/* Evidence citations for principal advocate point */}
          {principalAdvocate?.evidenceIds && principalAdvocate.evidenceIds.length > 0 && (
            <div className="pt-2.5 border-t border-emerald-500/20 flex flex-wrap items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Evidence:</span>
              {principalAdvocate.evidenceIds.map((evId) => (
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

        {/* Principal Dissenter Counterargument */}
        <div className="p-4 sm:p-5 rounded-xl border border-amber-500/25 bg-amber-950/10 space-y-3.5 flex flex-col justify-between shadow-xs">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                  The Dissent · Principal Counterargument
                </span>
              </div>
              {principalDissent && (
                <Badge variant="dissent" className="text-[10px] py-0 px-1.5 font-mono uppercase">
                  {principalDissent.weight}
                </Badge>
              )}
            </div>

            {principalDissent ? (
              <div className="space-y-1.5">
                <h4 className="text-sm sm:text-base font-bold text-foreground font-sans tracking-tight">
                  {principalDissent.title}
                </h4>
                <p className="text-xs sm:text-sm text-foreground/85 font-sans leading-relaxed">
                  {principalDissent.reasoning}
                </p>
              </div>
            ) : (
              <p className="text-xs font-sans text-muted-foreground">{dissentCase.summary}</p>
            )}
          </div>

          {/* Evidence citations for principal dissenter point */}
          {principalDissent?.evidenceIds && principalDissent.evidenceIds.length > 0 && (
            <div className="pt-2.5 border-t border-amber-500/20 flex flex-wrap items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground text-[10px] uppercase font-semibold">Evidence:</span>
              {principalDissent.evidenceIds.map((evId) => (
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
      </div>

      {/* 2. PROGRESSIVELY DISCLOSED FULL DEBATE DOSSIER */}
      {showFullDossier && (
        <div className="pt-3 border-t border-border/40 space-y-4 animate-in fade-in-0 duration-150">
          {/* Tabs for detailed inspection */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">
              Complete Structured Arguments ({totalPoints} total):
            </span>
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as 'BOTH' | 'ADVOCATE' | 'DISSENTER')}
              className="w-auto"
            >
              <TabsList className="bg-secondary/80 border border-border/80 p-0.5 h-8">
                <TabsTrigger value="BOTH" className="text-xs px-2.5 py-1">
                  Comparative
                </TabsTrigger>
                <TabsTrigger value="ADVOCATE" className="text-xs px-2.5 py-1">
                  Advocate Desk ({advocateCase.points.length})
                </TabsTrigger>
                <TabsTrigger value="DISSENTER" className="text-xs px-2.5 py-1">
                  The Dissent ({dissentCase.points.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div
            className={`grid gap-5 ${
              activeTab === 'BOTH' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {/* FULL ADVOCATE POINTS */}
            {(activeTab === 'BOTH' || activeTab === 'ADVOCATE') && (
              <Card className="border-emerald-500/25 bg-card shadow-sm space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                    Advocate Desk · Full Supporting Case
                  </span>
                  <p className="text-xs font-sans text-foreground/90 bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/20 leading-relaxed">
                    {advocateCase.summary}
                  </p>
                </div>

                <div className="space-y-3">
                  {advocateCase.points.map((pt) => (
                    <PointCard
                      key={pt.id}
                      point={pt}
                      tone="SUPPORTING"
                      ledger={ledger}
                      onInspect={handleInspect}
                    />
                  ))}
                </div>

                {/* Advocate counter-weights */}
                {advocateCase.risksOrCounterweightsConsidered.length > 0 && (
                  <div className="pt-3 border-t border-border/40 space-y-1 text-xs">
                    <div className="text-[11px] font-mono uppercase text-muted-foreground flex items-center gap-1.5 font-semibold">
                      <Info className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />
                      <span>Self-Acknowledged Friction:</span>
                    </div>
                    <ul className="text-muted-foreground font-sans list-disc pl-5 space-y-1 text-[11px]">
                      {advocateCase.risksOrCounterweightsConsidered.map((risk, idx) => (
                        <li key={idx} className="leading-snug">{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* FULL DISSENTER POINTS */}
            {(activeTab === 'BOTH' || activeTab === 'DISSENTER') && (
              <Card className="border-amber-500/25 bg-card shadow-sm space-y-4 p-4 sm:p-5">
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                    The Dissent · Full Adversarial Counter-Case
                  </span>
                  <p className="text-xs font-sans text-foreground/90 bg-amber-950/20 p-3 rounded-lg border border-amber-500/20 leading-relaxed">
                    {dissentCase.summary}
                  </p>
                </div>

                <div className="space-y-3">
                  {dissentCase.points.map((pt) => (
                    <PointCard
                      key={pt.id}
                      point={pt}
                      tone="CONTRADICTING"
                      ledger={ledger}
                      onInspect={handleInspect}
                    />
                  ))}
                </div>

                {/* Dissenter caveats */}
                {dissentCase.risksOrCounterweightsConsidered.length > 0 && (
                  <div className="pt-3 border-t border-border/40 space-y-1 text-xs">
                    <div className="text-[11px] font-mono uppercase text-muted-foreground flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/80 shrink-0" />
                      <span>Analytical Nuance & Caveats:</span>
                    </div>
                    <ul className="text-muted-foreground font-sans list-disc pl-5 space-y-1 text-[11px]">
                      {dissentCase.risksOrCounterweightsConsidered.map((risk, idx) => (
                        <li key={idx} className="leading-snug">{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PointCard({
  point,
  tone,
  ledger,
  onInspect,
}: {
  point: ArgumentPointV1;
  tone: 'SUPPORTING' | 'CONTRADICTING';
  ledger?: EvidenceLedgerV1;
  onInspect: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
}) {
  const isAdvocate = tone === 'SUPPORTING';

  return (
    <div className="p-3.5 rounded-lg bg-secondary/50 border border-border/70 shadow-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-xs sm:text-sm font-bold text-foreground font-sans leading-snug">
          {point.title}
        </h5>
        <Badge
          variant={point.weight === 'PRIMARY' ? (isAdvocate ? 'supporting' : 'contradicting') : 'neutral'}
          className="text-[10px] py-0 px-1.5 font-mono uppercase shrink-0"
        >
          {point.weight}
        </Badge>
      </div>

      <p className="text-xs text-foreground/85 font-sans leading-relaxed">
        {point.reasoning}
      </p>

      {/* Semantic Evidence Citations */}
      {point.evidenceIds && point.evidenceIds.length > 0 && (
        <div className="pt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-mono border-t border-border/30 mt-1">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">Evidence:</span>
          {point.evidenceIds.map((evId) => (
            <EvidenceCitationBadge
              key={evId}
              evidenceId={evId}
              ledger={ledger}
              onInspect={onInspect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
