'use client';

import * as React from 'react';
import type { StructuredThesisV1 } from '@/core/contracts/thesis';
import { formatUtcDateTime } from '@/lib/formatters/market-formatters';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, TrendingDown, Clock, Layers, Zap } from 'lucide-react';

interface ThesisOverviewCardProps {
  originalThesis: string;
  structuredThesis: StructuredThesisV1;
  completedAt: string;
}

export function ThesisOverviewCard({
  originalThesis,
  structuredThesis,
  completedAt,
}: ThesisOverviewCardProps) {
  const isLongOrOutperform =
    structuredThesis.direction === 'LONG' ||
    structuredThesis.direction === 'RELATIVE_LONG';

  return (
    <Card className="border-border/80 bg-card shadow-sm">
      {/* Header and completion timestamp */}
      <CardHeader className="p-4 sm:p-5 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider text-[11px]">
              <Target className="w-3.5 h-3.5 text-sky-400" />
              <span>Target Asset / Pair:</span>
            </div>
            <Badge variant="secondary" className="font-bold text-foreground text-xs px-2.5 py-0.5">
              {structuredThesis.market}
            </Badge>
            <Badge
              variant={isLongOrOutperform ? 'supporting' : 'contradicting'}
              className="font-medium text-xs px-2.5 py-0.5 gap-1"
            >
              {isLongOrOutperform ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{structuredThesis.direction}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
            <Clock className="w-3 h-3 text-muted-foreground/70" />
            <span>Assembled:</span>
            <span className="text-foreground font-medium tabular-nums">
              {formatUtcDateTime(completedAt)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* Verbatim Trader Conviction vs AI Structured Interpretation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Verbatim input (Immutable) */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-foreground/90 font-medium">
                <span>Trader Conviction</span>
                <span className="text-[10px] text-muted-foreground normal-case font-normal">
                  (Verbatim)
                </span>
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground">
                Immutable Input
              </Badge>
            </div>
            <div className="p-4 rounded-lg bg-background/80 border border-border/60 text-sm text-foreground font-sans leading-relaxed min-h-[96px] relative shadow-inner">
              <span className="text-muted-foreground/50 text-base select-none">&ldquo;</span>
              <span className="text-foreground/95 italic font-sans">{originalThesis}</span>
              <span className="text-muted-foreground/50 text-base select-none">&rdquo;</span>
            </div>
          </div>

          {/* Structured claim (Falsifiable Proposition) */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-foreground/90 font-medium">
                <span>Structured Claim</span>
                <span className="text-[10px] text-muted-foreground normal-case font-normal">
                  (Falsifiable)
                </span>
              </span>
              <Badge variant="highlight" className="text-[10px] py-0 px-1.5 font-mono">
                AI Extracted
              </Badge>
            </div>
            <div className="p-4 rounded-lg bg-background/80 border border-border/60 text-sm text-muted-foreground font-sans leading-relaxed min-h-[96px] flex flex-col justify-between shadow-inner">
              <div className="text-foreground/90 font-medium">{structuredThesis.claim}</div>
              <div className="pt-3 flex flex-wrap items-center gap-3.5 text-xs font-mono text-muted-foreground border-t border-border/40 mt-3">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground/70" />
                  <span>Horizon:</span>
                  <span className="text-foreground font-medium tabular-nums ml-0.5">
                    {structuredThesis.timeHorizon.description}
                    {structuredThesis.timeHorizon.estimatedHours !== undefined
                      ? ` (~${structuredThesis.timeHorizon.estimatedHours}h)`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-muted-foreground/70" />
                  <span>Pair:</span>
                  <span className="text-foreground font-medium ml-0.5">
                    {structuredThesis.baseAsset} / {structuredThesis.quoteAsset}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Catalysts identified */}
        {structuredThesis.catalysts && structuredThesis.catalysts.length > 0 && (
          <div className="pt-3 border-t border-border/40 flex flex-wrap items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Extracted Catalysts:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {structuredThesis.catalysts.map((cat, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="bg-card text-foreground/90 border-border/80 px-2 py-0.5 text-xs font-mono"
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
