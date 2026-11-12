import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

  it('shows the error and a Retry button that calls onRetry when failed', () => {
    const onRetry = vi.fn();
    render(<Splash ready={false} failed onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach Sonos sign-in.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no Retry button while loading', () => {
    render(<Splash ready={false} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('disappears after ready + fade timeout', () => {
    vi.useFakeTimers();
    const { container } = render(<Splash ready={true} />);
    // After 900ms remaining + 450ms fade
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(container.firstChild).toBeNull();
    vi.useRealTimers();
  });
});
