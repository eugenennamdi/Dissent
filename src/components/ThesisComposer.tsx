'use client';

import * as React from 'react';
import { useState } from 'react';
import { MAX_THESIS_CHARACTERS } from '@/lib/api/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Scale,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

const CANONICAL_EXAMPLE =
  'I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening.';

interface ThesisComposerProps {
  onSubmit: (thesis: string) => Promise<void>;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClearError: () => void;
}

export function ThesisComposer({
  onSubmit,
  isSubmitting,
  errorMessage,
  onClearError,
}: ThesisComposerProps) {
  const [thesisText, setThesisText] = useState('');

  const charCount = thesisText.length;
  const isTooShort = thesisText.trim().length < 3;
  const isTooLong = charCount > MAX_THESIS_CHARACTERS;
  const isValid = !isTooShort && !isTooLong;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    onClearError();
    await onSubmit(thesisText.trim());
  };

  const handleUseExample = () => {
    setThesisText(CANONICAL_EXAMPLE);
    onClearError();
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-8 sm:py-16 px-4">
      {/* Header & Mission Positioning */}
      <div className="mb-8 space-y-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="highlight" className="gap-1.5 px-2.5 py-1">
            <Scale className="w-3.5 h-3.5 text-sky-400" />
            <span>AI TRADING DESK</span>
            <span className="text-muted-foreground/60">•</span>
            <span>ADVERSARIAL RESEARCH</span>
          </Badge>
          <Badge variant="neutral" className="gap-1 px-2 py-0.5 text-[11px]">
            <Database className="w-3 h-3 text-muted-foreground" />
            <span>Market data · Bitget</span>
          </Badge>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground font-sans">
          Stress-test the trade before the market does.
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl font-sans">
          Dissent extracts your market thesis, pulls verifiable market evidence from Bitget,
          constructs grounded supporting and counter-arguments, stress-tests underlying assumptions,
          and delivers an institutional Dissent Brief.
        </p>

        <div className="flex items-start gap-2 text-xs text-muted-foreground/80 font-mono pt-1">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">The AI researches and challenges. The human makes the final trading decision.</span>
        </div>
      </div>

      {/* Main Thesis Input Card */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="border-border/80 bg-card/95 backdrop-blur-xs shadow-md focus-within:border-ring/80 focus-within:ring-1 focus-within:ring-ring/40 transition-all">
          <CardHeader className="p-4 sm:p-5 pb-2 sm:pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <label
                htmlFor="thesis-input"
                className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2"
              >
                <span>Market Thesis</span>
                <span className="text-[10px] text-muted-foreground/60 normal-case font-sans">
                  (Natural Language)
                </span>
              </label>

              <div className="flex items-center gap-2 font-mono text-xs">
                <span
                  className={`tabular-nums transition-colors ${
                    isTooLong
                      ? 'text-rose-400 font-semibold'
                      : charCount > 1800
                        ? 'text-amber-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {charCount} / {MAX_THESIS_CHARACTERS}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-3">
            <Textarea
              id="thesis-input"
              rows={5}
              value={thesisText}
              onChange={(e) => {
                setThesisText(e.target.value);
                if (errorMessage) onClearError();
              }}
              placeholder="e.g. I think ETH will outperform BTC over the next 48 hours because risk appetite is improving and ETH momentum is strengthening..."
              className="border-0 bg-transparent p-0 text-sm sm:text-base text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:border-0 shadow-none resize-y min-h-[120px] font-sans leading-relaxed"
              disabled={isSubmitting}
              aria-describedby="thesis-scope-help"
            />

            {/* Quick-fill and Scope Help */}
            <div className="pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Quick fill:</span>
                <button
                  type="button"
                  onClick={handleUseExample}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer disabled:opacity-50 group hover:underline"
                >
                  <Sparkles className="w-3 h-3 text-sky-400 group-hover:rotate-12 transition-transform" />
                  <span>Canonical ETH/BTC thesis</span>
                </button>
              </div>

              <div id="thesis-scope-help" className="text-muted-foreground/80 flex items-center gap-1.5">
                <span>Supported Scope:</span>
                <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-mono">
                  ETH/BTC Relative Performance
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-mono flex items-start gap-2.5 animate-in fade-in-0 duration-150"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
            <span className="leading-tight">Bitget multi-endpoint ingestion & 5-stage synthesis (~40s)</span>
          </div>

          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            size="lg"
            className="font-sans font-medium w-full sm:w-auto shrink-0"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Submitting thesis...</span>
              </>
            ) : (
              <>
                <span>Challenge thesis</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Institutional Architecture Highlights */}
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3.5 border-t border-border/60 pt-8 text-xs font-mono text-muted-foreground">
        <div className="space-y-1.5 p-3.5 rounded-lg bg-card/50 border border-border/60">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span>1. Market Facts</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/90">
            Real Bitget spot/futures tickers, funding rates, open interest, and orderbook skew.
          </p>
        </div>

        <div className="space-y-1.5 p-3.5 rounded-lg bg-card/50 border border-border/60">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-emerald-400" />
            <span>2. Adversarial Arena</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/90">
            Advocate vs. Dissenter desks construct opposing cases grounded strictly in market evidence.
          </p>
        </div>

        <div className="space-y-1.5 p-3.5 rounded-lg bg-card/50 border border-border/60">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
            <span>3. Human Decision</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/90">
            The AI never executes trades or signals. You review the brief and record PROCEED, WATCH, or PASS.
          </p>
        </div>
      </div>
    </div>
  );
}
