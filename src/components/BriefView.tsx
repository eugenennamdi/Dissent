'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  AlertTriangle,
  UserCheck,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  ArrowUpRight,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { EvidenceDetailDialog } from '@/components/EvidenceDetailDialog';
import { RealityCheckSection } from '@/components/RealityCheckSection';
import { EvidenceLedgerView } from '@/components/EvidenceLedgerView';

export interface BriefViewProps {
  brief: DissentBriefV1;
  advocateCase: ArgumentV1;
  timingsMs?: {
    structuring: number;
    marketResearch: number;
    argumentation: number;
    stressTesting: number;
    synthesis: number;
    total: number;
  };
  storageError?: string | null;
  onSubmitDecision?: (
    decision: HumanDecisionTypeV1,
    notes?: string
  ) => Promise<void> | void;
  isSubmittingDecision?: boolean;
  decisionError?: string | null;
  onNewThesis?: () => void;
  onOpenHistory?: () => void;
  historyCount?: number;
}

/**
 * Extracts and formats clean qualitative narrative from model-authored reasoning,
 * removing raw Evidence citation blocks to prevent text overflow while preserving
 * full evidence accessibility via badge click / ledger inspection.
 */
export function formatArgumentReasoning(reasoning: string): string {
  if (!reasoning) return '';
  if (reasoning.includes('Interpretation:')) {
    const parts = reasoning.split('Interpretation:');
    const clean = parts.slice(1).join('Interpretation:').trim();
    if (clean) return clean;
  }
  if (/^Evidence:\s*\n/i.test(reasoning)) {
    const lines = reasoning.split('\n');
    const nonEvidenceLines = lines.filter(
      (line) => !line.trim().startsWith('Evidence:') && !line.trim().startsWith('[ev_')
    );
    const clean = nonEvidenceLines.join(' ').trim();
    if (clean) return clean;
  }
  return reasoning;
}

/**
 * Formats a raw thesis direction enum (e.g. RELATIVE_SHORT) into polished, readable Title Case.
 */
