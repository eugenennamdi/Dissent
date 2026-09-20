'use client';

import React, { useState } from 'react';
import type { AssumptionV1 } from '@/core/contracts/assumption';
import { getAssumptionStatusStyle } from '@/lib/formatters/market-formatters';

interface AssumptionStressLedgerProps {
  assumptions: AssumptionV1[];
  onSelectEvidence: (evidenceId: string) => void;
}

export function AssumptionStressLedger({
  assumptions,
  onSelectEvidence,
}: AssumptionStressLedgerProps) {
  const [filter, setFilter] = useState<'ALL' | 'EXPLICIT' | 'INFERRED'>('ALL');

  const filtered = assumptions.filter((item) => {
    if (filter === 'ALL') return true;
    return item.type === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-white font-sans flex items-center gap-2">
            <span>Assumption Stress Testing</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
              {assumptions.length} Evaluated
            </span>
          </h3>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Surfacing implicit axioms and testing them against empirical market data.
          </p>
        </div>

        <div className="flex items-center p-1 rounded bg-[#161b22] border border-[#30363d] text-xs font-mono self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === 'ALL' ? 'bg-[#30363d] text-white font-semibold' : 'text-[#8b949e]'
            }`}
          >
            All ({assumptions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('EXPLICIT')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === 'EXPLICIT' ? 'bg-[#30363d] text-white font-semibold' : 'text-[#8b949e]'
            }`}
          >
            Explicit
          </button>
          <button
            type="button"
            onClick={() => setFilter('INFERRED')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              filter === 'INFERRED' ? 'bg-[#30363d] text-white font-semibold' : 'text-[#8b949e]'
            }`}
          >
            Inferred
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => {
          const statusStyle = getAssumptionStatusStyle(item.status);

          return (
            <div
              key={item.id}
              className="border border-[#30363d] bg-[#161b22] rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Status and category tags */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded border uppercase font-medium ${statusStyle.bg}`}
                    >
                      {statusStyle.label}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                      {item.type}
                    </span>
                  </div>

                  <span className="text-[#7d8590] uppercase">{item.category}</span>
                </div>

                {/* Core assumption claim */}
                <div className="text-sm font-semibold text-white font-sans leading-snug">
                  {item.claim}
                </div>

                {/* Challenge scenario */}
                <div className="space-y-1 text-xs">
                  <div className="font-mono text-[#7d8590] uppercase text-[10px]">
                    Empirical Challenge:
                  </div>
                  <div className="text-[#c9d1d9] font-sans bg-[#0d0f12] p-2.5 rounded border border-[#21262d]">
                    {item.challenge}
                  </div>
                </div>

                {/* Invalidation condition */}
                <div className="space-y-1 text-xs">
                  <div className="font-mono text-[#7d8590] uppercase text-[10px]">
                    Invalidation Condition:
                  </div>
                  <div className="text-[#8b949e] font-sans bg-[#0d0f12] p-2.5 rounded border border-[#21262d]">
                    {item.invalidationCondition}
                  </div>
                </div>
              </div>

              {/* Evidence citations */}
              <div className="pt-3 border-t border-[#21262d] space-y-2 text-[11px] font-mono">
                {item.supportingEvidenceIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-emerald-400">Supporting:</span>
                    {item.supportingEvidenceIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectEvidence(id)}
                        className="px-1.5 py-0.5 rounded bg-[#0d0f12] hover:bg-[#21262d] text-emerald-300 border border-emerald-500/20 cursor-pointer"
                      >
                        #{id.length > 10 ? `${id.slice(0, 8)}…` : id}
                      </button>
                    ))}
                  </div>
                )}

                {item.opposingEvidenceIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-rose-400">Opposing:</span>
                    {item.opposingEvidenceIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onSelectEvidence(id)}
                        className="px-1.5 py-0.5 rounded bg-[#0d0f12] hover:bg-[#21262d] text-rose-300 border border-rose-500/20 cursor-pointer"
                      >
                        #{id.length > 10 ? `${id.slice(0, 8)}…` : id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
