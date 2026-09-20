'use client';

import React from 'react';

interface WorkstationHeaderProps {
  currentView: 'COMPOSE' | 'RESEARCH' | 'BRIEF';
  onNewThesis: () => void;
  onOpenHistory: () => void;
  historyCount: number;
}

export function WorkstationHeader({
  currentView,
  onNewThesis,
  onOpenHistory,
  historyCount,
}: WorkstationHeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[#21262d] bg-[#0d0f12]/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between text-xs font-mono">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold tracking-wider text-white text-sm">DISSENT</span>
          <span className="text-[#484f58] hidden sm:inline">{'//'}</span>
          <span className="text-[#7d8590] hidden sm:inline tracking-widest uppercase">
            AI Trading Desk
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded bg-[#161b22] border border-[#30363d] text-[#8b949e] shrink-0 text-[11px] sm:text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="hidden sm:inline">V1 Engine:</span>
          <span className="text-white font-semibold">ETH/BTC</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {currentView === 'BRIEF' && (
          <button
            type="button"
            onClick={onNewThesis}
            className="px-3 py-1.5 rounded bg-[#161b22] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>New Analysis</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenHistory}
          className="px-3 py-1.5 rounded bg-[#161b22] hover:bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] border border-[#30363d] transition-colors flex items-center gap-2 cursor-pointer"
          aria-label="Open research history"
        >
          <span>History</span>
          {historyCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#30363d] text-white text-[10px]">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
