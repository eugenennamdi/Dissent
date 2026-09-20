'use client';

import React from 'react';
import type { StoredResearchRunV1 } from '@/lib/storage/local-brief-store';
import { formatUtcDateTime } from '@/lib/formatters/market-formatters';

interface ResearchHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  runs: StoredResearchRunV1[];
  activeRunId: string | null;
  onSelectRun: (run: StoredResearchRunV1) => void;
  onDeleteRun: (runId: string) => void;
  onClearAll: () => void;
}

export function ResearchHistoryDrawer({
  isOpen,
  onClose,
  runs,
  activeRunId,
  onSelectRun,
  onDeleteRun,
  onClearAll,
}: ResearchHistoryDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#161b22] border-l border-[#30363d] h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#21262d] pb-4">
            <div>
              <h3 id="history-drawer-title" className="text-base font-semibold text-white font-sans">
                Research History
              </h3>
              <p className="text-xs font-mono text-[#7d8590] mt-0.5">
                Browser-local persistence ({runs.length} stored)
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] hover:text-white transition-colors cursor-pointer text-xs font-mono"
              aria-label="Close history drawer"
            >
              ✕
            </button>
          </div>

          {/* Privacy / Local Storage Notice */}
          <div className="p-3 rounded bg-[#0d0f12] border border-[#21262d] text-[11px] font-mono text-[#7d8590] leading-relaxed">
            Runs are persisted solely in your browser. The backend is stateless; no cloud copies or cross-device recovery exist.
          </div>

          {/* Runs List */}
          {runs.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[#7d8590]">
              No research runs stored yet.
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((item) => {
                const isActive = item.runId === activeRunId;
                const decision = item.brief.humanDecision?.decision;

                return (
                  <div
                    key={item.runId}
                    onClick={() => {
                      onSelectRun(item);
                      onClose();
                    }}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer space-y-2 ${
                      isActive
                        ? 'border-[#58a6ff] bg-[#1c2128]'
                        : 'border-[#30363d] bg-[#0d0f12] hover:border-[#484f58]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-white font-semibold">
                        {item.brief.structuredThesis.market}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {decision ? (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              decision === 'PROCEED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : decision === 'WATCH'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {decision}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700">
                            Undecided
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRun(item.runId);
                          }}
                          className="text-[#7d8590] hover:text-rose-400 p-1 text-[11px] cursor-pointer"
                          title="Delete run from local storage"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-[#c9d1d9] font-sans line-clamp-2 italic">
                      &ldquo;{item.brief.originalThesis}&rdquo;
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-[#7d8590] pt-1 border-t border-[#1c2128]">
                      <span>#{item.runId.slice(0, 10)}…</span>
                      <span>{formatUtcDateTime(item.savedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {runs.length > 0 && (
          <div className="pt-4 border-t border-[#21262d] flex justify-between items-center text-xs font-mono">
            <button
              type="button"
              onClick={onClearAll}
              className="text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
            >
              Clear all history
            </button>
            <span className="text-[#7d8590] text-[11px]">Dissent V1</span>
          </div>
        )}
      </div>
    </div>
  );
}
