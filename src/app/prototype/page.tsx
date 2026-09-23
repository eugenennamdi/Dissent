'use client';

import * as React from 'react';
import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { EvidenceV1 } from '@/core/contracts/evidence';
import type { HumanDecisionTypeV1 } from '@/core/contracts/human-decision';
import {
  PROTOTYPE_BRIEF,
  PROTOTYPE_ADVOCATE_CASE,
} from './prototype-fixture';
import { VariantA } from './variant-a';
import { VariantB } from './variant-b';
import { VariantC } from './variant-c';
import { PrototypeSwitcher, type PrototypeVariantMeta } from './prototype-switcher';
import { EvidenceDetailDialog } from '@/components/EvidenceDetailDialog';

const PROTOTYPE_VARIANTS: PrototypeVariantMeta[] = [
  {
    id: 'A',
    name: 'Executive Memo',
    subtitle: 'Editorial Financial Research Publication',
  },
  {
    id: 'B',
    name: 'Split Terminal',
    subtitle: 'Institutional Research Desk',
  },
  {
    id: 'C',
    name: 'Debate Arena',
    subtitle: 'Adversarial Collision Focus',
  },
];

function PrototypeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawVariant = searchParams.get('variant')?.toUpperCase() ?? 'A';
  const initialVariant = ['A', 'B', 'C'].includes(rawVariant) ? rawVariant : 'A';

  const [currentVariant, setCurrentVariant] = useState<string>(initialVariant);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceV1 | null>(null);
  const [humanDecision, setHumanDecision] = useState<{
    decision: HumanDecisionTypeV1;
    rationale: string;
    decidedAt: string;
  } | null>(null);

  const handleSelectVariant = (variantId: string) => {
    setCurrentVariant(variantId);
    const params = new URLSearchParams(window.location.search);
    params.set('variant', variantId);
    router.replace(`?${params.toString()}`);
  };

  const handleCommitDecision = (decision: HumanDecisionTypeV1, rationale: string) => {
    setHumanDecision({
      decision,
      rationale,
      decidedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="relative min-h-screen bg-[#080a0f]">
      {currentVariant === 'A' && (
        <VariantA
          brief={PROTOTYPE_BRIEF}
          advocateCase={PROTOTYPE_ADVOCATE_CASE}
          onSelectEvidence={setSelectedEvidence}
          humanDecision={humanDecision}
          onCommitDecision={handleCommitDecision}
        />
      )}

      {currentVariant === 'B' && (
        <VariantB
          brief={PROTOTYPE_BRIEF}
          advocateCase={PROTOTYPE_ADVOCATE_CASE}
          onSelectEvidence={setSelectedEvidence}
          humanDecision={humanDecision}
          onCommitDecision={handleCommitDecision}
        />
      )}

      {currentVariant === 'C' && (
        <VariantC
          brief={PROTOTYPE_BRIEF}
          advocateCase={PROTOTYPE_ADVOCATE_CASE}
          onSelectEvidence={setSelectedEvidence}
          humanDecision={humanDecision}
          onCommitDecision={handleCommitDecision}
        />
      )}

      {/* Shared Non-Disruptive Evidence Inspection Modal */}
      <EvidenceDetailDialog
        evidence={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />

      {/* Floating Prototype Switcher per UI.md */}
      <PrototypeSwitcher
        variants={PROTOTYPE_VARIANTS}
        currentVariantId={currentVariant}
        onSelectVariant={handleSelectVariant}
      />
    </div>
  );
}

export default function PrototypePage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-400 font-mono text-xs">Loading Dissent Prototype...</div>}>
      <PrototypeContent />
    </Suspense>
  );
}
