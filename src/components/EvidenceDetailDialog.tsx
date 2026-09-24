'use client';

import * as React from 'react';
import { useState } from 'react';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import {
  formatUtcDateTime,
  getEvidenceFreshness,
  getSafeExternalUrl,
} from '@/lib/formatters/market-formatters';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ExternalLink,
  Copy,
  Check,
  FileCode,
} from 'lucide-react';

interface EvidenceDetailDialogProps {
  evidence: EvidenceV1 | null;
  evidenceList?: EvidenceV1[];
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    PRICE_ACTION: 'Price Action',
    VALUATION_METRIC: 'Valuation Multiple & Metric',
    ORDERBOOK_DEPTH: 'Orderbook Depth',
    FUNDING_RATE: 'Funding Rate',
    OPEN_INTEREST: 'Open Interest',
    LIQUIDATION_FLOW: 'Liquidation Flow',
    VOLATILITY_SURFACE: 'Volatility Surface',
    ON_CHAIN_ACTIVITY: 'On-Chain Activity',
    MACRO_METRIC: 'Macro Metric',
    SENTIMENT_METRIC: 'Sentiment Metric',
    CORRELATION: 'Correlation',
    OTHER: 'Market Observation',
  };
  return map[category] ?? category.replace(/_/g, ' ');
}

function formatInstrumentType(type: string): string {
  const map: Record<string, string> = {
    DERIVED_SPOT_PAIR: 'Synthetic Pair',
    SPOT: 'Spot',
    EQUITY: 'Native US Equity',
    USDT_FUTURES: 'USDT Futures',
    COIN_FUTURES: 'Coin-M Futures',
    PERPETUAL: 'Perpetual Swap',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function formatObservationType(type: string): string {
  const map: Record<string, string> = {
    LAST_PRICE: 'Last Traded Price',
    PRICE_CHANGE_24H: '24-Hour Price Change',
    SESSION_PRICE_CHANGE: 'Session Price Change',
    BASE_VOLUME_24H: '24-Hour Volume',
    SESSION_VOLUME: 'Session Trading Volume',
    MARKET_CAPITALIZATION: 'Total Market Capitalization',
    VALUATION_PE_TTM: 'Trailing Twelve-Month P/E (TTM)',
    VALUATION_PE_LYR: 'Last Year Reported P/E (LYR)',
    VALUATION_PB_RATIO: 'Price-to-Book Ratio (P/B)',
    VALUATION_EV_EBITDA: 'Enterprise Value to EBITDA (EV/EBITDA)',
    VALUATION_PS_TTM: 'Price-to-Sales Ratio (TTM)',
    CANDLE_OPEN: 'Candle Open',
    CANDLE_CLOSE: 'Candle Close',
    INTERVAL_PRICE_CHANGE: 'Interval Price Change',
    RETURN_SPREAD: 'Return Spread',
    RELATIVE_RETURN: 'Relative Return',
    FUNDING_RATE: 'Funding Rate',
    OPEN_INTEREST: 'Open Interest',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function formatUnit(unit?: string): string {
  if (!unit) return '';
  if (unit === '%') return '%';
  return unit.replace(/\s+per\s+/i, ' / ');
}

function formatEvidenceValue(val: number | string | undefined): {
  formatted: string;
  exact: string;
  hasDifferentPrecision: boolean;
} {
  if (val === undefined || val === null) {
    return { formatted: '', exact: '', hasDifferentPrecision: false };
  }

  const raw = String(val).trim();
  const num = typeof val === 'number' ? val : Number(raw);

  if (isNaN(num)) {
    return { formatted: raw, exact: raw, hasDifferentPrecision: false };
  }

  const abs = Math.abs(num);
  let formatted = '';

  if (Number.isInteger(num)) {
    formatted = new Intl.NumberFormat('en-US').format(num);
  } else if (abs >= 1000) {
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } else if (abs < 0.0001 && abs > 0) {
    formatted = num.toPrecision(4);
  } else if (abs < 1) {
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(num);
  } else {
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(num);
  }

  const hasDifferentPrecision = raw.length > formatted.length && raw !== formatted;

  return { formatted, exact: raw, hasDifferentPrecision };
}

function getEvidenceTabLabel(item: EvidenceV1): string {
  const type = item.observation.type;
  const market = item.observation.market;
  const baseAsset = market.split('/')[0] ?? market;

  if (type === 'RETURN_SPREAD') return 'Return Spread';
  if (type === 'RELATIVE_RETURN') return `${baseAsset} Rel Return`;
  if (type === 'CANDLE_OPEN') return `${baseAsset} Open`;
  if (type === 'CANDLE_CLOSE') return `${baseAsset} Close`;
  if (type === 'INTERVAL_PRICE_CHANGE') return `${baseAsset} Change`;
  if (type === 'PRICE_CHANGE_24H') return `${baseAsset} 24h`;
  if (type === 'LAST_PRICE') return `${baseAsset} Price`;
  if (type === 'FUNDING_RATE') return `${baseAsset} Funding`;
  if (type === 'OPEN_INTEREST') return `${baseAsset} OI`;
  if (type === 'BASE_VOLUME_24H') return `${baseAsset} Volume`;
  if (type === 'SESSION_PRICE_CHANGE') return `${baseAsset} Change`;
  if (type === 'SESSION_VOLUME') return `${baseAsset} Volume`;
  if (type === 'MARKET_CAPITALIZATION') return `${baseAsset} MCap`;
  if (type === 'VALUATION_PE_TTM') return `${baseAsset} P/E (TTM)`;
  if (type === 'VALUATION_PE_LYR') return `${baseAsset} P/E (LYR)`;
  if (type === 'VALUATION_PB_RATIO') return `${baseAsset} P/B`;
  if (type === 'VALUATION_EV_EBITDA') return `${baseAsset} EV/EBITDA`;
  if (type === 'VALUATION_PS_TTM') return `${baseAsset} P/S`;
  return `${baseAsset} ${String(type).replace(/_/g, ' ').toLowerCase()}`;
}

function formatDisplayClaim(claim: string): string {
  if (!claim) return '';

  // 1. Format date intervals: '2026-09-20T06:00:00.000Z to 2026-09-20T07:00:00.000Z'
  const isoRangeRegex =
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/g;
  let formatted = claim.replace(isoRangeRegex, (m, p1, p2) => {
    try {
      const d1 = new Date(p1);
      const d2 = new Date(p2);
      const dateOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
      const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false };
      const d1Str = d1.toLocaleDateString('en-US', dateOpts);
      const d2Str = d2.toLocaleDateString('en-US', dateOpts);
      const t1 = d1.toLocaleTimeString('en-US', timeOpts);
      const t2 = d2.toLocaleTimeString('en-US', timeOpts);
      if (d1Str === d2Str) {
        return `${d1Str}, ${t1} – ${t2} UTC`;
      }
      return `${d1Str} ${t1} UTC to ${d2Str} ${t2} UTC`;
    } catch {
      return m;
    }
  });

  // 2. Format single ISO timestamp: '2026-09-20T06:00:00.000Z'
  const singleIsoRegex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/g;
  formatted = formatted.replace(singleIsoRegex, (m, iso) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) +
        ' ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) +
        ' UTC'
      );
    } catch {
      return m;
    }
  });

  // 3. Clean 'was 2578.4 USDT per ETH' -> 'was 2,578.40 USDT'
  formatted = formatted.replace(
    /(\d+(?:\.\d+)?)\s+([A-Z]{3,5})\s+per\s+[A-Z]{3,5}/g,
    (m, val, quote) => {
      const num = Number(val);
      if (isNaN(num)) return `${val} ${quote}`;
      const formattedNum = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(num);
      return `${formattedNum} ${quote}`;
    }
  );

  return formatted;
}

