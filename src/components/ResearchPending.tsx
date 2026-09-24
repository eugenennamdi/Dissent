'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { formatElapsedSeconds } from '@/lib/formatters/market-formatters';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Clock } from 'lucide-react';

interface ResearchPendingProps {
  thesis: string;
}

const STAGES = [
  {
    n: '01',
    title: 'Thesis Interpretation',
    desc: 'Identifies the market, direction, and assumptions in your thesis.',
  },
  {
    n: '02',
    title: 'Market Evidence',
    desc: 'Retrieves source-attributed quotes and valuation metrics.',
  },
  {
    n: '03',
    title: 'Opposing Arguments',
    desc: 'Builds evidence-grounded cases for and against your thesis.',
  },
  {
    n: '04',
    title: 'Stress Test & Brief',
    desc: 'Challenges key assumptions and prepares your research Brief.',
  },
] as const;

export function ResearchPending({ thesis }: ResearchPendingProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto py-10 sm:py-16 px-4">
      <Card className="border-border bg-white shadow-xs space-y-6">
        {/* Status Header */}
        <CardHeader className="p-5 sm:p-6 pb-0 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground font-sans tracking-tight">
              Conducting Adversarial Analysis
            </h2>

            <div className="flex items-center gap-2 font-mono text-xs shrink-0">
              <div className="px-3 py-1.5 rounded-md bg-stone-50 border border-border text-muted-foreground flex items-center gap-1.5 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>Elapsed:</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {formatElapsedSeconds(elapsedSeconds)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 pt-0 space-y-6">
          {/* Verbatim Thesis Callout */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              <span>Thesis Under Investigation (Verbatim)</span>
            </div>
            <div className="p-4 rounded-lg bg-stone-50 border border-stone-200/80 text-sm text-foreground font-sans italic leading-relaxed shadow-2xs">
              &ldquo;{thesis}&rdquo;
            </div>
          </div>

          {/* Research stages — informational only, no fabricated progression */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-sans font-medium text-foreground/70 uppercase tracking-wider">
              Research in Progress
            </div>

            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The analysis runs as a single end-to-end request. The stages below describe the methodology being applied to your thesis.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {STAGES.map(({ n, title, desc }) => (
                <div
                  key={n}
                  className="p-3.5 rounded-lg bg-stone-50/80 border border-stone-200/80 flex items-start gap-2.5 shadow-2xs"
                >
                  <span className="text-zinc-400 font-mono font-medium tabular-nums shrink-0 pt-px">
                    {n}
                  </span>
                  <div>
                    <div className="text-foreground font-medium font-sans">{title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keep-open notice — quiet, professional */}
          <div className="pt-1 text-xs text-muted-foreground/70 text-center">
            Research is running. Keep this page open until your Brief is ready.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
