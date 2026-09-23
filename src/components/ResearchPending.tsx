'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { formatElapsedSeconds } from '@/lib/formatters/market-formatters';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Activity, ShieldAlert, Cpu } from 'lucide-react';

interface ResearchPendingProps {
  thesis: string;
}

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
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                <Badge variant="warning" className="uppercase tracking-wider text-[10px] py-0 px-1.5 font-mono">
                  Research in Progress
                </Badge>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-foreground font-sans tracking-tight">
                Conducting Adversarial Analysis
              </h2>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="px-3 py-1.5 rounded-md bg-stone-50 border border-border text-muted-foreground flex items-center gap-1.5 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>Elapsed:</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {formatElapsedSeconds(elapsedSeconds)}
                </span>
              </div>
              <div className="text-muted-foreground text-[11px] hidden sm:block">
                Expected: ~40s
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 pt-0 space-y-6">
          {/* Verbatim Thesis Callout */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground flex items-center justify-between">
              <span>Thesis Under Investigation (Verbatim)</span>
              <span className="text-[10px] text-muted-foreground/60">Immutable Input</span>
            </div>
            <div className="p-4 rounded-lg bg-stone-50 border border-stone-200/80 text-sm text-foreground font-sans italic leading-relaxed shadow-2xs">
              &ldquo;{thesis}&rdquo;
            </div>
          </div>

          {/* Static Methodology Pipeline (Explicitly Informational, No Fabricated Streaming) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span className="uppercase tracking-wider font-medium text-foreground/80 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-zinc-700" />
                <span>Deterministic Research Pipeline</span>
              </span>
              <span className="text-[11px] text-muted-foreground">Synchronous Backend Loop</span>
            </div>

            <p className="text-xs font-mono text-muted-foreground/80 leading-relaxed">
              The backend executes in a single end-to-end pass. The stages below define the analytical methodology executed during this request:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="p-3.5 rounded-lg bg-stone-50/80 border border-stone-200/80 text-muted-foreground flex items-start gap-2.5 shadow-2xs">
                <span className="text-zinc-900 font-bold tabular-nums">01</span>
                <div>
                  <div className="text-foreground font-medium">Thesis Structuring</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Extracts target market, directional stance & testable axioms
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-stone-50/80 border border-stone-200/80 text-muted-foreground flex items-start gap-2.5 shadow-2xs">
                <span className="text-zinc-900 font-bold tabular-nums">02</span>
                <div>
                  <div className="text-foreground font-medium">Bitget Market Ingest</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Fetches live tickers, funding rates, open interest & depth
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-stone-50/80 border border-stone-200/80 text-muted-foreground flex items-start gap-2.5 shadow-2xs">
                <span className="text-zinc-900 font-bold tabular-nums">03</span>
                <div>
                  <div className="text-foreground font-medium">Parallel Debate</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Advocate Desk vs. Dissenter Desk grounded in facts
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-stone-50/80 border border-stone-200/80 text-muted-foreground flex items-start gap-2.5 shadow-2xs">
                <span className="text-zinc-900 font-bold tabular-nums">04</span>
                <div>
                  <div className="text-foreground font-medium">Assumption Stress & Synthesis</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Evaluates stress scenarios & compiles Dissent Brief
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Operational / Refresh Notice */}
          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/70 text-[11px] font-mono text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Do not refresh the page while research is active.</span>
            </div>
            <span className="text-amber-800/80">Stateless route timeout: 120s</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
