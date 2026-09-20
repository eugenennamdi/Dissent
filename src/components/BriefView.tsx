'use client';

import * as React from 'react';
import { useState } from 'react';
import type { DissentBriefV1 } from '@/core/contracts/brief';
import type { ArgumentV1 } from '@/core/contracts/argument';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import { ThesisOverviewCard } from './ThesisOverviewCard';
import { ArgumentationArena } from './ArgumentationArena';
import { ContradictionAlerts } from './ContradictionAlerts';
import { AssumptionStressLedger } from './AssumptionStressLedger';
import { ScenarioMatrix } from './ScenarioMatrix';
import { InvalidationMonitor } from './InvalidationMonitor';
import { UnknownsList } from './UnknownsList';
import { EvidenceInspector } from './EvidenceInspector';
import { HumanDecisionPanel } from './HumanDecisionPanel';
import { formatDurationMs } from '@/lib/formatters/market-formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Download,
  Check,
  AlertTriangle,
  FileCode,
  ShieldAlert,
} from 'lucide-react';

interface BriefViewProps {
  brief: DissentBriefV1;
  advocateCase: ArgumentV1;
  timingsMs: {
    structuring: number;
    marketResearch: number;
    argumentation: number;
    stressTesting: number;
    synthesis: number;
    total: number;
  };
  storageError: string | null;
  onSubmitDecision: (decision: HumanDecisionTypeV1, notes?: string) => Promise<void>;
  isSubmittingDecision: boolean;
  decisionError: string | null;
}

export function BriefView({
  brief,
  advocateCase,
  timingsMs,
  storageError,
  onSubmitDecision,
  isSubmittingDecision,
  decisionError,
}: BriefViewProps) {
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  const handleSelectEvidence = (evidenceId: string) => {
    setSelectedEvidenceId(evidenceId);
    // Smoothly scroll to evidence inspector if on screen
    const section = document.getElementById('evidence-ledger-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ brief, advocateCase, timingsMs }, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Fallback non-fatal
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-6 sm:py-10 px-4 space-y-8">
      {/* Top Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <Badge variant="highlight" className="gap-1.5 px-2.5 py-0.5 font-semibold">
              <span>RUN #{brief.runId.slice(0, 12)}…</span>
            </Badge>
            <span className="text-muted-foreground/60 hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3 text-muted-foreground/70" />
              <span>Total compute:</span>
              <span className="text-foreground font-medium tabular-nums">
                {formatDurationMs(timingsMs.total)}
              </span>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-foreground font-sans tracking-tight">
            Institutional Dissent Brief
          </h2>
        </div>

        {/* Action buttons and timings breakdown */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <details className="relative">
            <summary className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/80 hover:bg-accent text-muted-foreground hover:text-foreground border border-border/80 cursor-pointer select-none transition-colors">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Timings ({formatDurationMs(timingsMs.total)})</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 p-3 rounded-lg bg-card border border-border shadow-xl z-20 space-y-2 text-[11px] animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="font-semibold text-foreground border-b border-border/60 pb-1.5">
                Stage Execution Breakdown
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">1. Structuring:</span>
                <span className="text-foreground font-mono tabular-nums">{formatDurationMs(timingsMs.structuring)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">2. Market Research:</span>
                <span className="text-foreground font-mono tabular-nums">{formatDurationMs(timingsMs.marketResearch)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">3. Argumentation:</span>
                <span className="text-foreground font-mono tabular-nums">{formatDurationMs(timingsMs.argumentation)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">4. Stress Testing:</span>
                <span className="text-foreground font-mono tabular-nums">{formatDurationMs(timingsMs.stressTesting)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">5. Synthesis:</span>
                <span className="text-foreground font-mono tabular-nums">{formatDurationMs(timingsMs.synthesis)}</span>
              </div>
            </div>
          </details>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyJson}
            className="text-xs font-mono gap-1.5 h-8"
          >
            {copiedJson ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied JSON</span>
              </>
            ) : (
              <>
                <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Export JSON</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Storage Warning Banner (if local persistence failed, e.g. quota or private mode) */}
      {storageError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-start gap-2.5 animate-in fade-in-0 duration-150"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Local Storage Notice:</div>
            <div>{storageError}</div>
          </div>
        </div>
      )}

      {/* 1. Thesis Overview Card */}
      <section aria-label="Thesis Overview">
        <ThesisOverviewCard
          originalThesis={brief.originalThesis}
          structuredThesis={brief.structuredThesis}
          completedAt={brief.createdAt}
        />
      </section>

      {/* 2. Adversarial Arena (Advocate vs Dissenter) */}
      <section aria-label="Adversarial Debate Arena">
        <ArgumentationArena
          advocateCase={advocateCase}
          dissentCase={brief.theDissent}
          onSelectEvidence={handleSelectEvidence}
        />
      </section>

      {/* 3. Contradictions Section */}
      <section aria-label="Contradictions Identified">
        <ContradictionAlerts
          contradictions={brief.contradictions}
          onSelectEvidence={handleSelectEvidence}
        />
      </section>

      {/* 4. Assumption Stress Ledger */}
      <section aria-label="Assumption Stress Testing">
        <AssumptionStressLedger
          assumptions={brief.assumptions}
          onSelectEvidence={handleSelectEvidence}
        />
      </section>

      {/* 5. Stress Scenario Matrix */}
      <section aria-label="Stress Scenarios">
        <ScenarioMatrix
          scenarios={brief.stressScenarios}
          onSelectEvidence={handleSelectEvidence}
        />
      </section>

      {/* 6. Invalidation Condition Monitor */}
      <section aria-label="Invalidation Conditions">
        <InvalidationMonitor
          conditions={brief.invalidationConditions}
          onSelectEvidence={handleSelectEvidence}
        />
      </section>

      {/* 7. Research Unknowns & Blind Spots */}
      <section aria-label="Research Limitations">
        <UnknownsList unknowns={brief.unknowns} />
      </section>

      {/* 8. Evidence Ledger & Provenance */}
      <section aria-label="Evidence Ledger">
        <EvidenceInspector
          ledger={brief.evidenceLedger}
          selectedEvidenceId={selectedEvidenceId}
          onClearSelectedEvidence={() => setSelectedEvidenceId(null)}
        />
      </section>

      {/* 9. Human Decision Panel */}
      <section aria-label="Human Trading Decision">
        <HumanDecisionPanel
          runId={brief.runId}
          thesisId={brief.structuredThesis.id}
          existingDecision={brief.humanDecision}
          onSubmitDecision={onSubmitDecision}
          isSubmitting={isSubmittingDecision}
          errorMessage={decisionError}
        />
      </section>

      {/* 10. Legal & Operational Invariant Disclaimer */}
      <footer className="pt-6 border-t border-border/60 text-center text-xs font-mono text-muted-foreground/80 leading-relaxed max-w-3xl mx-auto space-y-2">
        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-foreground">Operational Invariant & Disclaimer</span>
        </div>
        <p>{brief.disclaimer}</p>
      </footer>
    </div>
  );
}
