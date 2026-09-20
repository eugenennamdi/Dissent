'use client';

import React, { useEffect, useState } from 'react';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  type ResearchSuccessResponseV1,
  ResearchSuccessResponseV1Schema,
  ApiFailureResponseV1Schema,
  HumanDecisionSuccessResponseV1Schema,
} from '@/lib/api/contracts';
import {
  type StoredResearchRunV1,
  loadStoredRuns,
  getActiveOrLatestRun,
  saveResearchRun,
  updateStoredDecision,
  deleteStoredRun,
  clearAllStoredRuns,
  setActiveRunId,
} from '@/lib/storage/local-brief-store';
import { WorkstationHeader } from '@/components/WorkstationHeader';
import { ThesisComposer } from '@/components/ThesisComposer';
import { ResearchPending } from '@/components/ResearchPending';
import { BriefView } from '@/components/BriefView';
import { ResearchHistoryDrawer } from '@/components/ResearchHistoryDrawer';

export default function Home() {
  const [view, setView] = useState<'COMPOSE' | 'RESEARCH' | 'BRIEF'>('COMPOSE');
  const [activeThesis, setActiveThesis] = useState('');
  const [activeRun, setActiveRun] = useState<StoredResearchRunV1 | null>(null);

  // Loading & Error states
  const [isSubmittingResearch, setIsSubmittingResearch] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // History state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<StoredResearchRunV1[]>([]);

  // Rehydrate latest saved research run on initial load
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const runs = loadStoredRuns();
      setHistoryRuns(runs);

      const latest = getActiveOrLatestRun();
      if (latest) {
        setActiveRun(latest);
        setActiveThesis(latest.brief.originalThesis);
        setView('BRIEF');
      }
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  // Handle thesis submission to real POST /api/research
  const handleResearchSubmit = async (thesis: string) => {
    setIsSubmittingResearch(true);
    setResearchError(null);
    setStorageError(null);
    setActiveThesis(thesis);
    setView('RESEARCH');

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ thesis }),
      });

      const rawJson = await response.json();

      if (response.ok && rawJson.ok === true && rawJson.state === 'COMPLETED') {
        const validated = ResearchSuccessResponseV1Schema.safeParse(rawJson);
        if (!validated.success) {
          throw new Error(
            `Malformed API research response: ${validated.error.issues[0]?.message ?? 'Validation failed'}`
          );
        }

        const data: ResearchSuccessResponseV1 = validated.data;
        const newRun: StoredResearchRunV1 = {
          runId: data.runId,
          thesisId: data.brief.structuredThesis.id,
          brief: data.brief,
          advocateCase: data.advocateCase,
          timingsMs: data.timingsMs,
          savedAt: new Date().toISOString(),
        };

        // Persist to local storage
        const saveResult = saveResearchRun(newRun);
        if (saveResult.ok) {
          setHistoryRuns(loadStoredRuns());
        } else {
          setStorageError(saveResult.error ?? 'Failed to save to browser storage.');
        }

        setActiveRun(newRun);
        setView('BRIEF');
      } else {
        // Handle failed research response
        const failParsed = ApiFailureResponseV1Schema.safeParse(rawJson);
        if (failParsed.success) {
          setResearchError(
            `Research failed [${failParsed.data.error.code}]: ${failParsed.data.error.message}`
          );
        } else {
          setResearchError(
            rawJson?.error?.message ??
              'The research request could not be completed by the server.'
          );
        }
        setView('COMPOSE');
      }
    } catch (err) {
      setResearchError(
        err instanceof Error
          ? err.message
          : 'Network failure or server timeout while communicating with the research engine.'
      );
      setView('COMPOSE');
    } finally {
      setIsSubmittingResearch(false);
    }
  };

  // Handle explicit human decision submission to real POST /api/decisions
  const handleDecisionSubmit = async (decision: HumanDecisionTypeV1, notes?: string) => {
    if (!activeRun) return;

    setIsSubmittingDecision(true);
    setDecisionError(null);

    try {
      const payload = {
        runId: activeRun.runId,
        thesisId: activeRun.thesisId,
        decision,
        notes,
        confirmedByUser: true as const,
      };

      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const rawJson = await response.json();

      if (response.ok && rawJson.ok === true && rawJson.state === 'RECORDED') {
        const validated = HumanDecisionSuccessResponseV1Schema.safeParse(rawJson);
        if (!validated.success) {
          throw new Error('Malformed decision response from server.');
        }

        const recordedDecision = validated.data.decision;

        // Update local state
        const updatedRun: StoredResearchRunV1 = {
          ...activeRun,
          brief: {
            ...activeRun.brief,
            humanDecision: recordedDecision,
          },
        };

        setActiveRun(updatedRun);

        // Update stored run
        updateStoredDecision(activeRun.runId, activeRun.thesisId, recordedDecision);
        setHistoryRuns(loadStoredRuns());
      } else {
        const failParsed = ApiFailureResponseV1Schema.safeParse(rawJson);
        if (failParsed.success) {
          setDecisionError(failParsed.data.error.message);
        } else {
          setDecisionError(rawJson?.error?.message ?? 'Failed to record decision.');
        }
      }
    } catch (err) {
      setDecisionError(
        err instanceof Error ? err.message : 'Network error recording decision.'
      );
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Navigation handlers
  const handleNewThesis = () => {
    setActiveRunId(null);
    setResearchError(null);
    setStorageError(null);
    setDecisionError(null);
    setView('COMPOSE');
  };

  const handleSelectRun = (run: StoredResearchRunV1) => {
    setActiveRunId(run.runId);
    setActiveRun(run);
    setActiveThesis(run.brief.originalThesis);
    setResearchError(null);
    setStorageError(null);
    setDecisionError(null);
    setView('BRIEF');
  };

  const handleDeleteRun = (runId: string) => {
    deleteStoredRun(runId);
    const updated = loadStoredRuns();
    setHistoryRuns(updated);
    if (activeRun?.runId === runId) {
      if (updated.length > 0) {
        handleSelectRun(updated[0]!);
      } else {
        handleNewThesis();
      }
    }
  };

  const handleClearAllHistory = () => {
    clearAllStoredRuns();
    setHistoryRuns([]);
    handleNewThesis();
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#e6edf3] flex flex-col font-sans selection:bg-[#58a6ff]/30 selection:text-white">
      {/* Top Workspace Header */}
      <WorkstationHeader
        currentView={view}
        onNewThesis={handleNewThesis}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={historyRuns.length}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 flex flex-col">
        {view === 'COMPOSE' && (
          <ThesisComposer
            onSubmit={handleResearchSubmit}
            isSubmitting={isSubmittingResearch}
            errorMessage={researchError}
            onClearError={() => setResearchError(null)}
          />
        )}

        {view === 'RESEARCH' && <ResearchPending thesis={activeThesis} />}

        {view === 'BRIEF' && activeRun && (
          <BriefView
            brief={activeRun.brief}
            advocateCase={activeRun.advocateCase}
            timingsMs={activeRun.timingsMs}
            storageError={storageError}
            onSubmitDecision={handleDecisionSubmit}
            isSubmittingDecision={isSubmittingDecision}
            decisionError={decisionError}
          />
        )}
      </main>

      {/* History Drawer */}
      <ResearchHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        runs={historyRuns}
        activeRunId={activeRun?.runId ?? null}
        onSelectRun={handleSelectRun}
        onDeleteRun={handleDeleteRun}
        onClearAll={handleClearAllHistory}
      />
    </div>
  );
}
