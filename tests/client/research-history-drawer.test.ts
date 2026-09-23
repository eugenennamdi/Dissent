import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ResearchHistoryDrawer } from '@/components/ResearchHistoryDrawer';
import type { StoredResearchRunV1 } from '@/lib/storage/local-brief-store';
import { PROTOTYPE_BRIEF, PROTOTYPE_ADVOCATE_CASE } from '@/app/prototype/prototype-fixture';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

describe('ResearchHistoryDrawer Component', () => {
  const mockRun: StoredResearchRunV1 = {
    runId: 'run_inp_bc1234567890abcdef',
    thesisId: 'th_eth_btc_48h',
    brief: PROTOTYPE_BRIEF,
    advocateCase: PROTOTYPE_ADVOCATE_CASE,
    timingsMs: {
      structuring: 500,
      marketResearch: 1000,
      argumentation: 1500,
      stressTesting: 1000,
      synthesis: 500,
      total: 4500,
    },
    savedAt: '2026-09-22T06:12:26.000Z',
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      React.createElement(ResearchHistoryDrawer, {
        isOpen: false,
        onClose: () => {},
        runs: [mockRun],
        activeRunId: null,
        onSelectRun: () => {},
        onDeleteRun: () => {},
        onClearAll: () => {},
      })
    );
    expect(html).toBe('');
  });

  it('renders research history runs with market, thesis, and evidence counts when isOpen is true', () => {
    const html = cleanHtml(
      renderToString(
        React.createElement(ResearchHistoryDrawer, {
          isOpen: true,
          onClose: () => {},
          runs: [mockRun],
          activeRunId: mockRun.runId,
          onSelectRun: () => {},
          onDeleteRun: () => {},
          onClearAll: () => {},
        })
      )
    );

    // Header & summary
    expect(html).toContain('Research History');
    expect(html).toContain('1');

    // Run Card Content
    expect(html).toContain('ETH/BTC');
    expect(html).toContain('Active');
    expect(html).toContain(mockRun.brief.originalThesis);
    expect(html).toContain('Evidence');
    expect(html).toContain('Triggers');

    // Truncated Run ID
    expect(html).toContain('#run_inp_bc…cdef');
    expect(html).toContain('Clear all history');
  });

  it('renders empty state when runs array is empty', () => {
    const html = cleanHtml(
      renderToString(
        React.createElement(ResearchHistoryDrawer, {
          isOpen: true,
          onClose: () => {},
          runs: [],
          activeRunId: null,
          onSelectRun: () => {},
          onDeleteRun: () => {},
          onClearAll: () => {},
        })
      )
    );

    expect(html).toContain('No research runs stored yet');
    expect(html).not.toContain('Clear all history');
  });
});
