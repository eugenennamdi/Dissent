'use client';

import * as React from 'react';
import type { EvidenceV1, EvidenceLedgerV1 } from '@/core/contracts/evidence';
import { formatEvidenceCitation } from '@/lib/formatters/market-formatters';
import { FileSearch, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EvidenceCitationBadgeProps {
  evidenceId: string;
  evidence?: EvidenceV1 | null;
  ledger?: EvidenceLedgerV1 | null;
  onInspect: (evidence: EvidenceV1, triggerElement?: HTMLElement) => void;
  className?: string;
  variant?: 'badge' | 'row';
}

function formatBadgeValue(valueText?: string): string | undefined {
  if (!valueText) return undefined;
  const parts = valueText.trim().split(/\s+/);
  const num = Number(parts[0]);
  if (!isNaN(num) && parts.length > 0) {
    let formattedNum = parts[0];
    if (Number.isInteger(num)) {
      formattedNum = num.toLocaleString('en-US');
    } else {
      const abs = Math.abs(num);
      if (abs < 0.0001 && abs > 0) {
        formattedNum = num.toPrecision(4);
      } else if (abs < 1 && abs > 0) {
        formattedNum = num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
      } else if (abs >= 1000) {
        formattedNum = num.toLocaleString('en-US', { maximumFractionDigits: 2 });
      } else {
        formattedNum = num.toFixed(2);
      }
    }
    const rawUnit = parts.slice(1).join(' ');
    if (rawUnit) {
      const unit = rawUnit.toLowerCase() === 'percentage points' ? 'pp' : rawUnit;
      return `${formattedNum} ${unit}`;
    }
    return formattedNum;
  }
  return valueText;
}

export function EvidenceCitationBadge({
  evidenceId,
  evidence,
  ledger,
  onInspect,
  className,
  variant = 'badge',
}: EvidenceCitationBadgeProps) {
  const item: EvidenceV1 | undefined =
    evidence ?? ledger?.items.find((i) => i.id === evidenceId);

  if (!item) {
    // Fallback if evidence record cannot be resolved
    return (
      <button
        type="button"
        disabled
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border border-border/60 bg-secondary/50 text-muted-foreground opacity-75',
          className
        )}
        title={`Evidence #${evidenceId} not found in ledger`}
      >
        <span>#{evidenceId.length > 10 ? `${evidenceId.slice(0, 8)}…` : evidenceId}</span>
      </button>
    );
  }

  const citation = formatEvidenceCitation(item);
  const isInternalAnalytics = citation.source.toLowerCase().includes('dissent');
  const displaySource = isInternalAnalytics ? 'Desk Analytics' : citation.source;
  const displayValue = formatBadgeValue(citation.valueText);

  const stanceDotClass =
    item.stance === 'SUPPORTING'
      ? 'bg-emerald-600'
      : item.stance === 'CONTRADICTING'
        ? 'bg-amber-600'
        : 'bg-stone-400';

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onInspect(item, e.currentTarget);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onInspect(item, e.currentTarget);
    }
  };

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`Inspect evidence: ${citation.displayLabel}`}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer select-none text-left bg-stone-50 hover:bg-stone-100/90 border border-stone-200 text-stone-800 hover:text-stone-900 group',
          className
        )}
        title={`Click to inspect evidence: ${citation.displayLabel}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', stanceDotClass)} />
          <span className="font-semibold text-stone-900 shrink-0">{displaySource}</span>
          <span className="text-stone-300">·</span>
          <span className="text-stone-600 truncate">{citation.market} {citation.observationTypeLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {displayValue && (
            <span className="font-mono text-stone-900 font-medium tabular-nums text-xs">
              {displayValue}
            </span>
          )}
          <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
        </div>
      </button>
    );
  }

  const badgeThemeClass =
    'border-stone-200 bg-stone-100 text-stone-800 hover:bg-stone-200/80 hover:border-stone-300 hover:text-zinc-950';

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Inspect evidence: ${citation.displayLabel}`}
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-all cursor-pointer select-none active:scale-[0.98] text-left max-w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group',
        badgeThemeClass,
        className
      )}
      title={`Inspect evidence: ${citation.displayLabel}`}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', stanceDotClass)} />
      <span className="font-semibold text-foreground/90 truncate max-w-[120px] sm:max-w-none">{displaySource}:</span>
      <span className="text-foreground/80 truncate max-w-[140px] sm:max-w-none">{citation.market} {citation.observationTypeLabel}</span>
      {displayValue && (
        <span className="text-xs tabular-nums text-foreground/95 font-medium border-l border-border/60 pl-1.5 ml-0.5 shrink-0">
          {displayValue}
        </span>
      )}
      <ArrowUpRight className="w-3 h-3 text-stone-400 group-hover:text-stone-700 transition-colors shrink-0 ml-0.5" />
    </button>
  );
}
