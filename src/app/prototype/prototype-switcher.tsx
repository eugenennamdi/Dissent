'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';

export interface PrototypeVariantMeta {
  id: string;
  name: string;
  subtitle: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariantMeta[];
  currentVariantId: string;
  onSelectVariant: (id: string) => void;
}

export function PrototypeSwitcher({
  variants,
  currentVariantId,
  onSelectVariant,
}: PrototypeSwitcherProps) {
  const currentIndex = variants.findIndex((v) => v.id === currentVariantId);

  const handlePrev = React.useCallback(() => {
    if (variants.length === 0) return;
    const nextIndex = (currentIndex - 1 + variants.length) % variants.length;
    const target = variants[nextIndex];
    if (target) onSelectVariant(target.id);
  }, [currentIndex, variants, onSelectVariant]);

  const handleNext = React.useCallback(() => {
    if (variants.length === 0) return;
    const nextIndex = (currentIndex + 1) % variants.length;
    const target = variants[nextIndex];
    if (target) onSelectVariant(target.id);
  }, [currentIndex, variants, onSelectVariant]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable')) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <div
      role="region"
      aria-label="Prototype Variant Switcher"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-md text-xs font-sans select-none"
    >
      <div className="flex items-center gap-1.5 pr-2 border-r border-zinc-700/80 text-zinc-400">
        <Layers className="w-3.5 h-3.5 text-emerald-400" />
        <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-zinc-300">Prototype</span>
      </div>

      <button
        type="button"
        onClick={handlePrev}
        aria-label="Previous prototype variant"
        className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-1 px-1">
        {variants.map((v) => {
          const isActive = v.id === currentVariantId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVariant(v.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                isActive
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <span className="font-bold">{v.id}</span>
              <span className="hidden sm:inline">: {v.name}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleNext}
        aria-label="Next prototype variant"
        className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