export function EvidenceDetailDialog({
  evidence: initialEvidence,
  evidenceList,
  onClose,
  returnFocusRef,
}: EvidenceDetailDialogProps) {
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [prevId, setPrevId] = useState<string | null>(initialEvidence?.id ?? null);
  if ((initialEvidence?.id ?? null) !== prevId) {
    setPrevId(initialEvidence?.id ?? null);
    if (evidenceList && initialEvidence) {
      const idx = evidenceList.findIndex((item) => item.id === initialEvidence.id);
      setActiveIndex(idx >= 0 ? idx : 0);
    } else {
      setActiveIndex(0);
    }
  }

  const evidence =
    evidenceList && evidenceList.length > 1 && evidenceList[activeIndex]
      ? evidenceList[activeIndex]
      : initialEvidence;

  if (!evidence) return null;

  const freshness = getEvidenceFreshness(evidence);
  const safeExternalUrl = getSafeExternalUrl(evidence.provenance.endpointOrLocator);


  const handleCopyRaw = async () => {
    if (!evidence.provenance.rawSnapshot) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(evidence.provenance.rawSnapshot, null, 2));
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch {
      // non-fatal
    }
  };

  return (
    <Dialog open={!!evidence} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          if (returnFocusRef?.current) {
            e.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
        className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 rounded-xl border-stone-200 bg-white shadow-xl"
      >
        {/* Multi-Evidence Switcher when there are multiple items */}
        {evidenceList && evidenceList.length > 1 && (
          <div className="space-y-1.5 pb-2 border-b border-stone-100">
            <div className="flex items-center justify-between text-[11px] font-mono text-stone-400">
              <span className="uppercase tracking-wider font-semibold">
                Multiple Observations ({evidenceList.length})
              </span>
              <span>
                {activeIndex + 1} of {evidenceList.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-100/90 border border-stone-200/80 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {evidenceList.map((item, idx) => {
                const label = getEvidenceTabLabel(item);
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white text-stone-900 font-semibold shadow-xs border border-stone-200/70'
                        : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50/60 font-medium'
                    }`}
                  >
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Header: Evidence Claim */}
        <DialogHeader className="text-left">
          <DialogTitle className="text-base sm:text-lg font-medium text-stone-900 leading-snug tracking-tight">
            {formatDisplayClaim(evidence.claim)}
          </DialogTitle>
        </DialogHeader>

        {/* Hero: Verified Market Value */}
        {evidence.value !== undefined && (() => {
          const { formatted, exact, hasDifferentPrecision } = formatEvidenceValue(evidence.value);
          const unit = formatUnit(evidence.unit);
          return (
            <div className="p-4 rounded-xl bg-stone-50/80 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-stone-400">
                  <span>Observed Metric</span>
                  {evidence.observation.interval && (
                    <>
                      <span className="text-stone-300">•</span>
                      <span>{evidence.observation.interval} Interval</span>
                    </>
                  )}
                </div>
                <div className="text-sm font-semibold text-stone-900 font-sans">
                  {formatObservationType(evidence.observation.type)}
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 tabular-nums">
                    {formatted}
                    {unit === '%' && '%'}
                  </span>
                  {unit && unit !== '%' && (
                    <span className="text-xs sm:text-sm font-sans font-medium text-stone-500">
                      {unit}
                    </span>
                  )}
                </div>
                {hasDifferentPrecision && (
                  <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                    Exact: {exact} {unit}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* Clean Structured Data List */}
        <div className="rounded-xl border border-stone-200 divide-y divide-stone-100 overflow-hidden text-xs font-mono">
          <div className="flex items-center justify-between p-3 bg-white">
            <span className="text-stone-500 font-medium">Market Pair</span>
            <span className="text-stone-900 font-semibold">
              {evidence.observation.market}
              {evidence.observation.instrumentType && (
                <span className="text-stone-400 font-normal ml-1.5">
                  ({formatInstrumentType(evidence.observation.instrumentType)})
                </span>
              )}
            </span>
          </div>

          {evidence.observation.interval && (
            <div className="flex items-center justify-between p-3 bg-stone-50/50">
              <span className="text-stone-500 font-medium">Interval</span>
              <span className="text-stone-900 font-semibold">{evidence.observation.interval}</span>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-white">
            <span className="text-stone-500 font-medium">Evidence Category</span>
            <span className="text-stone-900 font-semibold">{formatCategory(evidence.category)}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-stone-50/50">
            <span className="text-stone-500 font-medium">Observed At</span>
            <span className="text-stone-900 tabular-nums">
              {evidence.provenance.observedAt
                ? formatUtcDateTime(evidence.provenance.observedAt)
                : 'Unknown (Source did not provide an observation time)'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-white">
            <span className="text-stone-500 font-medium">Retrieved At</span>
            <span className="text-stone-900 tabular-nums">
              {formatUtcDateTime(evidence.provenance.retrievedAt)}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-white">
            <span className="text-stone-500 font-medium">Data Freshness</span>
            <span className="text-stone-900 font-semibold">{freshness.level}</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-stone-50/50">
            <span className="text-stone-500 font-medium">Source Provider</span>
            <div className="flex items-center gap-1.5 text-stone-900 font-semibold">
              {safeExternalUrl ? (
                <a
                  href={safeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-stone-900 hover:text-black underline underline-offset-2"
                >
                  <span>{evidence.provenance.sourceName}</span>
                  <ExternalLink className="w-3 h-3 text-stone-400" />
                </a>
              ) : (
                <span>{evidence.provenance.sourceName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Technical Audit & Raw Payload (Collapsible) */}
        {evidence.provenance.rawSnapshot && (
          <details className="text-xs font-mono text-stone-500 group">
            <summary className="cursor-pointer hover:text-stone-900 transition-colors py-1.5 flex items-center justify-between select-none">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700" />
                <span>Technical Audit & Raw Snapshot</span>
              </span>
              <span className="text-[10px] text-stone-400 group-hover:text-stone-600 uppercase">View JSON</span>
            </summary>
            <div className="relative mt-2">
              <pre className="p-3 rounded-xl bg-stone-100 border border-stone-200 overflow-x-auto text-[11px] text-stone-800 max-h-48 leading-tight font-mono">
                {JSON.stringify(evidence.provenance.rawSnapshot, null, 2)}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyRaw}
                className="absolute top-2 right-2 h-7 text-[10px] font-mono gap-1 bg-white hover:bg-stone-50 border-stone-200"
              >
                {copiedRaw ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-stone-400" />
                    <span>Copy JSON</span>
                  </>
                )}
              </Button>
            </div>
          </details>
        )}

        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono px-4 h-8 bg-white hover:bg-stone-50 border-stone-200 text-stone-700"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
