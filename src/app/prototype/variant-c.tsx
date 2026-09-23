'use client';

import * as React from 'react';
import { useState } from 'react';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  Swords,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface VariantCProps {
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

export function VariantC({
  brief,
  advocateCase,
  onSelectEvidence,
  humanDecision,
  onCommitDecision,
}: VariantCProps) {
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
    <div className="min-h-screen bg-[#06080d] text-zinc-100 font-sans antialiased pb-28">
      {/* Top Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 sticky top-0 z-30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-black text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded">
            DISSENT
          </span>
          <span className="text-xs font-mono text-zinc-400">ADVERSARIAL DEBATE ARENA</span>
        </div>
        <div className="text-xs font-mono text-zinc-400">
          <span>{brief.structuredThesis.market}</span> • <span>{brief.structuredThesis.timeHorizon.description}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Thesis Callout */}
        <section className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>VERBATIM TRADER THESIS</span>
            <span className="text-emerald-400 font-bold">{brief.structuredThesis.direction}</span>
          </div>
          <p className="text-lg font-medium text-white leading-relaxed">
            &ldquo;{brief.originalThesis}&rdquo;
          </p>
        </section>

        {/* Head-to-Head Arena Summary Banner */}
        <section className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-zinc-950 to-amber-950/30 border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Swords className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                The Dialectical Collision
              </h2>
              <p className="text-xs text-zinc-400">
                5 Advocate claims tested against 5 Dissenter counterweights
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs font-mono border-zinc-700 text-zinc-300">
            18 GROUNDED EVIDENCE OBSERVATIONS
          </Badge>
        </section>

        {/* The Debate Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Advocate Side */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase">The Advocate Points</span>
              <span className="text-[10px] font-mono text-emerald-300">5 Validated Claims</span>
            </div>
            {advocateCase.points.map((pt, idx) => (
              <div key={pt.id} className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-emerald-300">#{idx + 1} {pt.title}</span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
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
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-emerald-900/60 text-emerald-300 hover:bg-zinc-800 flex items-center gap-1"
                      >
                        <span>{ev.provenance.sourceName.split(' ')[0]}:</span>
                        <span className="font-semibold text-zinc-200">{String(ev.value)} {ev.unit}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Dissenter Side */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-950/30 border border-amber-900/50">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase">The Dissenter Points</span>
              <span className="text-[10px] font-mono text-amber-300">5 Validated Counters</span>
            </div>
            {brief.theDissent.points.map((pt, idx) => (
              <div key={pt.id} className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-amber-300">#{idx + 1} {pt.title}</span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
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
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-amber-900/60 text-amber-300 hover:bg-zinc-800 flex items-center gap-1"
                      >
                        <span>{ev.provenance.sourceName.split(' ')[0]}:</span>
                        <span className="font-semibold text-zinc-200">{String(ev.value)} {ev.unit}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Human Operator Decision Box */}
        <section className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-700 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Human Operator Verdict
              </h3>
            </div>
            <span className="text-xs font-mono text-zinc-400">Strict Invariant: AI Never Decides</span>
          </div>

          {humanDecision ? (
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">Operator Decision:</span>
                <span className="font-bold text-emerald-300">{humanDecision.decision}</span>
              </div>
              <p className="text-xs text-zinc-300 italic pt-1 border-t border-zinc-900">
                &ldquo;{humanDecision.rationale}&rdquo;
              </p>
            </div>
          ) : (
            <form onSubmit={handleDecisionSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDecision('PROCEED')}
                  className={`py-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    selectedDecision === 'PROCEED'
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  PROCEED
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDecision('WATCH')}
                  className={`py-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    selectedDecision === 'WATCH'
                      ? 'bg-amber-950 border-amber-500 text-amber-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  WATCH
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDecision('PASS')}
                  className={`py-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                    selectedDecision === 'PASS'
                      ? 'bg-rose-950 border-rose-500 text-rose-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  PASS
                </button>
              </div>
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Operator rationale..."
                className="w-full bg-zinc-950 border-zinc-800 text-xs min-h-[70px]"
              />
              {decisionError && <p className="text-xs text-rose-400 font-mono">{decisionError}</p>}
              <Button type="submit" className="bg-emerald-500 text-zinc-950 font-bold text-xs">
                Commit Operator Decision
              </Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
