import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Splash } from '../Splash';

describe('Splash', () => {
  it('renders the True Tunes name', () => {
    render(<Splash ready={false} />);
    expect(screen.getByText('True Tunes')).toBeInTheDocument();
  });

  it('is visible before ready', () => {
    const { container } = render(<Splash ready={false} />);
    expect(container.querySelector('[class*="splash"]')).toBeTruthy();
  });

  it('disappears after ready + fade timeout', () => {
    vi.useFakeTimers();
    const { container } = render(<Splash ready={true} />);
    // After 900ms remaining + 450ms fade
    act(() => { vi.advanceTimersByTime(1400); });
    expect(container.firstChild).toBeNull();
    vi.useRealTimers();
  });
});
