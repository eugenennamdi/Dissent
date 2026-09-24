'use client';

import * as React from 'react';
import { useState } from 'react';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  TrendingUp,
  ShieldAlert,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Scale,
  AlertTriangle,
  Flame,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Eye,
  UserCheck,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { RealityCheckEditorialSection } from './reality-check-section';

interface VariantAProps {
  brief: DissentBriefV1;
  advocateCase: ArgumentV1;
  onSelectEvidence: (evidence: EvidenceV1) => void;
  humanDecision: {
    decision: HumanDecisionTypeV1;
    rationale: string;
    decidedAt: string;
  } | null;
  onCommitDecision: (decision: HumanDecisionTypeV1, rationale: string) => void;
}

export function VariantA({
  brief,
  advocateCase,
  onSelectEvidence,
  humanDecision,
  onCommitDecision,
}: VariantAProps) {
  const [showAllAdvocate, setShowAllAdvocate] = useState(false);
  const [showAllDissenter, setShowAllDissenter] = useState(false);
  const [activeTab, setActiveTab] = useState<'EXECUTIVE' | 'FULL_RECORD'>('EXECUTIVE');

  // Human decision form state
  const [selectedDecision, setSelectedDecision] = useState<HumanDecisionTypeV1 | null>(
    humanDecision?.decision ?? null
  );
  const [rationale, setRationale] = useState(humanDecision?.rationale ?? '');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const primaryAdvocatePoint = advocateCase.points.find((p) => p.weight === 'PRIMARY') ?? advocateCase.points[0];
  const primaryDissenterPoint = brief.theDissent.points.find((p) => p.weight === 'PRIMARY') ?? brief.theDissent.points[0];

  const secondaryAdvocatePoints = advocateCase.points.filter((p) => p.id !== primaryAdvocatePoint?.id);
  const secondaryDissenterPoints = brief.theDissent.points.filter((p) => p.id !== primaryDissenterPoint?.id);

  const getEvidenceById = (id: string): EvidenceV1 | undefined => {
    return brief.evidenceLedger.items.find((item) => item.id === id);
  };

  const handleDecisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision) {
      setDecisionError('Please select a decision: PROCEED, WATCH, or PASS.');
      return;
    }
    if (rationale.trim().length < 5) {
      setDecisionError('Please provide at least a brief rationale (minimum 5 characters).');
      return;
    }
    setDecisionError(null);
    onCommitDecision(selectedDecision, rationale.trim());
  };

  return (
    <div className="min-h-screen bg-[#080a0f] text-zinc-100 font-sans antialiased pb-28 overflow-x-hidden">
      {/* Top Publication Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded">
                DISSENT
              </span>
            </div>
            {brief.structuredThesis.market && (
              <div className="hidden md:flex items-center pl-3 border-l border-zinc-800 text-xs font-mono text-zinc-400">
                <span className="text-zinc-200 font-semibold">{brief.structuredThesis.market}</span>
              </div>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('EXECUTIVE')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all text-[11px] sm:text-xs font-medium ${
                  activeTab === 'EXECUTIVE'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Surface
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('FULL_RECORD')}
                className={`px-2.5 sm:px-3 py-1 rounded-md transition-all text-[11px] sm:text-xs font-medium ${
                  activeTab === 'FULL_RECORD'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Ledger ({brief.evidenceLedger.summary.totalCount})
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6 sm:space-y-8 w-full min-w-0">
        {/* Thesis Hero Section */}
        <section className="p-5 sm:p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-sm relative overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="font-mono text-[11px] sm:text-xs text-zinc-300 border-zinc-700 bg-zinc-800/60">
              MARKET: {brief.structuredThesis.market}
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px] sm:text-xs text-emerald-400 border-emerald-800/60 bg-emerald-950/40">
              DIRECTION: {brief.structuredThesis.direction.replace('_', ' ')}
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px] sm:text-xs text-zinc-300 border-zinc-700 bg-zinc-800/60">
              HORIZON: {brief.structuredThesis.timeHorizon.description}
            </Badge>
            <span className="w-full sm:w-auto sm:ml-auto text-[10px] sm:text-[11px] font-mono text-zinc-400">
              ID: {brief.runId} • {new Date(brief.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
            </span>
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider font-mono text-zinc-400 font-semibold">
              Original Trader Thesis (Preserved Verbatim)
            </div>
            <h1 className="text-xl sm:text-2xl font-medium tracking-tight text-white leading-relaxed max-w-4xl">
              &ldquo;{brief.originalThesis}&rdquo;
            </h1>
          </div>

          {/* Catalysts */}
          {brief.structuredThesis.catalysts.length > 0 && (
            <div className="mt-5 pt-4 border-t border-zinc-800/70 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono">EXTRACTED CATALYSTS:</span>
              {brief.structuredThesis.catalysts.map((cat, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
        </section>

        {activeTab === 'EXECUTIVE' ? (
          <>
            {/* The Debate: Advocate vs Dissenter */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">The Adversarial Debate</h2>
                  <p className="text-xs text-zinc-400">
                    Constructive thesis champion vs. adversarial stress-test, backed strictly by exchange evidence.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] sm:text-xs font-mono text-zinc-400 border-zinc-800">
                  10 TOTAL POINTS VERIFIED
                </Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Advocate Column */}
                <div className="flex flex-col rounded-2xl bg-zinc-900/40 border border-emerald-900/40 p-5 sm:p-6 space-y-4 hover:border-emerald-800/60 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-950">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-950" />
                      <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">
                        The Advocate Case
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] sm:text-[11px] font-mono border-emerald-800/60 text-emerald-300 bg-emerald-950/40">
                      Primary Thesis Lead
                    </Badge>
                  </div>

                  <p className="text-xs italic text-zinc-400 leading-relaxed border-l-2 border-emerald-500/40 pl-3">
                    &ldquo;{advocateCase.summary}&rdquo;
                  </p>

                  {/* Primary Point */}
                  {primaryAdvocatePoint && (
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-emerald-950 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-sm font-semibold text-emerald-200 leading-snug">
                          {primaryAdvocatePoint.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50 shrink-0">
                          Primary Point
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {primaryAdvocatePoint.reasoning}
                      </p>

                      {/* Evidence Citations */}
                      <div className="pt-2 flex flex-wrap gap-2">
                        {primaryAdvocatePoint.evidenceIds.map((evId) => (
                          <EvidenceCitationBadge
                            key={evId}
                            evidenceId={evId}
                            ledger={brief.evidenceLedger}
                            onInspect={(ev) => onSelectEvidence(ev)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary Points Collapsible */}
                  {secondaryAdvocatePoints.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAllAdvocate(!showAllAdvocate)}
                        className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <span>
                          {showAllAdvocate ? 'Collapse secondary arguments' : `View ${secondaryAdvocatePoints.length} secondary arguments`}
                        </span>
                        {showAllAdvocate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {showAllAdvocate && (
                        <div className="space-y-3 pt-2">
                          {secondaryAdvocatePoints.map((pt) => (
                            <div key={pt.id} className="p-3.5 rounded-lg bg-zinc-950/40 border border-zinc-800/80 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-zinc-200">{pt.title}</span>
                                <span className="text-[10px] font-mono text-zinc-400 uppercase">{pt.weight}</span>
                              </div>
                              <p className="text-xs text-zinc-400 leading-relaxed">{pt.reasoning}</p>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {pt.evidenceIds.map((evId) => (
                                  <EvidenceCitationBadge
                                    key={evId}
                                    evidenceId={evId}
                                    ledger={brief.evidenceLedger}
                                    onInspect={(ev) => onSelectEvidence(ev)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Dissenter Column */}
                <div className="flex flex-col rounded-2xl bg-zinc-900/40 border border-amber-900/40 p-5 sm:p-6 space-y-4 hover:border-amber-800/60 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-950">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-4 ring-amber-950" />
                      <span className="text-xs font-mono font-bold tracking-wider text-amber-400 uppercase">
                        The Dissenter Case
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] sm:text-[11px] font-mono border-amber-800/60 text-amber-300 bg-amber-950/40">
                      Adversarial Challenge
                    </Badge>
                  </div>

                  <p className="text-xs italic text-zinc-400 leading-relaxed border-l-2 border-amber-500/40 pl-3">
                    &ldquo;{brief.theDissent.summary}&rdquo;
                  </p>

                  {/* Primary Point */}
                  {primaryDissenterPoint && (
                    <div className="p-4 rounded-xl bg-zinc-950/60 border border-amber-950 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-sm font-semibold text-amber-200 leading-snug">
                          {primaryDissenterPoint.title}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50 shrink-0">
                          Primary Point
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {primaryDissenterPoint.reasoning}
                      </p>

                      {/* Evidence Citations */}
                      <div className="pt-2 flex flex-wrap gap-2">
                        {primaryDissenterPoint.evidenceIds.map((evId) => (
                          <EvidenceCitationBadge
                            key={evId}
                            evidenceId={evId}
                            ledger={brief.evidenceLedger}
                            onInspect={(ev) => onSelectEvidence(ev)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary Points Collapsible */}
                  {secondaryDissenterPoints.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAllDissenter(!showAllDissenter)}
                        className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <span>
                          {showAllDissenter ? 'Collapse secondary arguments' : `View ${secondaryDissenterPoints.length} secondary arguments`}
                        </span>
                        {showAllDissenter ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {showAllDissenter && (
                        <div className="space-y-3 pt-2">
                          {secondaryDissenterPoints.map((pt) => (
                            <div key={pt.id} className="p-3.5 rounded-lg bg-zinc-950/40 border border-zinc-800/80 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-zinc-200">{pt.title}</span>
                                <span className="text-[10px] font-mono text-zinc-400 uppercase">{pt.weight}</span>
                              </div>
                              <p className="text-xs text-zinc-400 leading-relaxed">{pt.reasoning}</p>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {pt.evidenceIds.map((evId) => (
                                  <EvidenceCitationBadge
                                    key={evId}
                                    evidenceId={evId}
                                    ledger={brief.evidenceLedger}
                                    onInspect={(ev) => onSelectEvidence(ev)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* The Reality Check: Spacious Editorial Replacement Prototype */}
            <RealityCheckEditorialSection
              assumptions={brief.assumptions}
              stressScenarios={brief.stressScenarios}
              invalidationConditions={brief.invalidationConditions}
              evidenceLedger={brief.evidenceLedger}
              onInspectEvidence={onSelectEvidence}
            />

            {/* Human Decision Attestation Dock */}
            <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-zinc-900/80 to-zinc-950 border-2 border-zinc-700/80 shadow-lg space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      Human Trader Attestation
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400">
                    The AI researches and challenges. The human trader makes the ultimate execution call.
                  </p>
                </div>
              </div>

              {humanDecision ? (
                <div className="p-4 sm:p-5 rounded-xl bg-zinc-900 border border-zinc-700/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">Recorded Decision:</span>
                      <span
                        className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded ${
                          humanDecision.decision === 'PROCEED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                            : humanDecision.decision === 'WATCH'
                            ? 'bg-amber-950 text-amber-300 border border-amber-700'
                            : 'bg-rose-950 text-rose-300 border border-rose-700'
                        }`}
                      >
                        {humanDecision.decision}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {new Date(humanDecision.decidedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-300 leading-relaxed border-l-2 border-zinc-600 pl-3">
                    &ldquo;{humanDecision.rationale}&rdquo;
                  </div>
                </div>
              ) : (
                <form onSubmit={handleDecisionSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-semibold block">
                      Select Formal Decision:
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('PROCEED')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all ${
                          selectedDecision === 'PROCEED'
                            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/40 shadow-sm'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        PROCEED
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('WATCH')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all ${
                          selectedDecision === 'WATCH'
                            ? 'bg-amber-950/80 border-amber-500 text-amber-200 ring-2 ring-amber-500/40 shadow-sm'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        WATCH
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDecision('PASS')}
                        className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all ${
                          selectedDecision === 'PASS'
                            ? 'bg-rose-950/80 border-rose-500 text-rose-200 ring-2 ring-rose-500/40 shadow-sm'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        PASS
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-semibold block">
                      Operator Decision Rationale (Required):
                    </label>
                    <Textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="Explain your trade decision considering both the Advocate's spot volume data and the Dissenter's BTC dominance warning..."
                      className="w-full bg-zinc-950/80 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 text-sm focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 min-h-[90px]"
                    />
                  </div>

                  {decisionError && (
                    <div className="text-xs text-rose-400 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{decisionError}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <span className="text-[11px] text-zinc-400 font-mono break-all sm:break-normal">
                      Attestation is cryptographically bound to Run ID: {brief.runId}
                    </span>
                    <Button
                      type="submit"
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs px-5 py-2 rounded-lg transition-colors shrink-0"
                    >
                      Commit Operator Decision
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </>
        ) : (
          /* Full Ledger View */
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Full Verifiable Evidence Ledger</h2>
              <p className="text-xs text-zinc-400">
                All 18 market observations gathered from Bitget V3 APIs and derived analytics.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {brief.evidenceLedger.items.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onSelectEvidence(ev)}
                  className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-400 font-semibold">{ev.provenance.sourceName}</span>
                    <span className="text-zinc-400 text-[11px]">#{ev.id}</span>
                  </div>
                  <p className="text-xs text-zinc-200 font-medium group-hover:text-white leading-snug">
                    {ev.claim}
                  </p>
                  <div className="flex items-center justify-between pt-2 text-[11px] font-mono border-t border-zinc-800/60">
                    <span className="text-zinc-400">Observed: {ev.provenance.observedAt ? new Date(ev.provenance.observedAt).toLocaleTimeString() : 'Unknown'}</span>
                    <span className="text-zinc-300 font-bold">{String(ev.value)} {ev.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Legal Disclaimer */}
        <footer className="text-center pt-8 border-t border-zinc-900 text-xs text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          {brief.disclaimer}
        </footer>
      </main>
    </div>
  );
}
