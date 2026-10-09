import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

const mockOnAuthReady   = vi.mocked(window.sonos.onAuthReady);
const mockOnAuthExpired = vi.mocked(window.sonos.onAuthExpired);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnAuthReady.mockReturnValue(() => {});
  mockOnAuthExpired.mockReturnValue(() => {});
});

describe('useAuth', () => {
  it('returns false initially', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toBe(false);
  });

  it('sets true when onAuthReady fires', () => {
    let readyCb: (() => void) | undefined;
    mockOnAuthReady.mockImplementation((cb) => { readyCb = cb; return () => {}; });

    const { result } = renderHook(() => useAuth());
    expect(result.current).toBe(false);

    act(() => { readyCb?.(); });
    expect(result.current).toBe(true);
  });

  it('sets false when onAuthExpired fires after auth', () => {
    let readyCb: (() => void) | undefined;
    let expiredCb: (() => void) | undefined;
    mockOnAuthReady.mockImplementation((cb)   => { readyCb   = cb; return () => {}; });
    mockOnAuthExpired.mockImplementation((cb) => { expiredCb = cb; return () => {}; });

    const { result } = renderHook(() => useAuth());
    act(() => { readyCb?.(); });
    expect(result.current).toBe(true);

    act(() => { expiredCb?.(); });
    expect(result.current).toBe(false);
  });

  it('calls both unsub functions on unmount', () => {
    const unsubReady   = vi.fn();
    const unsubExpired = vi.fn();
    mockOnAuthReady.mockReturnValue(unsubReady);
    mockOnAuthExpired.mockReturnValue(unsubExpired);

    const { unmount } = renderHook(() => useAuth());
    unmount();
    expect(unsubReady).toHaveBeenCalled();
    expect(unsubExpired).toHaveBeenCalled();
  });
});
