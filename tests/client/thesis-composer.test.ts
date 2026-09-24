import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ThesisComposer } from '@/components/ThesisComposer';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

describe('ThesisComposer Component', () => {
  it('renders the masthead, input field, presets, and architecture highlights', () => {
    const html = cleanHtml(
      renderToString(
        React.createElement(ThesisComposer, {
          onSubmit: vi.fn(),
          isSubmitting: false,
          errorMessage: null,
          onClearError: vi.fn(),
        })
      )
    );

    // Masthead & Value Prop
    expect(html).toContain('Stress-test the trade before the market does.');
    expect(html).toContain('native US equities (NVDA, COIN, MSFT, MSTR, TSLA, AAPL, AMD, META)');

    // Composer Input & Presets
    expect(html).toContain('thesis-input');
    expect(html).toContain('NVDA will sustain its upward valuation trajectory over the next 90 days');
    expect(html).toContain('Try thesis:');
    expect(html).toContain('NVDA Valuation Support');
    expect(html).toContain('COIN Volume Hypothesis');
    expect(html).toContain('MSFT Enterprise Stability');
    expect(html).toContain('TSLA Multiple Compression');
    expect(html).toContain('MSTR Multiple Scrutiny');

    // Action Dock
    expect(html).toContain('5-stage adversarial synthesis (~40s)');
    expect(html).toContain('Challenge thesis');

    // Footer & Architecture Modal Trigger
    expect(html).toContain('View Architecture');
    expect(html).toContain('Powered by');
    expect(html).toContain('Bitget MCP');
    expect(html).not.toContain('01 / Grounding');
    expect(html).not.toContain('Bitget Public V2 Endpoints');
    expect(html).not.toContain('operating and earnings deficits');
  });

  it('renders error alert when errorMessage is passed', () => {
    const errorMessage = 'Bitget orderbook rate limit exceeded.';
    const html = cleanHtml(
      renderToString(
        React.createElement(ThesisComposer, {
          onSubmit: vi.fn(),
          isSubmitting: false,
          errorMessage,
          onClearError: vi.fn(),
        })
      )
    );

    expect(html).toContain(errorMessage);
    expect(html).toContain('Dismiss');
  });

  it('renders submitting state spinner and label when isSubmitting is true', () => {
    const html = cleanHtml(
      renderToString(
        React.createElement(ThesisComposer, {
          onSubmit: vi.fn(),
          isSubmitting: true,
          errorMessage: null,
          onClearError: vi.fn(),
        })
      )
    );

    expect(html).toContain('Synthesizing...');
  });
});
