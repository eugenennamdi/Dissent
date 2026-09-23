'use client';

import * as React from 'react';

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
    <header className="sticky top-0 z-30 w-full border-b border-border/70 bg-card/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between text-xs font-mono">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold tracking-wider text-foreground text-sm font-sans">DISSENT</span>
          <span className="text-muted-foreground/40 hidden sm:inline">{'//'}</span>
          <span className="text-muted-foreground hidden sm:inline tracking-wider uppercase text-[11px]">
            AI Trading Desk
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {currentView === 'BRIEF' && (
          <button
            type="button"
            onClick={onNewThesis}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-stone-50 active:scale-[0.98] text-foreground border border-border transition-all flex items-center gap-1.5 cursor-pointer select-none font-medium shadow-2xs"
          >
            <span>+</span>
            <span>New Analysis</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenHistory}
          className="px-3 py-1.5 rounded-lg bg-white hover:bg-stone-50 active:scale-[0.98] text-muted-foreground hover:text-foreground border border-border transition-all flex items-center gap-2 cursor-pointer select-none shadow-2xs"
          aria-label="Open research history"
        >
          <span>History</span>
          {historyCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-800 border border-stone-200 text-[10px] font-semibold tabular-nums">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
