'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ArchitectureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface ArchitecturePillar {
  step: string;
  title: string;
  description: string;
  points: {
    label: string;
    detail: string;
  }[];
}

export const PILLARS: ArchitecturePillar[] = [
  {
    step: '01',
    title: 'Market Facts',
    description:
      'Ingests verified US equity quotes, session volumes, and fundamental valuation multiples via Bitget MCP and market data endpoints. Raw observations are parsed with bounded freshness and zero hallucinated metrics.',
    points: [
      {
        label: 'Bitget MCP & Market Services',
        detail: 'Native US equity quotes (NVDA/USD), session volume, market capitalization, and fundamental valuation ratios.',
      },
      {
        label: 'Deterministic Record Hashes',
        detail: 'Source-attributed evidence records are assigned deterministic SHA-256 hashes upon ingestion to preserve provenance and track state changes.',
      },
      {
        label: 'Read-Only Security',
        detail: 'Zero trading keys or execution tools. Operates with zero trade-execution or custodial risk.',
      },
    ],
  },
  {
    step: '02',
    title: 'Adversarial Arena',
    description:
      'Advocate and Dissenter AI desks construct opposing arguments strictly citing Bitget evidence. Assumptions are classified and stress-tested against empirical market conditions to expose blind spots.',
    points: [
      {
        label: 'Dual-Desk Construct',
        detail: 'Advocate builds supporting thesis; Dissenter attacks valuation vulnerabilities and tail risks.',
      },
      {
        label: 'Assumption Testing',
        detail: 'Categorizes explicit and inferred assumptions as SUPPORTED, QUESTIONED, or CONTRADICTED.',
      },
      {
        label: 'Causal Shock Scenarios',
        detail: 'Models valuation compression, demand deceleration, and capex contraction before capital is risked.',
      },
    ],
  },
  {
    step: '03',
    title: 'Human Decision',
    description:
      'The AI never executes trades, issues signals, or makes decisions. You review the synthesized Dissent Brief and authoritatively record PROCEED, WATCH, or PASS.',
    points: [
      {
        label: 'Strict Human Invariant',
        detail: 'LLM prompts are architecturally forbidden from populating or selecting human decisions.',
      },
      {
        label: 'Explicit Operator Actions',
        detail: 'Requires verified operator action to commit PROCEED, WATCH, or PASS with custom notes.',
      },
      {
        label: 'Verbatim Thesis Integrity',
        detail: 'The trader original thesis text is preserved verbatim without lossy summarization.',
      },
    ],
  },
];

export interface ArchitectureViewerProps {
  activeStep: number;
  onSelectStep: (step: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function ArchitectureViewer({
  activeStep,
  onSelectStep,
  onPrev,
  onNext,
}: ArchitectureViewerProps) {
  const currentPillar = (PILLARS[activeStep] ?? PILLARS[0]) as ArchitecturePillar;

  return (
    <>
      {/* Modal Masthead */}
      <div className="p-6 pb-4 border-b border-stone-100">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-xl font-bold tracking-tight text-stone-900 font-sans">
            The Dissent Architecture
          </DialogTitle>
          <p className="text-xs text-stone-500 leading-relaxed font-sans">
            How Dissent transforms subjective conviction into verifiable, adversarial decision support.
          </p>
        </DialogHeader>

        {/* Stepper Navigation Pills */}
        <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-stone-100">
          {PILLARS.map((pillar, idx) => {
            const isCurrent = activeStep === idx;
            return (
              <button
                key={pillar.step}
                type="button"
                onClick={() => onSelectStep(idx)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isCurrent
                    ? 'bg-stone-900 text-white'
                    : 'bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 hover:border-stone-300'
                }`}
              >
                <span className="font-mono text-[10px] opacity-75">{pillar.step}</span>
                <span>{pillar.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Pillar Content */}
      <div className="p-6 space-y-3.5">
        <h3 className="text-base font-semibold text-stone-900 tracking-tight font-sans">
          {currentPillar.title}
        </h3>

        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-sans">
          {currentPillar.description}
        </p>

        <ul className="space-y-2.5 pt-2">
          {currentPillar.points.map((pt, i) => (
            <li key={i} className="text-xs leading-relaxed font-sans text-stone-600 flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400 mt-1.5 shrink-0" />
              <span>
                <strong className="font-medium text-stone-900">{pt.label}:</strong>{' '}
                {pt.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Modal Footer with Arrows & Progress */}
      <div className="px-6 py-4 border-t border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-label="Step progress">
          {PILLARS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectStep(i)}
              aria-label={`Jump to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                activeStep === i ? 'w-6 bg-stone-900' : 'w-2 bg-stone-300 hover:bg-stone-400'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={activeStep === 0}
            aria-label="Previous step"
            className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium text-stone-700 flex items-center gap-1 transition-all cursor-pointer select-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={activeStep === PILLARS.length - 1}
            aria-label="Next step"
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed text-xs font-medium text-white flex items-center gap-1 transition-all cursor-pointer select-none"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

export function ArchitectureModal({ open, onOpenChange }: ArchitectureModalProps) {
  const [activeStep, setActiveStep] = useState(0);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setActiveStep(0);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setActiveStep((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setActiveStep((prev) => Math.min(PILLARS.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-white border-stone-200/90 shadow-2xl rounded-2xl">
        <ArchitectureViewer
          activeStep={activeStep}
          onSelectStep={setActiveStep}
          onPrev={() => setActiveStep((prev) => Math.max(0, prev - 1))}
          onNext={() => setActiveStep((prev) => Math.min(PILLARS.length - 1, prev + 1))}
        />
      </DialogContent>
    </Dialog>
  );
}
