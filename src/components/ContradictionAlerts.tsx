'use client';

import React from 'react';
import type { ContradictionPointV1 } from '@/core/contracts/brief';

interface ContradictionAlertsProps {
  contradictions: ContradictionPointV1[];
  onSelectEvidence: (evidenceId: string) => void;
}

export function ContradictionAlerts({
  contradictions,
  onSelectEvidence,
}: ContradictionAlertsProps) {
  if (contradictions.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] text-xs font-mono text-[#8b949e] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neutral-500" />
          <span>No direct empirical contradictions identified in the Evidence Ledger.</span>
        </div>
        <span className="text-[11px] text-[#7d8590]">
          Adversarial challenges & stress scenarios remain in force below.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold text-rose-400 font-sans flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span>Empirical Contradictions Identified ({contradictions.length})</span>
        </h3>
        <span className="text-xs font-mono text-[#7d8590]">
          Contradicting observations in ledger
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {contradictions.map((c) => {
          // Actual validated backend severity: CRITICAL | SIGNIFICANT | MINOR
          const severityBadge =
            c.severity === 'CRITICAL'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
              : c.severity === 'SIGNIFICANT'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700';

          return (
            <div
              key={c.id}
              className="p-4 rounded-lg bg-rose-950/20 border border-rose-500/30 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded border text-[10px] ${severityBadge}`}>
                    {c.severity} CONTRADICTION
                  </span>
                  <span className="text-[#8b949e]">Target:</span>
                  <span className="text-white font-medium">{c.targetType}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectEvidence(c.contradictingEvidenceId)}
                  className="px-2 py-0.5 rounded bg-[#161b22] hover:bg-[#21262d] text-rose-300 border border-rose-500/30 cursor-pointer"
                >
                  Evidence #{c.contradictingEvidenceId.slice(0, 10)}…
                </button>
              </div>

              <div className="text-sm font-semibold text-white font-sans">{c.statement}</div>

              <div className="text-xs text-[#c9d1d9] font-sans leading-relaxed bg-[#0d0f12] p-3 rounded border border-rose-500/20">
                {c.explanation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
