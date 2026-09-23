'use client';

import * as React from 'react';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  PROTOTYPE_BRIEF,
  PROTOTYPE_ADVOCATE_CASE,
} from '../prototype-fixture';
import { RealityCheckEditorialSection } from '../reality-check-section';
import { EvidenceDetailDialog } from '@/components/EvidenceDetailDialog';
import { EvidenceCitationBadge } from '@/components/EvidenceCitationBadge';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, UserCheck } from 'lucide-react';

function RealityCheckPrototypeContent() {
  const searchParams = useSearchParams();
  const showOnlySection = searchParams.get('only') === 'section';
  const expandConditions = searchParams.get('expand') === 'conditions' || searchParams.get('expand') === 'all';

  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceV1 | null>(null);
  const [showAllAdvocate, setShowAllAdvocate] = useState(false);
  const [showAllDissenter, setShowAllDissenter] = useState(false);

  const [selectedDecision, setSelectedDecision] = useState<HumanDecisionTypeV1 | null>(null);
  const [rationale, setRationale] = useState('');
  const [committedDecision, setCommittedDecision] = useState<{
    decision: HumanDecisionTypeV1;
    rationale: string;
    decidedAt: string;
  } | null>(null);

  const brief = PROTOTYPE_BRIEF;
  const advocateCase = PROTOTYPE_ADVOCATE_CASE;

  const primaryAdvocatePoint =
    advocateCase.points.find((p) => p.weight === 'PRIMARY') ?? advocateCase.points[0];
  const primaryDissenterPoint =
    brief.theDissent.points.find((p) => p.weight === 'PRIMARY') ?? brief.theDissent.points[0];

  const secondaryAdvocatePoints = advocateCase.points.filter(
    (p) => p.id !== primaryAdvocatePoint?.id
  );
  const secondaryDissenterPoints = brief.theDissent.points.filter(
    (p) => p.id !== primaryDissenterPoint?.id
  );

  const handleCommitDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision) return;
    setCommittedDecision({
      decision: selectedDecision,
      rationale: rationale.trim(),
      decidedAt: new Date().toISOString(),
    });
  };

  if (showOnlySection) {
    return (
      <div className="min-h-screen bg-[#080a0f] text-zinc-100 font-sans antialiased p-6 sm:p-10">
        <div className="max-w-5xl mx-auto">
          <RealityCheckEditorialSection
            assumptions={brief.assumptions}
            stressScenarios={brief.stressScenarios}
            invalidationConditions={brief.invalidationConditions}
            evidenceLedger={brief.evidenceLedger}
            onInspectEvidence={setSelectedEvidence}
            initialExpandedConditions={expandConditions}
          />
        </div>
        <EvidenceDetailDialog
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080a0f] text-zinc-100 font-sans antialiased pb-28 overflow-x-hidden">
      {/* Editorial Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-zinc-100 bg-zinc-900 border border-zinc-700/80 px-2 py-0.5 rounded">
                DISSENT
              </span>
              <span className="text-zinc-600">/</span>
              <span className="text-[11px] sm:text-xs font-mono text-zinc-400">PROTOTYPE: REALITY CHECK</span>
            </div>
            {brief.structuredThesis.market && (
              <div className="hidden md:flex items-center pl-3 border-l border-zinc-800 text-xs font-mono text-zinc-400">
                <span className="text-zinc-200 font-semibold">{brief.structuredThesis.market}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-300">
              Approved Variant A Base
            </span>
          </div>
        </div>
      </header>

      {/* Main Publication Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-10">
        {/* Thesis Hero Card */}
        <section className="p-6 sm:p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-850">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                MARKET: {brief.structuredThesis.market}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                DIRECTION: {brief.structuredThesis.direction.replace('_', ' ')}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                HORIZON: {brief.structuredThesis.timeHorizon.description}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              ID: {brief.runId} • 04:30 PM UTC
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-semibold">
              Original Trader Thesis (Preserved Verbatim)
            </div>
            <p className="text-base sm:text-xl font-medium text-white leading-snug">
              &ldquo;{brief.originalThesis}&rdquo;
            </p>
          </div>

          {brief.structuredThesis.catalysts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-850 text-xs">
              <span className="font-mono text-zinc-400 uppercase text-[10px]">Extracted Catalysts:</span>
              {brief.structuredThesis.catalysts.map((c, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* The Adversarial Debate */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between pb-1 border-b border-zinc-850">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">The Adversarial Debate</h2>
              <p className="text-xs text-zinc-400">
                Constructive thesis champion vs. adversarial stress-test, backed strictly by exchange evidence.
              </p>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              10 Total Points Verified
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Advocate Case */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                    The Advocate Case
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                  Primary Thesis Lead
                </span>
              </div>

              <p className="text-xs italic text-zinc-300 leading-relaxed border-l-2 border-emerald-800/60 pl-3">
                &ldquo;{advocateCase.summary}&rdquo;
              </p>

              {primaryAdvocatePoint && (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/90 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-zinc-100">
                      {primaryAdvocatePoint.title}
                    </h4>
                    <span className="font-mono text-[10px] text-zinc-400 uppercase">
                      Primary Point
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    {primaryAdvocatePoint.reasoning}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {primaryAdvocatePoint.evidenceIds.map((evId) => (
                      <EvidenceCitationBadge
                        key={evId}
                        evidenceId={evId}
                        ledger={brief.evidenceLedger}
                        onInspect={setSelectedEvidence}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Secondary Points */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAllAdvocate((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors p-1 -ml-1 rounded hover:bg-zinc-800/40"
                >
                  {showAllAdvocate ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Hide secondary arguments</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>View {secondaryAdvocatePoints.length} secondary arguments</span>
                    </>
                  )}
                </button>

                {showAllAdvocate && (
                  <div className="pt-3 space-y-3 border-t border-zinc-800/70 mt-3">
                    {secondaryAdvocatePoints.map((pt) => (
                      <div
                        key={pt.id}
                        className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/70 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">{pt.title}</span>
                          <span className="font-mono text-[10px] text-zinc-400 uppercase">{pt.weight}</span>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{pt.reasoning}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dissenter Case */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                    The Dissenter Case
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                  Adversarial Challenge
                </span>
              </div>

              <p className="text-xs italic text-zinc-300 leading-relaxed border-l-2 border-amber-800/60 pl-3">
                &ldquo;{brief.theDissent.summary}&rdquo;
              </p>

              {primaryDissenterPoint && (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/90 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-zinc-100">
                      {primaryDissenterPoint.title}
                    </h4>
                    <span className="font-mono text-[10px] text-zinc-400 uppercase">
                      Primary Point
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    {primaryDissenterPoint.reasoning}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {primaryDissenterPoint.evidenceIds.map((evId) => (
                      <EvidenceCitationBadge
                        key={evId}
                        evidenceId={evId}
                        ledger={brief.evidenceLedger}
                        onInspect={setSelectedEvidence}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Secondary Points */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAllDissenter((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors p-1 -ml-1 rounded hover:bg-zinc-800/40"
                >
                  {showAllDissenter ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Hide secondary arguments</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>View {secondaryDissenterPoints.length} secondary arguments</span>
                    </>
                  )}
                </button>

                {showAllDissenter && (
                  <div className="pt-3 space-y-3 border-t border-zinc-800/70 mt-3">
                    {secondaryDissenterPoints.map((pt) => (
                      <div
                        key={pt.id}
                        className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/70 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">{pt.title}</span>
                          <span className="font-mono text-[10px] text-zinc-400 uppercase">{pt.weight}</span>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">{pt.reasoning}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* NEW ISOLATED REALITY CHECK EDITORIAL SECTION                              */}
        {/* ========================================================================= */}
        <div id="reality-check-prototype">
          <RealityCheckEditorialSection
            assumptions={brief.assumptions}
            stressScenarios={brief.stressScenarios}
            invalidationConditions={brief.invalidationConditions}
            evidenceLedger={brief.evidenceLedger}
            onInspectEvidence={setSelectedEvidence}
            initialExpandedConditions={expandConditions}
          />
        </div>

        {/* Human Decision Attestation Dock */}
        <section className="p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-zinc-300" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Your Research Decision
                </h2>
              </div>
              <p className="text-xs text-zinc-400">
                The AI researches and challenges. The human trader makes the ultimate execution call.
              </p>
            </div>
          </div>

          {committedDecision ? (
            <div className="p-4 sm:p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-zinc-400">Decision:</span>
                <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700">
                  {committedDecision.decision}
                </span>
              </div>
              <p className="text-zinc-300 italic">&ldquo;{committedDecision.rationale}&rdquo;</p>
            </div>
          ) : (
            <form onSubmit={handleCommitDecision} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
                  Select Formal Decision:
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDecision('PROCEED')}
                    className={`py-3 px-4 rounded-xl border text-xs font-mono font-bold transition-all ${
                      selectedDecision === 'PROCEED'
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
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
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
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
                        ? 'bg-zinc-100 text-zinc-950 border-zinc-100 shadow-sm'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    PASS
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
                  Operator Decision Rationale (Required):
                </label>
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Explain your trade decision considering both the Advocate's spot volume data and the Dissenter's BTC dominance warning..."
                  className="bg-zinc-950/80 border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 text-xs font-mono min-h-[90px]"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <span className="text-[11px] font-mono text-zinc-400">
                  Attestation is cryptographically bound to Run ID: {brief.runId}
                </span>
                <Button
                  type="submit"
                  disabled={!selectedDecision || !rationale.trim()}
                  className="bg-zinc-100 text-zinc-900 hover:bg-white font-mono text-xs font-semibold px-5 py-2 rounded-xl transition-colors disabled:opacity-40"
                >
                  Commit Research Decision
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* Disclaimer */}
        <footer className="text-center pt-8 border-t border-zinc-900 text-xs text-zinc-500 max-w-2xl mx-auto leading-relaxed">
          {brief.disclaimer}
        </footer>
      </main>

      {/* Shared Evidence Inspection Modal */}
      <EvidenceDetailDialog
        evidence={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />
    </div>
  );
}

export default function RealityCheckPrototypePage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-400 font-mono text-xs">Loading Reality Check Prototype...</div>}>
      <RealityCheckPrototypeContent />
    </Suspense>
  );
}
