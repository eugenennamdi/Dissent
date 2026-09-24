'use client';

import * as React from 'react';
import { useState } from 'react';
import { MAX_THESIS_CHARACTERS } from '@/lib/api/contracts';
import {
  ArrowRight,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { ArchitectureModal } from '@/components/ArchitectureModal';

interface ThesisPreset {
  id: string;
  label: string;
  category: string;
  text: string;
}

const THESIS_PRESETS: ThesisPreset[] = [
  {
    id: 'sol-eth-momentum',
    label: 'SOL/ETH Momentum',
    category: 'Relative Performance',
    text: 'I think SOL will outperform ETH over the next 48 hours because relative spot momentum and trading volume continue to favor SOL.',
  },
  {
    id: 'eth-btc-reversal',
    label: 'ETH/BTC Reversal',
    category: 'Relative Performance',
    text: 'ETH will outperform BTC over the next 48 hours as the recent return spread stabilizes and relative selling pressure subsides.',
  },
  {
    id: 'sol-usdt-breakout',
    label: 'SOL/USDT Breakout',
    category: 'Single-Asset Directional',
    text: 'I think SOL will rally against USDT over the next 24 hours supported by expanding spot volume and positive price momentum.',
  },
  {
    id: 'btc-usdt-pullback',
    label: 'BTC/USDT Pullback',
    category: 'Single-Asset Directional',
    text: 'BTC will pull back against USDT over the next 24 hours as high perpetual funding rates increase carrying costs while spot volume slows.',
  },
];

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
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (isValid && !isSubmitting) {
        e.preventDefault();
        onClearError();
        onSubmit(thesisText.trim());
      }
    }
  };

  const handleSelectPreset = (preset: ThesisPreset) => {
    setThesisText(preset.text);
    setSelectedPresetId(preset.id);
    onClearError();
  };

  const handleClear = () => {
    setThesisText('');
    setSelectedPresetId(null);
    onClearError();
  };

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 flex flex-col justify-between py-6 sm:py-10">
      {/* Centered Content Container */}
      <div className="my-auto w-full space-y-6 sm:space-y-8">
        {/* 1. Masthead & Value Proposition (Centered) */}
        <header className="space-y-3 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground leading-[1.15] font-sans mx-auto max-w-2xl text-balance">
            Stress-test the trade before the market does.
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto font-sans text-balance">
            Dissent extracts your market thesis across BTC, ETH, and SOL markets, pulls verifiable market evidence from Bitget,
            constructs grounded supporting and counter-arguments, and stress-tests underlying assumptions.
          </p>
        </header>

        {/* 2. Main Thesis Input Vessel (Seamless, Monolithic Card) */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="relative rounded-2xl bg-white border border-stone-200/90 shadow-[0_2px_12px_rgba(0,0,0,0.03),0_12px_28px_rgba(0,0,0,0.04)] focus-within:border-stone-400 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.05),0_16px_36px_rgba(0,0,0,0.06)] focus-within:ring-1 focus-within:ring-stone-400/20 transition-all duration-200 overflow-hidden">
            {/* Text Input Area */}
            <div className="p-5 sm:p-6 pb-2">
              <textarea
                id="thesis-input"
                rows={4}
                value={thesisText}
                onChange={(e) => {
                  setThesisText(e.target.value);
                  if (selectedPresetId) setSelectedPresetId(null);
                  if (errorMessage) onClearError();
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. I think SOL will outperform ETH over the next 48 hours on strong relative volume, or BTC will pull back against USDT over the next 24 hours..."
                className="w-full bg-transparent p-0 text-sm sm:text-base text-foreground placeholder:text-stone-400/75 focus:outline-none resize-none min-h-[100px] font-sans leading-relaxed border-0 focus:ring-0"
                disabled={isSubmitting}
                aria-label="Market Thesis"
              />
            </div>

            {/* Integrated Action Dock */}
            <div className="px-5 py-3.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-stone-500">
                <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                  {charCount} / {MAX_THESIS_CHARACTERS}
                </span>
                <span className="text-stone-300">•</span>
                <span className="text-[11px] text-stone-600 font-medium flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-stone-400" />
                  <span>5-stage adversarial synthesis (~40s)</span>
                </span>
                {thesisText.length > 0 && (
                  <>
                    <span className="text-stone-300">•</span>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-stone-400 hover:text-stone-700 transition-colors text-[11px] cursor-pointer"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!isValid || isSubmitting}
                  className={`text-xs sm:text-sm font-semibold px-4 sm:px-5 py-2 rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer flex items-center justify-center gap-2 group ${
                    isValid && !isSubmitting
                      ? 'bg-zinc-900 hover:bg-black text-white shadow-xs'
                      : 'bg-stone-100 text-stone-400 border border-stone-200/70 cursor-not-allowed shadow-none'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <span>Challenge thesis</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Prompt Inspiration Chips (Centered Below the Composer) */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs pt-0.5">
            <span className="text-stone-500 font-medium text-xs shrink-0 mr-1">
              Try thesis:
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {THESIS_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id || thesisText === preset.text;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    disabled={isSubmitting}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer active:scale-[0.97] select-none border ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-sans flex items-start justify-between gap-3 animate-in fade-in-0 duration-150 shadow-2xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
              <button
                type="button"
                onClick={onClearError}
                className="text-rose-600 hover:text-rose-900 text-xs font-semibold px-2 py-0.5 rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </form>
      </div>

      {/* 3. Footer (Docked at Bottom) */}
      <footer className="w-full pt-5 mt-6 sm:mt-10 border-t border-stone-200/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
        <button
          type="button"
          onClick={() => setIsArchitectureOpen(true)}
          className="text-xs text-stone-500 hover:text-stone-900 transition-colors cursor-pointer font-medium hover:underline focus:outline-none focus-visible:underline"
        >
          View Architecture
        </button>

        <div className="text-xs text-stone-400 font-sans">
          Powered by <span className="font-medium text-stone-600">Bitget V3 API</span>
        </div>
      </footer>

      {/* Architecture Overview Modal */}
      <ArchitectureModal
        open={isArchitectureOpen}
        onOpenChange={setIsArchitectureOpen}
      />
    </div>
  );
}
