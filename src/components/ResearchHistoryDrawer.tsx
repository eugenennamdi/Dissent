'use client';

import React, { useState } from 'react';
import type { StoredResearchRunV1 } from '@/lib/storage/local-brief-store';
import { formatUtcDateTime } from '@/lib/formatters/market-formatters';
import {
  History,
  X,
  Shield,
  Trash2,
  Clock,
  ExternalLink,
  ChevronRight,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResearchHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  runs: StoredResearchRunV1[];
  activeRunId: string | null;
  onSelectRun: (run: StoredResearchRunV1) => void;
  onDeleteRun: (runId: string) => void;
  onClearAll: () => void;
}

function formatDirection(direction?: string): string {
  if (!direction) return '';
  return direction
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b(eth|btc|sol|usdt|usdc)\b/g, (match) => match.toUpperCase())
    .replace(/\b(long|short)\b/g, (match) => match.charAt(0).toUpperCase() + match.slice(1));
}

function formatShortRunId(id: string): string {
  const clean = id.replace(/^run_/, '');
  if (clean.length <= 10) return `#run_${clean}`;
  return `#run_${clean.slice(0, 6)}…${clean.slice(-4)}`;
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
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border-l border-stone-200 h-full shadow-2xl flex flex-col justify-between overflow-y-auto text-stone-900 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200/80 pb-3.5">
            <div className="flex items-center gap-2">
              <h3 id="history-drawer-title" className="text-sm font-semibold text-stone-900 font-sans tracking-tight">
                Research History
              </h3>
              <span className="font-mono text-[10px] font-semibold text-stone-600 bg-stone-100 border border-stone-200/90 px-2 py-0.5 rounded-full">
                {runs.length}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              aria-label="Close history drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Runs List */}
          {runs.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto text-stone-400">
                <History className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-stone-800">No research runs stored yet</p>
                <p className="text-xs text-stone-500 max-w-xs mx-auto leading-relaxed">
                  Your thesis evaluations and stress-test briefs will automatically persist here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {runs.map((item) => {
                const isActive = item.runId === activeRunId;
                const decision = item.brief.humanDecision?.decision;
                const thesis = item.brief.structuredThesis;
                const evidenceCount = item.brief.evidenceLedger.summary.totalCount;
                const conditionCount = item.brief.invalidationConditions.length;

                return (
                  <div
                    key={item.runId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelectRun(item);
                      onClose();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectRun(item);
                        onClose();
                      }
                    }}
                    className={cn(
                      'p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 text-left relative group select-none shadow-2xs',
                      isActive
                        ? 'border-stone-900 bg-stone-50/70 ring-1 ring-stone-900/10'
                        : 'border-stone-200 bg-white hover:border-stone-400 hover:shadow-xs'
                    )}
                  >
                    {/* Top Row: Market, Direction, Decision Badge & Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {thesis.market}
                        </span>
                        {isActive && (
                          <span className="font-mono text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.2 rounded bg-stone-900 text-stone-100">
                            Active
                          </span>
                        )}
                        {thesis.direction && (
                          <span className="text-[11px] font-mono text-stone-500 truncate">
                            · {formatDirection(thesis.direction)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {decision ? (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border',
                              decision === 'PROCEED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/90'
                                : decision === 'WATCH'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200/90'
                                  : 'bg-rose-50 text-rose-800 border-rose-200/90'
                            )}
                          >
                            {decision}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium tracking-wide bg-stone-100 text-stone-600 border border-stone-200">
                            Undecided
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRun(item.runId);
                          }}
                          className="opacity-40 group-hover:opacity-100 p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer ml-0.5"
                          title="Delete run from local storage"
                          aria-label={`Delete run ${item.runId}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Thesis Conviction Statement */}
                    <p className="text-xs text-stone-800 font-sans font-medium leading-snug line-clamp-2">
                      {item.brief.originalThesis}
                    </p>

                    {/* Research Metrics Strip */}
                    <div className="flex items-center gap-3 text-[11px] font-mono text-stone-500 pt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="w-3 h-3 text-stone-400" />
                        {evidenceCount} Evidence
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-stone-400" />
                        {conditionCount} Triggers
                      </span>
                      {thesis.timeHorizon?.description && (
                        <>
                          <span>•</span>
                          <span className="truncate">{thesis.timeHorizon.description}</span>
                        </>
                      )}
                    </div>

                    {/* Footer: Run ID Chip & Timestamp */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-stone-400 pt-2 border-t border-stone-100">
                      <span
                        title={`Full Run ID: ${item.runId}`}
                        className="bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200/60"
                      >
                        {formatShortRunId(item.runId)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        <span>{formatUtcDateTime(item.savedAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {runs.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between text-xs font-mono">
            {confirmClear ? (
              <div className="flex items-center justify-between w-full gap-2">
                <span className="text-[11px] text-stone-600 font-medium">Delete all {runs.length} runs?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 rounded bg-white border border-stone-200 text-stone-700 text-[11px] font-medium hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 text-stone-500 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear all history</span>
                </button>
                <span className="text-[11px] text-stone-400">Dissent v1</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
