import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiagnosticsPage } from '../DiagnosticsPage';
import { measureLayout } from '../measureLayout';

describe('DiagnosticsPage layout section', () => {
  beforeEach(() => {
    // jsdom has no matchMedia
    window.matchMedia = ((q: string) => ({ matches: false, media: q }) as MediaQueryList) as typeof window.matchMedia;
  });

  it('lists the measurements and measures again on request', async () => {
    render(<DiagnosticsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Measure again' }));
    expect(screen.getByText(/^screen:/)).not.toBeNull();
    expect(screen.getByText(/^height 100dvh:/)).not.toBeNull();
    expect(screen.getByText(/^--dock-h:/)).not.toBeNull();
    expect(screen.getByText(/gap under the tab labels/)).not.toBeNull();
  });

  it('derives the gap under the tab labels from the last label', () => {
    document.body.innerHTML = `<nav data-diag="tabs"><a><span>i</span><span id="l">More</span></a></nav>`;
    document.getElementById('l')!.getBoundingClientRect = () => ({ bottom: window.innerHeight - 21 }) as DOMRect;
    expect(measureLayout().derived[0]).toBe('gap under the tab labels: 21px');
    document.body.innerHTML = '';
  });
});
