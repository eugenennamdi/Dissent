'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import type { EvidenceLedgerV1, EvidenceV1 } from '@/core/contracts/evidence';
import {
  Search,
  X,
  Clock,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EvidenceLedgerViewProps {
  ledger: EvidenceLedgerV1;
  onSelectEvidence: (evidence: EvidenceV1) => void;
  className?: string;
}

/**
 * Formats raw float numbers and converts technical unit enums into
 * clean trading desk notation (e.g. "34,431.25 Contracts", "-1.52 pp", "+4.49%").
 */
function formatCardValue(ev: EvidenceV1): { formattedValue: string; colorClass?: string } {
  if (ev.value === undefined) return { formattedValue: '' };

  const rawNum = typeof ev.value === 'number' ? ev.value : parseFloat(String(ev.value));
  const rawUnit = ev.unit || '';
  const obsType = ev.observation.type;

  // Clean unit string
  let unit = rawUnit;
  if (rawUnit === 'BITGET_NATIVE_OPEN_INTEREST') {
    unit = 'Contracts';
  } else if (rawUnit.toLowerCase() === 'percentage points') {
    unit = 'pp';
  } else if (rawUnit.startsWith('USDT per')) {
    unit = 'USDT';
  }

  if (isNaN(rawNum)) {
    return { formattedValue: `${ev.value} ${unit}`.trim() };
  }

  // Session price change (%)
  if (obsType === 'SESSION_PRICE_CHANGE') {
    const sign = rawNum > 0 ? '+' : '';
    const formatted = `${sign}${rawNum.toFixed(2)}%`;
    const colorClass = rawNum > 0 ? 'text-emerald-700' : rawNum < 0 ? 'text-rose-700' : 'text-stone-900';
    return { formattedValue: formatted, colorClass };
  }

  // Format percentages (24h change, interval change, relative return)
  if (obsType === 'PRICE_CHANGE_24H' || obsType === 'INTERVAL_PRICE_CHANGE' || obsType === 'RELATIVE_RETURN') {
    const sign = rawNum > 0 ? '+' : '';
    const formatted = `${sign}${rawNum.toFixed(2)}%`;
    const colorClass = rawNum > 0 ? 'text-emerald-700' : rawNum < 0 ? 'text-rose-700' : 'text-stone-900';
    return { formattedValue: formatted, colorClass };
  }

  // Return spread (percentage points)
  if (obsType === 'RETURN_SPREAD') {
    const sign = rawNum > 0 ? '+' : '';
    const formatted = `${sign}${rawNum.toFixed(2)} pp`;
    const colorClass = rawNum > 0 ? 'text-emerald-700' : rawNum < 0 ? 'text-amber-700' : 'text-stone-900';
    return { formattedValue: formatted, colorClass };
  }

  // Funding rates (typically fractional, e.g. 0.0072% or -0.0005%)
  if (obsType === 'FUNDING_RATE') {
    const sign = rawNum > 0 ? '+' : '';
    // If rawNum is already a percentage e.g. 0.0072
    const displayNum = Math.abs(rawNum) < 0.001 && rawNum !== 0 ? (rawNum * 100).toFixed(4) : rawNum.toFixed(4);
    const formatted = `${sign}${displayNum}%`;
    const colorClass = rawNum > 0 ? 'text-amber-700' : rawNum < 0 ? 'text-emerald-700' : 'text-stone-900';
    return { formattedValue: formatted, colorClass };
  }

  // Open interest (contracts/units)
  if (obsType === 'OPEN_INTEREST') {
    const formatted = `${Math.round(rawNum).toLocaleString('en-US')} ${unit}`;
    return { formattedValue: formatted, colorClass: 'text-stone-900' };
  }

  // Session Volume (equity shares)
  if (obsType === 'SESSION_VOLUME') {
    const formatted = `${Math.round(rawNum).toLocaleString('en-US')} Shares`;
    return { formattedValue: formatted, colorClass: 'text-stone-900' };
  }

  // Total Market Capitalization (USD scale)
  if (obsType === 'MARKET_CAPITALIZATION') {
    if (rawNum >= 1e12) {
      return { formattedValue: `$${(rawNum / 1e12).toFixed(2)}T USD`, colorClass: 'text-stone-900' };
    }
    if (rawNum >= 1e9) {
      return { formattedValue: `$${(rawNum / 1e9).toFixed(2)}B USD`, colorClass: 'text-stone-900' };
    }
    if (rawNum >= 1e6) {
      return { formattedValue: `$${(rawNum / 1e6).toFixed(2)}M USD`, colorClass: 'text-stone-900' };
    }
    return { formattedValue: `$${rawNum.toLocaleString('en-US')} USD`, colorClass: 'text-stone-900' };
  }

  // Valuation Multiples (P/E, P/B, EV/EBITDA, P/S)
  if (obsType.startsWith('VALUATION_')) {
    const formatted = `${rawNum.toFixed(2)}x`;
    return { formattedValue: formatted, colorClass: 'text-stone-900' };
  }

  // 24h Base Volume
  if (obsType === 'BASE_VOLUME_24H') {
    const formatted = `${rawNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
    return { formattedValue: formatted, colorClass: 'text-stone-900' };
  }

  // Standard prices
  const isUsd = unit === 'USD' || unit === 'USDT';
  const prefix = isUsd ? '$' : '';
  const formatted = `${prefix}${rawNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
  return { formattedValue: formatted.trim(), colorClass: 'text-stone-900' };
}

/**
 * Truncates 64-char sha256 evidence IDs into clean chips (e.g. #ev_548c…4e32).
 */
function formatShortEvidenceId(id: string): string {
  const clean = id.replace(/^ev_/, '');
  if (clean.length <= 12) return `#ev_${clean}`;
  return `#ev_${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

/**
 * Categorizes source into clean badge labels.
 */
function getSourceBadge(sourceName: string) {
  const lower = sourceName.toLowerCase();
  if (lower.includes('mcp')) {
    return {
      label: 'Bitget MCP',
      badgeClass: 'bg-stone-900 text-stone-100 border-stone-800',
    };
  }
  if (lower.includes('bitget')) {
    return {
      label: 'Bitget',
      badgeClass: 'bg-stone-900 text-stone-100 border-stone-800',
    };
  }
  return {
    label: 'Desk Analytics',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200/90',
  };
}

/**
 * Stance badge styling.
 */
function getStanceBadge(stance: EvidenceV1['stance']) {
  switch (stance) {
    case 'SUPPORTING':
      return {
        label: 'Supporting',
        dotClass: 'bg-emerald-500',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
      };
    case 'CONTRADICTING':
      return {
        label: 'Contradicting',
        dotClass: 'bg-amber-500',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
      };
    case 'NEUTRAL':
    default:
      return {
        label: 'Neutral',
        dotClass: 'bg-stone-400',
        badgeClass: 'bg-stone-100 text-stone-600 border-stone-200',
      };
  }
}

/**
 * Formats observation type for fast scanning.
 */
function formatObservationTypeLabel(type: string): string {
  switch (type) {
    case 'LAST_PRICE':
      return 'Market Price';
    case 'PRICE_CHANGE_24H':
      return '24h Change';
    case 'SESSION_PRICE_CHANGE':
      return 'Session Change';
    case 'BASE_VOLUME_24H':
      return '24h Volume';
    case 'SESSION_VOLUME':
      return 'Session Volume';
    case 'MARKET_CAPITALIZATION':
      return 'Market Cap';
    case 'VALUATION_PE_TTM':
      return 'Trailing P/E (TTM)';
    case 'VALUATION_PE_LYR':
      return 'Last Year P/E (LYR)';
    case 'VALUATION_PB_RATIO':
      return 'Price-to-Book (P/B)';
    case 'VALUATION_EV_EBITDA':
      return 'EV / EBITDA';
    case 'VALUATION_PS_TTM':
      return 'Price-to-Sales (TTM)';
    case 'CANDLE_OPEN':
      return '1H Candle Open';
    case 'CANDLE_CLOSE':
      return '1H Candle Close';
    case 'INTERVAL_PRICE_CHANGE':
      return 'Interval Change';
    case 'RETURN_SPREAD':
      return 'Return Spread';
    case 'RELATIVE_RETURN':
      return 'Relative Return';
    case 'FUNDING_RATE':
      return 'Funding Rate';
    case 'OPEN_INTEREST':
      return 'Open Interest';
    default:
      return type.replace(/_/g, ' ').toLowerCase();
  }
}

/**
 * Cleans up raw ISO datetimes, raw enums, and excessive float precision
 * from claim strings for human readability.
 */
function formatClaimText(claim: string): string {
  return claim
    .replace(/\b(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}\.\d{3}Z\b/g, '$1 $2 UTC')
    .replace(/\b(-?\d+\.\d{4,})\b/g, (match) => {
      const n = parseFloat(match);
      if (isNaN(n)) return match;
      return n.toFixed(2);
    })
    .replace(/\bBITGET_NATIVE_OPEN_INTEREST\b/g, 'Contracts');
}

/**
 * Formats timestamp to UTC time string.
 */
function formatObservedTime(isoString: string | null): string {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return isoString;
  }
}

export function EvidenceLedgerView({
  ledger,
  onSelectEvidence,
  className = '',
}: EvidenceLedgerViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'BITGET' | 'DESK'>('ALL');
  const [stanceFilter, setStanceFilter] = useState<'ALL' | 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL'>('ALL');
  const [marketFilter, setMarketFilter] = useState<string>('ALL');

  const items = ledger.items;

  // Counts for summary ribbon
  const totalCount = items.length;
  const bitgetCount = items.filter((i) => i.provenance.sourceName.toLowerCase().includes('bitget')).length;
  const deskCount = totalCount - bitgetCount;
  const supportingCount = items.filter((i) => i.stance === 'SUPPORTING').length;
  const contradictingCount = items.filter((i) => i.stance === 'CONTRADICTING').length;
  const neutralCount = items.filter((i) => i.stance === 'NEUTRAL').length;

  // Unique markets in ledger
  const markets = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.observation?.market) {
        set.add(item.observation.market);
      }
    }
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Source filter
      const isBitget = item.provenance.sourceName.toLowerCase().includes('bitget');
      if (sourceFilter === 'BITGET' && !isBitget) return false;
      if (sourceFilter === 'DESK' && isBitget) return false;

      // Stance filter
      if (stanceFilter !== 'ALL' && item.stance !== stanceFilter) return false;

      // Market filter
      if (marketFilter !== 'ALL' && item.observation?.market !== marketFilter) return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const marketMatch = item.observation?.market?.toLowerCase().includes(query);
        const typeMatch = item.observation?.type?.toLowerCase().includes(query);
        const claimMatch = item.claim?.toLowerCase().includes(query);
        const idMatch = item.id.toLowerCase().includes(query);
        const sourceMatch = item.provenance.sourceName.toLowerCase().includes(query);
        if (!marketMatch && !typeMatch && !claimMatch && !idMatch && !sourceMatch) {
          return false;
        }
      }

      return true;
    });
  }, [items, sourceFilter, stanceFilter, marketFilter, searchQuery]);

  return (
    <section className={cn('space-y-6', className)}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-200/80 pb-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-900 tracking-tight">
            Full Verifiable Evidence Ledger
          </h2>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            All {ledger.summary.totalCount} empirical observations gathered from Bitget MCP services and deterministic desk analytics. Every observation is cryptographically grounded in verifiable market state.
          </p>
        </div>

        {/* Aggregate Stats Summary */}
        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
          <span className="px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-stone-700 font-medium">
            <strong className="text-stone-900">{totalCount}</strong> Total
          </span>
          <span className="px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-stone-700 font-medium">
            <strong className="text-stone-900">{bitgetCount}</strong> Bitget
          </span>
          <span className="px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-stone-700 font-medium">
            <strong className="text-stone-900">{deskCount}</strong> Desk Analytics
          </span>
        </div>
      </div>

      {/* Control & Filter Toolbar */}
      <div className="p-3.5 rounded-xl bg-stone-50/80 border border-stone-200 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by market, metric, claim, or ID..."
              className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs font-mono bg-white border border-stone-200 placeholder:text-stone-400 focus:outline-hidden focus:ring-1 focus:ring-stone-400 focus:border-stone-400 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Source Tabs */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-stone-400 text-[11px] mr-1 hidden lg:inline">Source:</span>
            <button
              type="button"
              onClick={() => setSourceFilter('ALL')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                sourceFilter === 'ALL'
                  ? 'bg-stone-900 text-stone-100 shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              )}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('BITGET')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                sourceFilter === 'BITGET'
                  ? 'bg-stone-900 text-stone-100 shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              )}
            >
              Bitget ({bitgetCount})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('DESK')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                sourceFilter === 'DESK'
                  ? 'bg-stone-900 text-stone-100 shadow-2xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              )}
            >
              Desk Analytics ({deskCount})
            </button>
          </div>
        </div>

        {/* Secondary Filter Row: Stances & Markets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200/70 text-xs">
          {/* Stance Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-400 font-mono text-[11px] mr-1">Stance:</span>
            <button
              type="button"
              onClick={() => setStanceFilter('ALL')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer',
                stanceFilter === 'ALL'
                  ? 'bg-stone-800 text-stone-100 font-medium'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStanceFilter('SUPPORTING')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer inline-flex items-center gap-1',
                stanceFilter === 'SUPPORTING'
                  ? 'bg-emerald-800 text-emerald-50 font-medium'
                  : 'bg-white text-emerald-800 border border-stone-200 hover:bg-emerald-50/50'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Supporting ({supportingCount})
            </button>
            <button
              type="button"
              onClick={() => setStanceFilter('CONTRADICTING')}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer inline-flex items-center gap-1',
                stanceFilter === 'CONTRADICTING'
                  ? 'bg-amber-800 text-amber-50 font-medium'
                  : 'bg-white text-amber-800 border border-stone-200 hover:bg-amber-50/50'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Contradicting ({contradictingCount})
            </button>
            {neutralCount > 0 && (
              <button
                type="button"
                onClick={() => setStanceFilter('NEUTRAL')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer inline-flex items-center gap-1',
                  stanceFilter === 'NEUTRAL'
                    ? 'bg-stone-700 text-stone-100 font-medium'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                Neutral ({neutralCount})
              </button>
            )}
          </div>

          {/* Market Filters */}
          {markets.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-stone-400 font-mono text-[11px] mr-1">Market:</span>
              <button
                type="button"
                onClick={() => setMarketFilter('ALL')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer',
                  marketFilter === 'ALL'
                    ? 'bg-stone-800 text-stone-100 font-medium'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                )}
              >
                All
              </button>
              {markets.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMarketFilter(m)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer',
                    marketFilter === actionMarket(m)
                      ? 'bg-stone-800 text-stone-100 font-medium'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Evidence Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-stone-50 border border-dashed border-stone-300 space-y-2">
          <Filter className="w-5 h-5 text-stone-400 mx-auto" />
          <p className="text-sm font-medium text-stone-700">No evidence items match your filters</p>
          <p className="text-xs text-stone-500 font-mono">
            Try adjusting search terms, source selection, or stance filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSourceFilter('ALL');
              setStanceFilter('ALL');
              setMarketFilter('ALL');
            }}
            className="mt-2 text-xs font-mono text-stone-800 underline hover:text-stone-950 cursor-pointer"
          >
            Reset all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredItems.map((ev) => {
            const sourceBadge = getSourceBadge(ev.provenance.sourceName);
            const stanceBadge = getStanceBadge(ev.stance);
            const { formattedValue, colorClass } = formatCardValue(ev);

            return (
              <div
                key={ev.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEvidence(ev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectEvidence(ev);
                  }
                }}
                className="p-4 sm:p-4.5 rounded-xl bg-white border border-stone-200/90 hover:border-stone-400 hover:shadow-xs cursor-pointer transition-all space-y-3 group shadow-2xs text-left relative flex flex-col justify-between"
              >
                {/* Header: Source, Market, Observation Type, Stance */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span
                      title={ev.provenance.sourceName}
                      className={cn(
                        'font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border uppercase shrink-0',
                        sourceBadge.badgeClass
                      )}
                    >
                      {sourceBadge.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-stone-900 shrink-0">
                      {ev.observation.market}
                    </span>
                    <span className="text-xs text-stone-500 font-sans font-medium truncate">
                      · {formatObservationTypeLabel(ev.observation.type)}
                    </span>
                  </div>

                  <div className="shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider',
                        stanceBadge.badgeClass
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full', stanceBadge.dotClass)} />
                      {stanceBadge.label}
                    </span>
                  </div>
                </div>

                {/* Body: Formatted Hero Value & Claim Statement */}
                <div className="space-y-1.5 flex-1">
                  {formattedValue && (
                    <div className={cn('font-mono text-lg sm:text-xl font-bold tracking-tight', colorClass)}>
                      {formattedValue}
                    </div>
                  )}
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    {formatClaimText(ev.claim)}
                  </p>
                </div>

                {/* Footer: Observed Time, Short Hash ID, Inspect Glyphs */}
                <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px] font-mono text-stone-400 gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                    <span className="truncate">
                      {ev.provenance.observedAt
                        ? `Observed: ${formatObservedTime(ev.provenance.observedAt)}`
                        : `Observed: Unknown (Retrieved ${formatObservedTime(ev.provenance.retrievedAt)})`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      title={`Full Evidence ID: ${ev.id}`}
                      className="text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200/60 group-hover:border-stone-300 transition-colors"
                    >
                      {formatShortEvidenceId(ev.id)}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-stone-400 group-hover:text-stone-900 transition-colors font-medium">
                      <span className="text-[10px] hidden sm:inline">Inspect</span>
                      <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function actionMarket(market: string): string {
  return market;
}
