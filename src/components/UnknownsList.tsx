'use client';

import React from 'react';

interface UnknownsListProps {
  unknowns: string[];
}

export function UnknownsList({ unknowns }: UnknownsListProps) {
  return (
    <div className="border border-[#30363d] bg-[#161b22] rounded-lg p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#21262d] pb-3">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white font-sans flex items-center gap-2">
            <span>Research Limitations & Evidentiary Blind Spots</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
              Unresolved Gaps ({unknowns.length})
            </span>
          </h3>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Transparent institutional limitations. Gaps are not contradictions, but ungrounded dimensions.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {unknowns.map((unknown, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded bg-[#0d0f12] border border-[#21262d] text-xs font-sans text-[#c9d1d9] leading-relaxed flex items-start gap-2.5"
          >
            <span className="text-amber-400/80 font-mono font-bold mt-0.5">•</span>
            <div>{unknown}</div>
          </div>
        ))}
      </div>

      <div className="pt-2 text-[11px] font-mono text-[#7d8590] flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span>
          Current V1 desk coverage excludes broader macro events, off-exchange OTC flow, and news sentiment.
        </span>
      </div>
    </div>
  );
}
