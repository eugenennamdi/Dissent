'use client';

import React, { useState } from 'react';
import type { HumanDecisionTypeV1, HumanDecisionV1 } from '@/core/contracts/human-decision';
import { MAX_DECISION_NOTES_CHARACTERS } from '@/lib/api/contracts';
import { formatUtcDateTime } from '@/lib/formatters/market-formatters';

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
      <div className="border border-[#30363d] bg-[#161b22] rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#21262d] pb-3">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-white font-sans flex items-center gap-2">
              <span>Human Trading Decision</span>
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
                Recorded
              </span>
            </h3>
            <p className="text-xs font-mono text-[#7d8590] mt-0.5">
              Strict Invariant: Attested exclusively by a verified human operator.
            </p>
          </div>

          <div className="text-xs font-mono text-[#7d8590]">
            Decided: <span className="text-[#8b949e]">{formatUtcDateTime(existingDecision.decidedAt)}</span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-[#0d0f12] border border-[#21262d] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[#7d8590] uppercase">Operator Action:</span>
            <span className={`px-3 py-1 rounded border font-bold text-sm font-mono tracking-wider ${decisionColor}`}>
              {existingDecision.decision}
            </span>
          </div>

          {existingDecision.notes && (
            <div className="space-y-1 text-xs">
              <div className="font-mono text-[#7d8590] uppercase text-[10px]">Trader Notes:</div>
              <div className="p-3 rounded bg-[#161b22] border border-[#21262d] text-[#c9d1d9] font-sans">
                {existingDecision.notes}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-[#1c2128] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#7d8590]">
            <div>
              Actor: <span className="text-[#8b949e]">{existingDecision.attribution.actorType}</span>
            </div>
            <div>
              Operator ID: <span className="text-[#8b949e]">{existingDecision.attribution.operatorId}</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] font-mono text-[#7d8590] flex items-center gap-2">
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
      className="border border-[#30363d] bg-[#161b22] rounded-lg p-5 sm:p-6 space-y-5"
    >
      <div className="border-b border-[#21262d] pb-3">
        <h3 className="text-base sm:text-lg font-semibold text-white font-sans flex items-center gap-2">
          <span>Human Decision Required</span>
          <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Awaiting Human Call
          </span>
        </h3>
        <p className="text-xs font-mono text-[#7d8590] mt-0.5">
          The AI never decides PROCEED, WATCH, or PASS. You must make an explicit choice.
        </p>
      </div>

      {/* 3 Decision Choice Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setSelectedDecision('PROCEED')}
          className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
            selectedDecision === 'PROCEED'
              ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500 text-white'
              : 'bg-[#0d0f12] border-[#30363d] hover:border-[#484f58] text-[#c9d1d9]'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-emerald-400">PROCEED</div>
          <div className="text-xs text-[#8b949e] font-sans mt-1">
            Accept conviction after adversarial review. (Records research intent; does NOT place trade).
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedDecision('WATCH')}
          className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
            selectedDecision === 'WATCH'
              ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500 text-white'
              : 'bg-[#0d0f12] border-[#30363d] hover:border-[#484f58] text-[#c9d1d9]'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-amber-400">WATCH</div>
          <div className="text-xs text-[#8b949e] font-sans mt-1">
            Monitor market for specific invalidation triggers or regime confirmation.
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedDecision('PASS')}
          className={`p-4 rounded-lg border text-left transition-all cursor-pointer ${
            selectedDecision === 'PASS'
              ? 'bg-rose-950/40 border-rose-500 ring-1 ring-rose-500 text-white'
              : 'bg-[#0d0f12] border-[#30363d] hover:border-[#484f58] text-[#c9d1d9]'
          }`}
        >
          <div className="font-mono font-bold text-sm tracking-wider text-rose-400">PASS</div>
          <div className="text-xs text-[#8b949e] font-sans mt-1">
            Reject thesis. Dissent identified material contradictions or unacceptable tail risk.
          </div>
        </button>
      </div>

      {/* Optional Trader Reflection Notes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono text-[#8b949e]">
          <label htmlFor="decision-notes">OPERATOR NOTES / RATIONALE (OPTIONAL)</label>
          <span className="text-[#7d8590]">
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
          className="w-full bg-[#0d0f12] border border-[#21262d] rounded-md p-3 text-xs sm:text-sm text-[#f0f6fc] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-y font-sans leading-relaxed"
          disabled={isSubmitting}
        />
      </div>

      {/* Mandatory Disclaimer Acknowledgement */}
      <div className="flex items-start gap-2.5 p-3 rounded bg-[#0d0f12] border border-[#21262d]">
        <input
          id="confirm-disclaimer"
          type="checkbox"
          checked={confirmedAcknowledged}
          onChange={(e) => setConfirmedAcknowledged(e.target.checked)}
          className="mt-0.5 rounded bg-[#161b22] border-[#30363d] text-[#238636] focus:ring-0 cursor-pointer"
          disabled={isSubmitting}
        />
        <label htmlFor="confirm-disclaimer" className="text-xs text-[#8b949e] font-mono leading-relaxed cursor-pointer">
          I confirm that this is a research decision and does not place or execute an order on any exchange.
        </label>
      </div>

      {errorMessage && (
        <div className="p-3 rounded bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono">
          {errorMessage}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-[11px] font-mono text-[#7d8590]">
          Run ID: <span className="text-[#8b949e]">#{runId}</span>
        </div>

        <button
          type="submit"
          disabled={!selectedDecision || !confirmedAcknowledged || isSubmitting}
          className="px-5 py-2.5 rounded bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] text-white font-medium text-xs font-mono transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
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
