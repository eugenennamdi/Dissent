import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { Dialog } from '@/components/ui/dialog';
import { ArchitectureViewer, PILLARS } from '@/components/ArchitectureModal';

const cleanHtml = (html: string) => html.replace(/<!-- -->/g, '');

const renderViewer = (props: React.ComponentProps<typeof ArchitectureViewer>) => {
  return cleanHtml(
    renderToString(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(ArchitectureViewer, props)
      )
    )
  );
};

describe('ArchitectureModal & Viewer Components', () => {
  it('contains all 3 architectural pillars in PILLARS configuration', () => {
    expect(PILLARS).toHaveLength(3);
    expect(PILLARS.map((p) => p.title)).toEqual([
      'Market Facts',
      'Adversarial Arena',
      'Human Decision',
    ]);
  });

  it('renders Step 1 (Market Facts) content by default', () => {
    const html = renderViewer({
      activeStep: 0,
      onSelectStep: vi.fn(),
      onPrev: vi.fn(),
      onNext: vi.fn(),
    });

    // Modal Header
    expect(html).toContain('The Dissent Architecture');
    expect(html).toContain('How Dissent transforms subjective conviction');

    // Stepper Navigation Tabs
    expect(html).toContain('01');
    expect(html).toContain('Market Facts');
    expect(html).toContain('02');
    expect(html).toContain('Adversarial Arena');
    expect(html).toContain('03');
    expect(html).toContain('Human Decision');

    // Step 01 Content
    expect(html).toContain('Bitget V3 Public Endpoints');
    expect(html).toContain('Cryptographic Provenance');
    expect(html).toContain('Read-Only Security');

    // Navigation Controls
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
    expect(html).toContain('aria-label="Jump to step 1"');
  });

  it('renders Step 2 (Adversarial Arena) content when activeStep is 1', () => {
    const html = renderViewer({
      activeStep: 1,
      onSelectStep: vi.fn(),
      onPrev: vi.fn(),
      onNext: vi.fn(),
    });

    expect(html).toContain('Adversarial Arena');
    expect(html).toContain('Dual-Desk Construct');
    expect(html).toContain('Assumption Testing');
    expect(html).toContain('Causal Shock Scenarios');
    expect(html).toContain('aria-label="Jump to step 2"');
  });

  it('renders Step 3 (Human Decision) content when activeStep is 2', () => {
    const html = renderViewer({
      activeStep: 2,
      onSelectStep: vi.fn(),
      onPrev: vi.fn(),
      onNext: vi.fn(),
    });

    expect(html).toContain('Human Decision');
    expect(html).toContain('Strict Human Invariant');
    expect(html).toContain('Explicit Operator Actions');
    expect(html).toContain('Verbatim Thesis Integrity');
    expect(html).toContain('aria-label="Jump to step 3"');
  });
});
