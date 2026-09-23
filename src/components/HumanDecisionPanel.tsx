'use client';

import React, { useState } from 'react';
import type { HumanDecisionTypeV1, HumanDecisionV1 } from '@/core/contracts/human-decision';
import { MAX_DECISION_NOTES_CHARACTERS } from '@/lib/api/contracts';
import { formatUtcDateTime } from '@/lib/formatters/market-formatters';
import { CheckCircle2, Clock, ShieldCheck, AlertCircle } from 'lucide-react';

interface HumanDecisionPanelProps {
  runId: string;
  thesisId: string;
  existingDecision: HumanDecisionV1 | null;
  onSubmitDecision: (decision: HumanDecisionTypeV1, notes?: string) => Promise<void>;
  isSubmitting: boolean;
  errorMessage: string | null;
}

export function HumanDecisionPanel({
  runId,
  thesisId,
  existingDecision,
  onSubmitDecision,
  isSubmitting,
  errorMessage,
}: HumanDecisionPanelProps) {
  const [selectedDecision, setSelectedDecision] = useState<HumanDecisionTypeV1 | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmedAcknowledged, setConfirmedAcknowledged] = useState(false);

  // If a decision was already recorded for this brief:
  if (existingDecision) {
    const decisionColor =
      existingDecision.decision === 'PROCEED'
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        : existingDecision.decision === 'WATCH'
          ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
          : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

    return (
      <div className="border border-border/80 bg-card rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <h3 className="text-base sm:text-lg font-semibold text-foreground font-sans">
                Human Trading Decision
              </h3>
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border/60">
                Recorded
              </span>
            </div>
            <p className="text-xs font-sans text-muted-foreground mt-0.5">
              Strict Invariant: Attested exclusively by a verified human operator.
            </p>
          </div>

          <div className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>Decided: {formatUtcDateTime(existingDecision.decidedAt)}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-secondary/60 border border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase font-semibold">Operator Action:</span>
            <span className={`px-3 py-1 rounded-md border font-bold text-sm font-mono tracking-wider ${decisionColor}`}>
              {existingDecision.decision}
            </span>
          </div>

          {existingDecision.notes && (
            <div className="space-y-1 text-xs">
              <div className="font-mono text-muted-foreground uppercase text-[10px] font-semibold">Trader Notes:</div>
              <div className="p-3 rounded-lg bg-card border border-border/60 text-foreground/90 font-sans leading-relaxed">
                {existingDecision.notes}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
            <div>
              Actor: <span className="text-foreground">{existingDecision.attribution.actorType}</span>
            </div>
            <div>
              Operator ID: <span className="text-foreground">{existingDecision.attribution.operatorId}</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>
            Research decision recorded in browser session. No automated trades were or will be placed.
          </span>
        </div>
      </div>
    );
  }

  // Interactive decision recorder form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDecision || !confirmedAcknowledged || isSubmitting) return;

    await onSubmitDecision(selectedDecision, notes.trim() || undefined);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-border/80 bg-card rounded-xl p-5 sm:p-6 space-y-5 shadow-xs"
    >
      <div className="border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-foreground font-sans">
            Human Decision Required
          </h3>
          <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Awaiting Human Call
          </span>
        </div>
        <p className="text-xs font-sans text-muted-foreground mt-0.5">
          The AI never decides PROCEED, WATCH, or PASS. You must make an explicit operator choice.
        </p>
      </div>

      {/* 3 Decision Choice Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setSelectedDecision('PROCEED')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none ${
            selectedDecision === 'PROCEED'
              ? 'bg-emerald-950/35 border-emerald-500 ring-1 ring-emerald-500 text-foreground'
              : 'bg-secondary/50 border-border/80 hover:border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-emerald-400">PROCEED</div>
          <div className="text-xs text-muted-foreground font-sans mt-1 leading-relaxed">
            Accept conviction after adversarial review. (Records research intent; does NOT place trade).
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedDecision('WATCH')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none ${
            selectedDecision === 'WATCH'
              ? 'bg-amber-950/35 border-amber-500 ring-1 ring-amber-500 text-foreground'
              : 'bg-secondary/50 border-border/80 hover:border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-amber-400">WATCH</div>
          <div className="text-xs text-muted-foreground font-sans mt-1 leading-relaxed">
            Monitor market for specific invalidation triggers or regime confirmation.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedDecision('PASS')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer select-none ${
            selectedDecision === 'PASS'
              ? 'bg-rose-950/35 border-rose-500 ring-1 ring-rose-500 text-foreground'
              : 'bg-secondary/50 border-border/80 hover:border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-rose-400">PASS</div>
          <div className="text-xs text-muted-foreground font-sans mt-1 leading-relaxed">
            Reject thesis. Dissent identified material contradictions or unacceptable tail risk.
          </div>
        </button>
      </div>

      {/* Optional Trader Reflection Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <label htmlFor="decision-notes" className="font-semibold uppercase text-[11px]">
            Operator Notes / Rationale (Optional)
          </label>
          <span className="tabular-nums text-[11px]">
            {notes.length} / {MAX_DECISION_NOTES_CHARACTERS}
          </span>
        </div>
        <textarea
          id="decision-notes"
          rows={3}
          value={notes}
          maxLength={MAX_DECISION_NOTES_CHARACTERS}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Document your discretionary rationale, key hesitations, or target levels..."
          className="w-full bg-secondary/60 border border-border/80 rounded-lg p-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring resize-y font-sans leading-relaxed"
          disabled={isSubmitting}
        />
      </div>

      {/* Mandatory Disclaimer Acknowledgement */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-secondary/50 border border-border/60">
        <input
          id="confirm-disclaimer"
          type="checkbox"
          checked={confirmedAcknowledged}
          onChange={(e) => setConfirmedAcknowledged(e.target.checked)}
          className="mt-0.5 rounded bg-card border-border text-primary focus:ring-0 cursor-pointer"
          disabled={isSubmitting}
        />
        <label htmlFor="confirm-disclaimer" className="text-xs text-muted-foreground font-mono leading-relaxed cursor-pointer select-none">
          I confirm that this is a research decision and does not place or execute an order on any exchange.
        </label>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          {errorMessage}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-[11px] font-mono text-muted-foreground">
          Run ID: <span className="text-foreground font-semibold">#{runId.slice(0, 12)}…</span>
        </div>

        <button
          type="submit"
          disabled={!selectedDecision || !confirmedAcknowledged || isSubmitting}
          className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-secondary disabled:text-muted-foreground text-white font-medium text-xs font-mono transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
        >
          {isSubmitting ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Recording decision...</span>
            </>
          ) : (
            <span>Commit Human Decision</span>
          )}
        </button>
      </div>
    </form>
  );
}
