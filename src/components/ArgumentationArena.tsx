'use client';

import * as React from 'react';
import { useState } from 'react';
import type { ArgumentV1, ArgumentPointV1 } from '@/core/contracts/argument';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  FileSearch,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface ArgumentationArenaProps {
  advocateCase: ArgumentV1;
  dissentCase: ArgumentV1;
  onSelectEvidence: (evidenceId: string) => void;
}

export function ArgumentationArena({
  advocateCase,
  dissentCase,
  onSelectEvidence,
}: ArgumentationArenaProps) {
  const [activeTab, setActiveTab] = useState<'BOTH' | 'ADVOCATE' | 'DISSENTER'>('BOTH');

  return (
    <div className="space-y-4">
      {/* Section Header with Mode Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-sky-400" />
            <h3 className="text-lg sm:text-xl font-semibold text-foreground font-sans tracking-tight">
              Adversarial Debate Arena
            </h3>
            <Badge variant="outline" className="text-[11px] font-mono px-2 py-0.5">
              Advocate vs. Dissenter
            </Badge>
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            Empirically grounded arguments from live Bitget evidence. Not a probability score or buy/sell trade call.
          </p>
        </div>

        {/* View toggles using accessible TabsList */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as 'BOTH' | 'ADVOCATE' | 'DISSENTER')}
          className="w-auto self-start sm:self-auto"
        >
          <TabsList className="bg-card/80 border border-border/80 p-0.5 h-8">
            <TabsTrigger value="BOTH" className="text-xs px-2.5 py-1">
              Comparative
            </TabsTrigger>
            <TabsTrigger value="ADVOCATE" className="text-xs px-2.5 py-1">
              Advocate Desk
            </TabsTrigger>
            <TabsTrigger value="DISSENTER" className="text-xs px-2.5 py-1">
              The Dissent
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Arena Grid */}
      <div
        className={`grid gap-5 ${
          activeTab === 'BOTH' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* ADVOCATE DESK */}
        {(activeTab === 'BOTH' || activeTab === 'ADVOCATE') && (
          <Card className="border-emerald-500/25 bg-emerald-950/10 shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <CardHeader className="p-4 sm:p-5 border-b border-emerald-500/20 bg-emerald-950/20 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                    Advocate Case
                  </span>
                  <Badge variant="supporting" className="text-[10px] py-0 px-1.5 font-mono">
                    Supporting
                  </Badge>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {advocateCase.points.length} {advocateCase.points.length === 1 ? 'argument' : 'arguments'}
                </span>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Executive Summary */}
                <div className="text-sm text-foreground/95 font-sans leading-relaxed p-3.5 rounded-lg bg-background/90 border border-emerald-500/20 shadow-inner">
                  {advocateCase.summary}
                </div>

                {/* Structured Points */}
                <div className="space-y-3">
                  <div className="text-xs font-mono uppercase text-muted-foreground flex items-center justify-between">
                    <span>Supporting Evidentiary Points</span>
                  </div>
                  {advocateCase.points.map((point) => (
                    <PointCard
                      key={point.id}
                      point={point}
                      tone="SUPPORTING"
                      onSelectEvidence={onSelectEvidence}
                    />
                  ))}
                </div>
              </CardContent>
            </div>

            {/* Counterweights considered */}
            {advocateCase.risksOrCounterweightsConsidered.length > 0 && (
              <div className="p-4 border-t border-emerald-500/20 bg-card/60 space-y-2">
                <div className="text-[11px] font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/80" />
                  <span>Counter-factors Acknowledged by Advocate:</span>
                </div>
                <ul className="text-xs text-muted-foreground font-mono space-y-1.5 list-disc pl-5">
                  {advocateCase.risksOrCounterweightsConsidered.map((risk, idx) => (
                    <li key={idx} className="leading-snug">{risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* DISSENTER DESK */}
        {(activeTab === 'BOTH' || activeTab === 'DISSENTER') && (
          <Card className="border-amber-500/25 bg-amber-950/10 shadow-sm overflow-hidden flex flex-col justify-between">
            <div>
              <CardHeader className="p-4 sm:p-5 border-b border-amber-500/20 bg-amber-950/20 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                    The Dissent
                  </span>
                  <Badge variant="dissent" className="text-[10px] py-0 px-1.5 font-mono">
                    Adversarial
                  </Badge>
                </div>
                <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {dissentCase.points.length} {dissentCase.points.length === 1 ? 'argument' : 'arguments'}
                </span>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Executive Summary */}
                <div className="text-sm text-foreground/95 font-sans leading-relaxed p-3.5 rounded-lg bg-background/90 border border-amber-500/20 shadow-inner">
                  {dissentCase.summary}
                </div>

                {/* Structured Points */}
                <div className="space-y-3">
                  <div className="text-xs font-mono uppercase text-muted-foreground flex items-center justify-between">
                    <span>Adversarial Counter-Arguments</span>
                  </div>
                  {dissentCase.points.map((point) => (
                    <PointCard
                      key={point.id}
                      point={point}
                      tone="CONTRADICTING"
                      onSelectEvidence={onSelectEvidence}
                    />
                  ))}
                </div>
              </CardContent>
            </div>

            {/* Alternative interpretations / nuances */}
            {dissentCase.risksOrCounterweightsConsidered.length > 0 && (
              <div className="p-4 border-t border-amber-500/20 bg-card/60 space-y-2">
                <div className="text-[11px] font-mono uppercase text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground/80" />
                  <span>Nuance & Alternative Interpretations:</span>
                </div>
                <ul className="text-xs text-muted-foreground font-mono space-y-1.5 list-disc pl-5">
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
  );
}

function PointCard({
  point,
  tone,
  onSelectEvidence,
}: {
  point: ArgumentPointV1;
  tone: 'SUPPORTING' | 'CONTRADICTING';
  onSelectEvidence: (evidenceId: string) => void;
}) {
  const isAdvocate = tone === 'SUPPORTING';

  return (
    <div className="p-3.5 sm:p-4 rounded-lg bg-background/95 border border-border/80 shadow-xs space-y-2.5 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2.5">
        <h4 className="text-xs font-bold text-foreground font-mono tracking-tight leading-snug">
          {point.title}
        </h4>
        <Badge
          variant={
            point.weight === 'PRIMARY'
              ? isAdvocate
                ? 'supporting'
                : 'contradicting'
              : 'neutral'
          }
          className="text-[10px] py-0 px-1.5 font-mono uppercase shrink-0"
        >
          {point.weight}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground font-sans leading-relaxed">
        {point.reasoning}
      </p>

      {/* Grounded Evidence Tokens */}
      {point.evidenceIds && point.evidenceIds.length > 0 && (
        <div className="pt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono border-t border-border/40 mt-1">
          <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
            <FileSearch className="w-3 h-3 text-muted-foreground/70" />
            <span>Facts:</span>
          </span>
          {point.evidenceIds.map((evId) => (
            <button
              key={evId}
              type="button"
              onClick={() => onSelectEvidence(evId)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 hover:bg-accent text-sky-400 hover:text-sky-300 border border-border/60 transition-all text-[11px] font-mono cursor-pointer active:scale-[0.98]"
              title={`Inspect evidence #${evId} in ledger`}
            >
              <span>#{evId.length > 10 ? `${evId.slice(0, 8)}…` : evId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
