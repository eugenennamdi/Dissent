'use client';

import React from 'react';
import type { InvalidationConditionV1 } from '@/core/contracts/stress-scenario';
import { getInvalidationUrgencyLabel } from '@/lib/formatters/market-formatters';

interface InvalidationMonitorProps {
  conditions: InvalidationConditionV1[];
  onSelectEvidence: (evidenceId: string) => void;
}

export function InvalidationMonitor({
  conditions,
  onSelectEvidence,
}: InvalidationMonitorProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-white font-sans flex items-center gap-2">
            <span>Invalidation Condition Monitor</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
              Thesis Review Triggers
            </span>
          </h3>
          <p className="text-xs font-mono text-[#7d8590] mt-0.5">
            Observable developments that would falsify the thesis. Not automated stop-losses or trade exits.
          </p>
        </div>

        <span className="text-xs font-mono text-[#7d8590]">
          {conditions.length} {conditions.length === 1 ? 'condition' : 'conditions'} defined
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {conditions.map((item) => {
          const { label: urgencyLabel, badgeStyle } = getInvalidationUrgencyLabel(item.urgency);

          return (
            <div
              key={item.id}
              className="border border-[#30363d] bg-[#161b22] rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Type and urgency badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className={`px-2 py-0.5 rounded border uppercase font-medium ${badgeStyle}`}>
                    {urgencyLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                    {item.type}
                  </span>
                </div>

                {/* Primary statement */}
                <div className="text-sm font-semibold text-white font-sans leading-snug">
                  {item.statement}
                </div>

                {/* Metric or Event Details */}
                {item.type === 'QUANTITATIVE' ? (
                  <div className="space-y-2 p-3 rounded bg-[#0d0f12] border border-[#21262d] text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#7d8590]">Target Metric:</span>
                      <span className="text-[#c9d1d9] font-medium">{item.targetMetric}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7d8590]">Trigger Threshold:</span>
                      <span className="text-rose-400 font-bold">{item.triggerThreshold}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#7d8590]">Timeframe:</span>
                      <span className="text-[#c9d1d9]">{item.timeframe}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#1c2128] pt-1.5 mt-1.5">
                      <span className="text-[#7d8590]">Observation Source:</span>
                      <span className="text-[#8b949e]">{item.observableDataSource}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 rounded bg-[#0d0f12] border border-[#21262d] text-xs font-sans">
                    <div>
                      <span className="text-[#7d8590] font-mono text-[10px] uppercase block mb-1">
                        Observable Event:
                      </span>
                      <span className="text-[#c9d1d9]">{item.observableEvent}</span>
                    </div>
                    <div className="pt-2 border-t border-[#1c2128] flex justify-between text-xs font-mono">
                      <span className="text-[#7d8590]">Verification Source:</span>
                      <span className="text-[#8b949e]">{item.verificationSource}</span>
                    </div>
                    {item.expectedWindow && (
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-[#7d8590]">Expected Window:</span>
                        <span className="text-[#8b949e]">{item.expectedWindow}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Linked Evidence */}
              {item.relevantEvidenceIds && item.relevantEvidenceIds.length > 0 && (
                <div className="pt-3 border-t border-[#21262d] flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-[#7d8590]">Baseline Evidence:</span>
                  {item.relevantEvidenceIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSelectEvidence(id)}
                      className="px-1.5 py-0.5 rounded bg-[#0d0f12] hover:bg-[#21262d] text-[#58a6ff] border border-[#30363d] cursor-pointer"
                    >
                      #{id.length > 10 ? `${id.slice(0, 8)}…` : id}
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
