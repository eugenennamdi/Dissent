import {
  deriveEvidenceFreshness,
  type EvidenceV1,
  type FreshnessLevelV1,
} from '@/core/contracts/evidence';

/**
 * Formats an ISO datetime string into UTC human-readable notation.
 */
export function formatUtcDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO datetime string into a compact local time representation.
 */
export function formatLocalDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Returns a human-friendly elapsed duration string (e.g. "42s", "1m 15s").
 */
export function formatElapsedSeconds(totalSeconds: number): string {
  const rounded = Math.max(0, Math.floor(totalSeconds));
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Formats millisecond timings (e.g. 1420ms -> "1.42s").
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Evaluates deterministic freshness for an EvidenceV1 item.
 */
export function getEvidenceFreshness(
  evidence: EvidenceV1,
  asOf: Date | string = new Date()
): { level: FreshnessLevelV1; ageSeconds: number | null; isStale: boolean } {
  return deriveEvidenceFreshness(evidence, asOf);
}

/**
 * Returns safe external URL if and only if the locator string is an absolute
 * HTTP/HTTPS URL. Relative API paths (e.g. "/api/v3/market/tickers") return null.
 */
export function getSafeExternalUrl(endpointOrLocator: string): string | null {
  if (!endpointOrLocator) return null;
  try {
    const trimmed = endpointOrLocator.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.href;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Evidence stance styling definition.
 * Strictly adheres to: EVIDENCE EVALUATION, NOT TRADE SIGNALS.
 */
export function getStanceStyle(stance: 'SUPPORTING' | 'CONTRADICTING' | 'NEUTRAL') {
  switch (stance) {
    case 'SUPPORTING':
      return {
        label: 'Supporting Case',
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-950/20',
        text: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/10',
      };
    case 'CONTRADICTING':
      return {
        label: 'Contradicting Case',
        border: 'border-amber-500/30',
        bg: 'bg-amber-950/20',
        text: 'text-amber-400',
        badgeBg: 'bg-amber-500/10',
      };
    case 'NEUTRAL':
    default:
      return {
        label: 'Neutral Context',
        border: 'border-neutral-700/50',
        bg: 'bg-neutral-900/30',
        text: 'text-neutral-400',
        badgeBg: 'bg-neutral-800',
      };
  }
}

/**
 * Categorical assumption status badge styling.
 */
export function getAssumptionStatusStyle(status: string) {
  switch (status) {
    case 'SUPPORTED':
      return {
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        label: 'Supported',
      };
    case 'QUESTIONED':
      return {
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        label: 'Questioned',
      };
    case 'CONTRADICTED':
      return {
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        label: 'Contradicted',
      };
    case 'INSUFFICIENT_EVIDENCE':
      return {
        bg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
        label: 'Insufficient Evidence',
      };
    case 'UNTESTED':
    default:
      return {
        bg: 'bg-neutral-800 text-neutral-400 border-neutral-700',
        label: 'Untested',
      };
  }
}

/**
 * Scenario plausibility styling.
 */
export function getPlausibilityStyle(plausibility: string) {
  switch (plausibility) {
    case 'HIGH':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    case 'MEDIUM':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'LOW':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    case 'TAIL_RISK':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    default:
      return 'bg-neutral-800 text-neutral-400 border-neutral-700';
  }
}

/**
 * Invalidation review trigger urgency styling.
 * Clarification: Invalidation conditions are THESIS REVIEW TRIGGERS,
 * not automated stop losses or execution signals.
 */
export function getInvalidationUrgencyLabel(urgency: string): {
  label: string;
  badgeStyle: string;
  note: string;
} {
  switch (urgency) {
    case 'IMMEDIATE_EXIT':
      return {
        label: 'Immediate Review Trigger',
        badgeStyle: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        note: 'High-urgency thesis invalidation threshold',
      };
    case 'THESIS_REVIEW':
      return {
        label: 'Thesis Review Trigger',
        badgeStyle: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        note: 'Observable event warrants revisiting assumptions',
      };
    case 'WATCHLIST_ONLY':
    default:
      return {
        label: 'Watchlist Observation',
        badgeStyle: 'bg-neutral-800 text-neutral-300 border-neutral-700',
        note: 'Secondary observation for monitoring',
      };
  }
}

/**
 * Evidence nature label and formatting.
 */
export function getEvidenceNatureLabel(nature: string): string {
  switch (nature) {
    case 'NUMERIC':
      return 'Direct Observation';
    case 'DERIVED':
      return 'Derived Metric';
    case 'QUALITATIVE':
      return 'Qualitative Fact';
    default:
      return nature;
  }
}

/**
 * Formats a semantic evidence citation label respecting the exact observation type,
 * exact value, source, and unit without inventing converted values or unknown units.
 */
export function formatEvidenceCitation(evidence: EvidenceV1): {
  source: string;
  market: string;
  observationTypeLabel: string;
  valueText?: string;
  displayLabel: string;
} {
  const typeMap: Record<string, string> = {
    LAST_PRICE: 'Price',
    PRICE_CHANGE_24H: '24h Change',
    BASE_VOLUME_24H: '24h Vol',
    CANDLE_OPEN: 'Open',
    CANDLE_CLOSE: 'Close',
    INTERVAL_PRICE_CHANGE: 'Price Change',
    RETURN_SPREAD: 'Return Spread',
    RELATIVE_RETURN: 'Rel Return',
    FUNDING_RATE: 'Funding Rate',
    OPEN_INTEREST: 'Open Interest',
  };

  const observationTypeLabel = typeMap[evidence.observation.type] ?? evidence.observation.type;
  const market = evidence.observation.market;
  const rawSource = evidence.provenance.sourceName;
  const source = rawSource.toLowerCase().includes('bitget') ? 'Bitget' : rawSource;

  let valueText: string | undefined = undefined;
  if (evidence.value !== undefined) {
    valueText = evidence.unit
      ? `${evidence.value} ${evidence.unit}`
      : `${evidence.value}`;
  }

  const baseLabel = `${source}: ${market} ${observationTypeLabel}`;
  const displayLabel = valueText ? `${baseLabel} (${valueText})` : baseLabel;

  return {
    source,
    market,
    observationTypeLabel,
    valueText,
    displayLabel,
  };
}
