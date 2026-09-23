'use client';

import * as React from 'react';
import { useState } from 'react';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  ShieldAlert,
  Clock,
  ExternalLink,
  Scale,
  AlertTriangle,
  UserCheck,
  Activity,
  Layers,
  CheckCircle2,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface VariantBProps {
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

export function VariantB({
  brief,
  advocateCase,
  onSelectEvidence,
  humanDecision,
  onCommitDecision,
}: VariantBProps) {
  const [activeTab, setActiveTab] = useState<'DEBATE' | 'ASSUMPTIONS' | 'SCENARIOS' | 'LEDGER'>('DEBATE');
  const [selectedDecision, setSelectedDecision] = useState<HumanDecisionTypeV1 | null>(
    humanDecision?.decision ?? null
  );
  const [rationale, setRationale] = useState(humanDecision?.rationale ?? '');
  const [decisionError, setDecisionError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans antialiased pb-28">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 sticky top-0 z-30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-black text-sky-400 bg-sky-950/60 border border-sky-800/50 px-2 py-0.5 rounded">
            DISSENT
          </span>
          <span className="text-xs font-mono text-zinc-400">INSTITUTIONAL WORKSTATION // SPLIT VIEW</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
          <span>RUN: {brief.runId}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-emerald-400 font-semibold">{brief.structuredThesis.market}</span>
        </div>
      </header>

      {/* Main Split Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Thesis & Decision Attestation (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-18">
            {/* Thesis Dossier */}
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold tracking-wider text-zinc-400 uppercase">
                  Active Trader Thesis
                </span>
                <Badge variant="outline" className="text-[11px] font-mono border-zinc-700 text-zinc-300">
                  {brief.structuredThesis.timeHorizon.description}
                </Badge>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                <p className="text-sm font-medium text-white leading-relaxed">
                  &ldquo;{brief.originalThesis}&rdquo;
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/60">
                  <span className="text-zinc-400 block text-[10px]">MARKET PAIR</span>
                  <span className="text-zinc-200 font-semibold">{brief.structuredThesis.market}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/60">
                  <span className="text-zinc-400 block text-[10px]">DIRECTION</span>
                  <span className="text-emerald-400 font-semibold">{brief.structuredThesis.direction}</span>
                </div>
              </div>

              {/* Immediate Invalidation Trigger */}
              <div className="pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono text-zinc-400 text-[11px] uppercase">Primary Tripwire</span>
                  <span className="text-[10px] font-mono text-rose-400 font-semibold">IMMEDIATE EXIT</span>
                </div>
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs font-mono text-rose-200">
                  {brief.invalidationConditions[0]?.statement}
                </div>
              </div>
            </div>

            {/* Human Decision Desk */}
            <div className="p-6 rounded-2xl bg-zinc-900/80 border-2 border-zinc-700 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">
                    Human Decision Desk
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400">OPERATOR ONLY</span>
              </div>

              {humanDecision ? (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400">Committed Stance:</span>
                    <span className="font-bold text-emerald-300">{humanDecision.decision}</span>
                  </div>
                  <p className="text-xs text-zinc-300 italic pt-1 border-t border-zinc-900">
                    &ldquo;{humanDecision.rationale}&rdquo;
                  </p>
                </div>
              ) : (
                <form onSubmit={handleDecisionSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDecision('PROCEED')}
                      className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                        selectedDecision === 'PROCEED'
                          ? 'bg-emerald-950 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      PROCEED
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDecision('WATCH')}
                      className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                        selectedDecision === 'WATCH'
                          ? 'bg-amber-950 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      WATCH
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDecision('PASS')}
                      className={`py-2 px-3 rounded-lg text-xs font-mono font-bold border transition-all ${
                        selectedDecision === 'PASS'
                          ? 'bg-rose-950 border-rose-500 text-rose-300 ring-2 ring-rose-500/30'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      PASS
                    </button>
                  </div>

                  <Textarea
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    placeholder="Enter human trade rationale..."
                    className="w-full bg-zinc-950 border-zinc-800 text-xs text-zinc-200 min-h-[70px]"
                  />

                  {decisionError && <p className="text-xs text-rose-400 font-mono">{decisionError}</p>}

                  <Button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs py-2 rounded-lg"
                  >
                    Commit Human Decision
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* Right Column: Tabbed Analytical Record (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Dossier Tabs */}
            <div className="flex border-b border-zinc-800 text-xs font-mono overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('DEBATE')}
                className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
                  activeTab === 'DEBATE'
                    ? 'border-emerald-400 text-emerald-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                The Debate (10)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ASSUMPTIONS')}
                className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
                  activeTab === 'ASSUMPTIONS'
                    ? 'border-emerald-400 text-emerald-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Assumptions ({brief.assumptions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('SCENARIOS')}
                className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
                  activeTab === 'SCENARIOS'
                    ? 'border-emerald-400 text-emerald-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Scenarios ({brief.stressScenarios.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('LEDGER')}
                className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
                  activeTab === 'LEDGER'
                    ? 'border-emerald-400 text-emerald-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Evidence ({brief.evidenceLedger.summary.totalCount})
              </button>
            </div>

            {/* Tab 1: Debate */}
            {activeTab === 'DEBATE' && (
              <div className="space-y-6">
                {/* Advocate Points */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-mono font-bold text-emerald-400 uppercase">
                      Advocate Case (5 Points)
                    </span>
                  </div>
                  {advocateCase.points.map((pt) => (
                    <div key={pt.id} className="p-4 rounded-xl bg-zinc-900/40 border border-emerald-950/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-emerald-200">{pt.title}</span>
                        <span className="font-mono text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950">
                          {pt.weight}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{pt.reasoning}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {pt.evidenceIds.map((evId) => {
                          const ev = getEvidenceById(evId);
                          if (!ev) return null;
                          return (
                            <button
                              key={evId}
                              type="button"
                              onClick={() => onSelectEvidence(ev)}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-emerald-900/60 text-emerald-300 hover:bg-zinc-800"
                            >
                              {String(ev.value)} {ev.unit}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Dissenter Points */}
                <div className="space-y-3 pt-4 border-t border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                      Dissenter Counter-Case (5 Points)
                    </span>
                  </div>
                  {brief.theDissent.points.map((pt) => (
                    <div key={pt.id} className="p-4 rounded-xl bg-zinc-900/40 border border-amber-950/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-amber-200">{pt.title}</span>
                        <span className="font-mono text-[10px] text-amber-400 px-1.5 py-0.5 rounded bg-amber-950">
                          {pt.weight}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{pt.reasoning}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {pt.evidenceIds.map((evId) => {
                          const ev = getEvidenceById(evId);
                          if (!ev) return null;
                          return (
                            <button
                              key={evId}
                              type="button"
                              onClick={() => onSelectEvidence(ev)}
                              className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-amber-900/60 text-amber-300 hover:bg-zinc-800"
                            >
                              {String(ev.value)} {ev.unit}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 2: Assumptions */}
            {activeTab === 'ASSUMPTIONS' && (
              <div className="space-y-4">
                {brief.assumptions.map((asm) => (
                  <div key={asm.id} className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">#{asm.id} • {asm.category}</span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          asm.status === 'SUPPORTED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : asm.status === 'QUESTIONED'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}
                      >
                        {asm.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-white">&ldquo;{asm.claim}&rdquo;</p>
                    <p className="text-xs text-zinc-400 italic">Stress Challenge: {asm.challenge}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Scenarios */}
            {activeTab === 'SCENARIOS' && (
              <div className="space-y-4">
                {brief.stressScenarios.map((sc) => (
                  <div key={sc.id} className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white">{sc.name}</h4>
                      <Badge variant="outline" className="text-[10px] font-mono border-rose-900/60 text-rose-300 bg-rose-950/40">
                        {sc.plausibility} PLAUSIBILITY
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{sc.description}</p>
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-rose-300">
                      <span className="font-mono text-zinc-400 block text-[10px]">THESIS CONSEQUENCE</span>
                      {sc.consequenceForThesis}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Ledger */}
            {activeTab === 'LEDGER' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {brief.evidenceLedger.items.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvidence(ev)}
                    className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-sky-400 font-semibold">{ev.observation.type}</span>
                      <span className="text-zinc-400">#{ev.id}</span>
                    </div>
                    <p className="text-xs text-zinc-200 line-clamp-2">{ev.claim}</p>
                    <div className="text-[11px] font-mono text-zinc-300 font-bold pt-1 border-t border-zinc-800/60">
                      {String(ev.value)} {ev.unit}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
