'use client';

import React from 'react';
import { HelpCircle } from 'lucide-react';

interface UnknownsListProps {
  unknowns: string[];
}

export function UnknownsList({ unknowns }: UnknownsListProps) {
  return (
    <div className="border border-border/80 bg-card rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <h4 className="text-sm sm:text-base font-semibold text-foreground font-sans tracking-tight">
              Desk Coverage Boundaries & Evidentiary Unknowns
            </h4>
          </div>
          <p className="text-xs font-sans text-muted-foreground mt-0.5">
            Transparent institutional limitations. Unobserved dimensions are distinct from contradictions.
          </p>
        </div>
        <span className="text-xs font-mono text-muted-foreground self-start sm:self-auto">
          {unknowns.length} Unresolved {unknowns.length === 1 ? 'Dimension' : 'Dimensions'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {unknowns.map((unknown, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg bg-secondary/50 border border-border/60 text-xs font-sans text-foreground/85 leading-relaxed flex items-start gap-2"
          >
            <span className="text-amber-400 font-mono font-bold mt-0.5">•</span>
            <div>{unknown}</div>
          </div>
        ))}
      </div>

      <div className="pt-2 text-[11px] font-mono text-muted-foreground flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <span>
          Current V1 desk coverage evaluates Bitget Spot/Futures orderbook and flow; excludes off-exchange OTC flow and macro news wires.
        </span>
      </div>
    </div>
  );
}