export function formatThesisDirection(direction: string): string {
  if (!direction) return '';
  const map: Record<string, string> = {
    RELATIVE_LONG: 'Relative Long',
    RELATIVE_SHORT: 'Relative Short',
    DIRECTIONAL_LONG: 'Directional Long',
    DIRECTIONAL_SHORT: 'Directional Short',
    OUTPERFORM: 'Outperform',
    UNDERPERFORM: 'Underperform',
    LONG: 'Long',
    SHORT: 'Short',
    NEUTRAL: 'Neutral',
    VOLATILITY_EXPANSION: 'Volatility Expansion',
    VOLATILITY_COMPRESSION: 'Volatility Compression',
    RANGE_BOUND: 'Range Bound',
  };
  return map[direction] || direction.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BriefView({
  brief,
  advocateCase,
  storageError,
  onSubmitDecision,
  isSubmittingDecision,
  decisionError: externalDecisionError,
  onNewThesis,
  onOpenHistory,
  historyCount,
}: BriefViewProps) {
  const [activeTab, setActiveTab] = useState<'EXECUTIVE' | 'FULL_RECORD'>('EXECUTIVE');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceV1 | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('inspect') === '1') {
        return brief.evidenceLedger.items[0] ?? null;
      }
    }
    return null;
  });
  const [selectedEvidenceList, setSelectedEvidenceList] = useState<EvidenceV1[] | undefined>(undefined);

  const handleOpenEvidence = (evidenceIds: string[]) => {
    if (!evidenceIds || evidenceIds.length === 0) return;
    const items = evidenceIds
      .map((id) => brief.evidenceLedger.items.find((item) => item.id === id))
      .filter((item): item is EvidenceV1 => !!item);
    const first = items[0];
    if (first) {
      setSelectedEvidence(first);
      setSelectedEvidenceList(items.length > 1 ? items : undefined);
    }
  };
  const [onlySection] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('section');
    }
    return null;
  });

  // Human decision form state
  const [selectedDecision, setSelectedDecision] = useState<HumanDecisionTypeV1 | null>(
    brief.humanDecision?.decision ?? null
  );
  const [rationale, setRationale] = useState(brief.humanDecision?.notes ?? '');
  const [localDecisionError, setLocalDecisionError] = useState<string | null>(null);
  const [copiedRunId, setCopiedRunId] = useState(false);

  const handleCopyRunId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(brief.runId);
      setCopiedRunId(true);
      setTimeout(() => setCopiedRunId(false), 2000);
    }
  };

  const primaryAdvocatePoint =
    advocateCase.points.find((p) => p.weight === 'PRIMARY') ?? advocateCase.points[0];
  const primaryDissenterPoint =
    brief.theDissent.points.find((p) => p.weight === 'PRIMARY') ?? brief.theDissent.points[0];

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision) {
      setLocalDecisionError('Please select a decision: PROCEED, WATCH, or PASS.');
      return;
    }
    if (!rationale.trim()) {
      setLocalDecisionError('Operator rationale is required to record a formal human decision.');
      return;
    }
    setLocalDecisionError(null);
    if (onSubmitDecision) {
      await onSubmitDecision(selectedDecision, rationale.trim());
    }
  };

  const effectiveError = localDecisionError || externalDecisionError;

  if (onlySection === 'visualizations') {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans antialiased p-6 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-border">
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">The Reality Check</h2>
              <p className="text-xs text-muted-foreground">
                Assumption validation distribution, forward stress causal flow, and thesis review criteria.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="text-foreground font-semibold">{brief.structuredThesis.market}</span>
            </div>
          </div>
          <div className="pt-2">
            <RealityCheckSection
              assumptions={brief.assumptions}
              stressScenarios={brief.stressScenarios}
              invalidationConditions={brief.invalidationConditions}
              evidenceLedger={brief.evidenceLedger}
              onInspectEvidence={(ev) => setSelectedEvidence(ev)}
            />
          </div>
        </div>
        <EvidenceDetailDialog
          evidence={selectedEvidence}
          evidenceList={selectedEvidenceList}
          onClose={() => {
            setSelectedEvidence(null);
            setSelectedEvidenceList(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased pb-28 overflow-x-hidden">
      {/* Top Publication Header - Restrained Monochromatic */}
      <header className="border-b border-border/70 bg-card/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {brief.structuredThesis.market && (
              <div className="flex items-center text-xs font-mono">
                <span className="text-foreground font-semibold">{brief.structuredThesis.market}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onNewThesis && (
              <button
                type="button"
                onClick={onNewThesis}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-stone-50 border border-border bg-white transition-colors"
              >
                + New Analysis
              </button>
            )}
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-stone-50 border border-border bg-white transition-colors"
              >
                History {historyCount !== undefined ? `(${historyCount})` : ''}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-4 sm:space-y-6 w-full min-w-0">
        {storageError && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{storageError}</span>
          </div>
        )}

        {/* Document View Switcher & Run Attribution Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Mode Switcher */}
          <div
            role="tablist"
            aria-label="Research memo view modes"
            className="inline-flex p-1 rounded-xl bg-stone-100 border border-stone-200 self-start"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'EXECUTIVE'}
              onClick={() => setActiveTab('EXECUTIVE')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'EXECUTIVE'
                  ? 'bg-white text-foreground shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-foreground'
              }`}
            >
              <span>Surface</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'FULL_RECORD'}
              onClick={() => setActiveTab('FULL_RECORD')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'FULL_RECORD'
                  ? 'bg-white text-foreground shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-foreground'
              }`}
            >
              <span>Ledger</span>
              <span
                className={`font-mono text-[11px] px-1.5 py-0.2 rounded-full transition-colors ${
                  activeTab === 'FULL_RECORD'
                    ? 'bg-stone-100 text-stone-900 font-bold border border-stone-200/80'
                    : 'bg-stone-200/70 text-stone-600'
                }`}
              >
                {brief.evidenceLedger.summary.totalCount}
              </span>
            </button>
          </div>

          {/* Run Attribution Token */}
          <button
            type="button"
            onClick={handleCopyRunId}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/70 border border-stone-200 text-stone-700 hover:text-stone-900 transition-colors cursor-pointer self-start sm:self-auto text-xs"
            title={`Click to copy full Run ID: ${brief.runId}`}
          >
            <span className="text-xs text-stone-400 font-medium">Run ID</span>
            <span className="font-mono text-xs font-normal text-stone-700">
              {brief.runId.length > 20
                ? `${brief.runId.slice(0, 10)}…${brief.runId.slice(-6)}`
                : brief.runId}
            </span>
            {copiedRunId ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 animate-in fade-in" strokeWidth={2} />
            ) : (
              <Copy className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 transition-colors" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Thesis Hero Section - Neutral & Monochromatic Editorial Header */}
        <section className="p-6 sm:p-7 rounded-2xl bg-white border border-stone-200/80 shadow-xs relative overflow-hidden space-y-4 sm:space-y-5">
          {/* Header Bar: Section Context & Structured Parameters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-stone-500 font-semibold">
                Original Trader Thesis
              </span>
              <span className="text-stone-300">•</span>
              <span className="text-[11px] font-mono text-stone-400">
                Preserved Verbatim
              </span>
            </div>

            {/* Extracted Thesis Attributes - Unified Segmented Capsule (interfaces.dev & shadcn inspired) */}
            {(() => {
              const dir = brief.structuredThesis.direction;
              const isShort = dir === 'SHORT' || dir === 'RELATIVE_SHORT';
              const isLong = dir === 'LONG' || dir === 'RELATIVE_LONG';

              return (
                <div className="inline-flex items-center rounded-lg bg-stone-50 border border-stone-200 p-0.5 text-xs divide-x divide-stone-200">
                  {/* Market */}
                  <span className="px-2.5 py-1 font-mono font-semibold text-stone-900">
                    {brief.structuredThesis.market}
                  </span>

                  {/* Direction */}
                  <span className="flex items-center gap-1.5 px-2.5 py-1 font-medium">
                    {isShort ? (
                      <TrendingDown className="w-3.5 h-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
                    ) : isLong ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <ArrowRightLeft className="w-3.5 h-3.5 text-stone-400 shrink-0" strokeWidth={1.75} />
                    )}
                    <span
                      className={
                        isShort
                          ? 'text-amber-950 font-semibold'
                          : isLong
                          ? 'text-emerald-950 font-semibold'
                          : 'text-stone-800'
                      }
                    >
                      {formatThesisDirection(brief.structuredThesis.direction)}
                    </span>
                  </span>

                  {/* Horizon */}
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-stone-600 font-sans">
                    <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" strokeWidth={1.75} />
                    <span>{brief.structuredThesis.timeHorizon.description}</span>
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Verbatim Conviction Quote - Canonical shadcn Blockquote Styling */}
          <blockquote className="border-l-2 border-stone-300 pl-4 sm:pl-5 py-0.5">
            <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-stone-900 leading-relaxed max-w-4xl">
              &ldquo;{brief.originalThesis}&rdquo;
            </h1>
          </blockquote>

          {/* Catalysts */}
          {brief.structuredThesis.catalysts.length > 0 && (
            <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-stone-400 font-mono uppercase tracking-wider">Extracted Catalysts:</span>
              {brief.structuredThesis.catalysts.map((cat, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-800 border border-stone-200"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
        </section>

        {activeTab === 'EXECUTIVE' ? (
          <>
            {/* The Debate: Advocate vs Dissenter - Restrained, Balanced Neutral Cards */}
            <section className="space-y-4">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">The Adversarial Debate</h2>
                <p className="text-xs text-muted-foreground">
                  Constructive thesis champion vs. adversarial stress-test, backed strictly by exchange evidence.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Advocate Column */}
                <div className="flex flex-col rounded-2xl bg-white border border-border p-5 sm:p-6 space-y-4 hover:border-zinc-300 transition-colors shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span className="text-xs font-mono font-semibold tracking-wider text-foreground uppercase">
                        The Advocate Case
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Primary Thesis Lead
                    </Badge>
                  </div>

                  <p className="text-xs italic text-foreground/80 leading-relaxed border-l-2 border-emerald-500/60 pl-3">
                    &ldquo;{advocateCase.summary}&rdquo;
                  </p>

                  {/* Primary Point */}
                  {primaryAdvocatePoint && (
                    <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-sm font-semibold text-foreground leading-snug">
                          {primaryAdvocatePoint.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white text-muted-foreground border border-stone-200 shrink-0">
                          Primary Point
                        </span>
                      </div>
                      <p className="text-xs text-foreground/85 leading-relaxed">
                        {formatArgumentReasoning(primaryAdvocatePoint.reasoning)}
                      </p>

                      {/* Evidence Link */}
                      {primaryAdvocatePoint.evidenceIds.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEvidence(primaryAdvocatePoint.evidenceIds)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200/70 border border-stone-200 text-stone-700 hover:text-stone-900 text-xs font-medium transition-colors cursor-pointer group"
                          >
                            <span>
                              View Evidence
                              {primaryAdvocatePoint.evidenceIds.length > 1
                                ? ` (${primaryAdvocatePoint.evidenceIds.length})`
                                : ''}
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dissenter Column */}
                <div className="flex flex-col rounded-2xl bg-white border border-border p-5 sm:p-6 space-y-4 hover:border-zinc-300 transition-colors shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                      <span className="text-xs font-mono font-semibold tracking-wider text-foreground uppercase">
                        The Dissenter Case
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Adversarial Challenge
                    </Badge>
                  </div>

                  <p className="text-xs italic text-foreground/80 leading-relaxed border-l-2 border-amber-500/60 pl-3">
                    &ldquo;{brief.theDissent.summary}&rdquo;
                  </p>

                  {/* Primary Point */}
                  {primaryDissenterPoint && (
                    <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-sm font-semibold text-foreground leading-snug">
                          {primaryDissenterPoint.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white text-muted-foreground border border-stone-200 shrink-0">
                          Primary Point
                        </span>
                      </div>
                      <p className="text-xs text-foreground/85 leading-relaxed">
                        {formatArgumentReasoning(primaryDissenterPoint.reasoning)}
                      </p>

                      {/* Evidence Link */}
                      {primaryDissenterPoint.evidenceIds.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEvidence(primaryDissenterPoint.evidenceIds)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200/70 border border-stone-200 text-stone-700 hover:text-stone-900 text-xs font-medium transition-colors cursor-pointer group"
                          >
                            <span>
                              View Evidence
                              {primaryDissenterPoint.evidenceIds.length > 1
                                ? ` (${primaryDissenterPoint.evidenceIds.length})`
                                : ''}
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* The Reality Check: Elevated Senior Design Suite */}
            <RealityCheckSection
              assumptions={brief.assumptions}
              stressScenarios={brief.stressScenarios}
              invalidationConditions={brief.invalidationConditions}
              evidenceLedger={brief.evidenceLedger}
              onInspectEvidence={(ev) => setSelectedEvidence(ev)}
            />

            {/* Human Decision Attestation Dock - Neutral Non-Biased Choices */}
            <section id="human-decision" className="p-6 sm:p-8 rounded-2xl bg-white border border-border shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-zinc-800" />
                    <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                      Your Research Decision
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The AI researches and challenges. The human trader makes the ultimate execution call.
                  </p>
                </div>
              </div>

              {brief.humanDecision ? (
                <div className="p-4 sm:p-5 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">Recorded Decision:</span>
                      <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-zinc-900 text-white border border-zinc-900">
                        {brief.humanDecision.decision}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                      <span>Operator: {brief.humanDecision.attribution.operatorId}</span>
                      <span>•</span>
                      <span>{new Date(brief.humanDecision.decidedAt).toLocaleString()}</span>
                    </div>
                  </div>
                  {brief.humanDecision.notes && (
                    <div className="text-xs text-foreground/90 leading-relaxed border-l-2 border-zinc-400 pl-3 italic">
                      &ldquo;{brief.humanDecision.notes}&rdquo;
                    </div>
                  )}
                  <p className="text-[11px] font-mono text-muted-foreground pt-1">
                    Research decision recorded in browser session
                  </p>
                </div>
              ) : (
                <form onSubmit={handleDecisionSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold block">
                      Select Formal Decision:
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('PROCEED')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                          selectedDecision === 'PROCEED'
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs ring-1 ring-zinc-900'
                            : 'bg-white border-border text-muted-foreground hover:text-foreground hover:border-zinc-300 hover:bg-stone-50 shadow-2xs'
                        }`}
                      >
                        PROCEED
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('WATCH')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                          selectedDecision === 'WATCH'
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs ring-1 ring-zinc-900'
                            : 'bg-white border-border text-muted-foreground hover:text-foreground hover:border-zinc-300 hover:bg-stone-50 shadow-2xs'
                        }`}
                      >
                        WATCH
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('PASS')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                          selectedDecision === 'PASS'
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs ring-1 ring-zinc-900'
                            : 'bg-white border-border text-muted-foreground hover:text-foreground hover:border-zinc-300 hover:bg-stone-50 shadow-2xs'
                        }`}
                      >
                        PASS
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold block">
                      Operator Decision Rationale (Required):
                    </label>
                    <Textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="Explain your trade decision considering both the Advocate's spot volume data and the Dissenter's BTC dominance warning..."
                      className="w-full bg-white border border-stone-200/90 hover:border-stone-300 text-foreground placeholder:text-muted-foreground/50 text-xs font-sans rounded-xl focus:border-stone-400 focus:ring-1 focus:ring-stone-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-300 focus-visible:border-stone-400 min-h-[90px] shadow-2xs transition-colors"
                    />
                  </div>

                  {effectiveError && (
                    <div className="text-xs text-rose-800 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      <span>{effectiveError}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <span className="text-[11px] text-muted-foreground font-mono break-all sm:break-normal">
                      Attestation is cryptographically bound to Run ID: {brief.runId}
                    </span>
                    <Button
                      type="submit"
                      disabled={isSubmittingDecision}
                      className="w-full sm:w-auto font-semibold text-xs px-5 py-2 rounded-lg transition-colors shrink-0 shadow-xs"
                    >
                      {isSubmittingDecision ? 'Submitting...' : 'Commit Research Decision'}
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </>
        ) : (
          /* Full Verifiable Evidence Ledger */
          <EvidenceLedgerView
            ledger={brief.evidenceLedger}
            onSelectEvidence={(ev) => setSelectedEvidence(ev)}
          />
        )}

        {/* Legal Disclaimer */}
        <footer className="text-center pt-8 border-t border-border/60 text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {brief.disclaimer}
        </footer>
      </main>

      {/* Shared Evidence Inspection Modal */}
      <EvidenceDetailDialog
        evidence={selectedEvidence}
        evidenceList={selectedEvidenceList}
        onClose={() => {
          setSelectedEvidence(null);
          setSelectedEvidenceList(undefined);
        }}
      />
    </div>
  );
}
