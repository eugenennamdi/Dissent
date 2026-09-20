'use client';

import React from 'react';
import type { StressScenarioV1 } from '@/core/contracts/stress-scenario';
import { getPlausibilityStyle } from '@/lib/formatters/market-formatters';

interface ScenarioMatrixProps {
  scenarios: StressScenarioV1[];
  onSelectEvidence: (evidenceId: string) => void;
}

export function ScenarioMatrix({ scenarios, onSelectEvidence }: ScenarioMatrixProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-white font-sans flex items-center gap-2">
            <span>Stress Scenario Matrix</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
              Hypothetical Regimes
            </span>
          </h3>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Structured alternatives that would invalidate key axioms. Not market predictions.
          </p>
        </div>

        <span className="text-xs font-mono text-[#7d8590]">
          {scenarios.length} {scenarios.length === 1 ? 'scenario' : 'scenarios'} generated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scenarios.map((sc) => {
          const plausibilityClass = getPlausibilityStyle(sc.plausibility);

          return (
            <div
              key={sc.id}
              className="border border-[#30363d] bg-[#161b22] rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Plausibility and scenario type */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className={`px-2 py-0.5 rounded border uppercase font-medium ${plausibilityClass}`}>
                    {sc.plausibility} Plausibility
                  </span>
                  <span className="text-[#7d8590] uppercase">{sc.scenarioType.replace(/_/g, ' ')}</span>
                </div>

                {/* Scenario title and narrative */}
                <div>
                  <h4 className="text-sm font-semibold text-white font-sans">{sc.name}</h4>
                  <p className="text-xs text-[#c9d1d9] font-sans leading-relaxed mt-1">
                    {sc.description}
                  </p>
                </div>

                {/* Transmission mechanism */}
                <div className="space-y-1 text-xs">
                  <div className="font-mono text-[#7d8590] uppercase text-[10px]">
                    Transmission Mechanism:
                  </div>
                  <div className="text-[#8b949e] font-sans bg-[#0d0f12] p-2.5 rounded border border-[#21262d]">
                    {sc.transmissionMechanism}
                  </div>
                </div>

                {/* Consequence for thesis */}
                <div className="space-y-1 text-xs">
                  <div className="font-mono text-rose-400 uppercase text-[10px]">
                    Consequence for Thesis:
                  </div>
                  <div className="text-rose-200/90 font-sans bg-rose-950/20 p-2.5 rounded border border-rose-500/20">
                    {sc.consequenceForThesis}
                  </div>
                </div>

                {/* Uncertainties */}
                {sc.uncertainties.length > 0 && (
                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-[#7d8590] uppercase text-[10px]">
                      Explicit Uncertainties:
                    </div>
                    <ul className="list-disc pl-4 text-[#8b949e] font-sans text-[11px] space-y-0.5">
                      {sc.uncertainties.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Relevant evidence context */}
              {sc.relevantEvidenceIds.length > 0 && (
                <div className="pt-3 border-t border-[#21262d] flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-[#7d8590]">Context Evidence:</span>
                  {sc.relevantEvidenceIds.map((evId) => (
                    <button
                      key={evId}
                      type="button"
                      onClick={() => onSelectEvidence(evId)}
                      className="px-1.5 py-0.5 rounded bg-[#0d0f12] hover:bg-[#21262d] text-[#58a6ff] border border-[#30363d] cursor-pointer"
                    >
                      #{evId.length > 10 ? `${evId.slice(0, 8)}…` : evId}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
