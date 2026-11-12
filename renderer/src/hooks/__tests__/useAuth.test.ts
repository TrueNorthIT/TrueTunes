import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth, useAuthFailure } from '../useAuth';

const mockOnAuthReady = vi.mocked(window.sonos.onAuthReady);
const mockOnAuthExpired = vi.mocked(window.sonos.onAuthExpired);
const mockOnAuthFailed = vi.mocked(window.sonos.onAuthFailed);
const mockRetry = vi.mocked(window.sonos.retrySonosAuth);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnAuthReady.mockReturnValue(() => {});
  mockOnAuthExpired.mockReturnValue(() => {});
  mockOnAuthFailed.mockReturnValue(() => {});
  mockRetry.mockResolvedValue(undefined);
});

describe('useAuth', () => {
  it('returns false initially', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current).toBe(false);
  });

  it('sets true when onAuthReady fires', () => {
    let readyCb: (() => void) | undefined;
    mockOnAuthReady.mockImplementation((cb) => {
      readyCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    expect(result.current).toBe(false);

    act(() => {
      readyCb?.();
    });
    expect(result.current).toBe(true);
  });

  it('sets false when onAuthExpired fires after auth', () => {
    let readyCb: (() => void) | undefined;
    let expiredCb: (() => void) | undefined;
    mockOnAuthReady.mockImplementation((cb) => {
      readyCb = cb;
      return () => {};
    });
    mockOnAuthExpired.mockImplementation((cb) => {
      expiredCb = cb;
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    act(() => {
      readyCb?.();
    });
    expect(result.current).toBe(true);

    act(() => {
      expiredCb?.();
    });
    expect(result.current).toBe(false);
  });

  it('calls both unsub functions on unmount', () => {
    const unsubReady = vi.fn();
    const unsubExpired = vi.fn();
    mockOnAuthReady.mockReturnValue(unsubReady);
    mockOnAuthExpired.mockReturnValue(unsubExpired);

    const { unmount } = renderHook(() => useAuth());
    unmount();
    expect(unsubReady).toHaveBeenCalled();
    expect(unsubExpired).toHaveBeenCalled();
  });
});

describe('useAuthFailure', () => {
  function capture() {
    const cbs: { failed?: () => void; ready?: () => void } = {};
    mockOnAuthFailed.mockImplementation((cb) => {
      cbs.failed = cb;
      return () => {};
    });
    mockOnAuthReady.mockImplementation((cb) => {
      cbs.ready = cb;
      return () => {};
    });
    return cbs;
  }

  it('is not failed initially', () => {
    const { result } = renderHook(() => useAuthFailure());
    expect(result.current.failed).toBe(false);
  });

  it('is failed after onAuthFailed and clears on onAuthReady', () => {
    const cbs = capture();
    const { result } = renderHook(() => useAuthFailure());
    act(() => cbs.failed?.());
    expect(result.current.failed).toBe(true);
    act(() => cbs.ready?.());
    expect(result.current.failed).toBe(false);
  });

  it('retry clears the error and asks the main process to try again', () => {
    const cbs = capture();
    const { result } = renderHook(() => useAuthFailure());
    act(() => cbs.failed?.());
    act(() => result.current.retry());
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it('shows the error again when the retry call itself rejects', async () => {
    mockRetry.mockRejectedValueOnce(new Error('ipc'));
    const { result } = renderHook(() => useAuthFailure());
    await act(async () => result.current.retry());
    expect(result.current.failed).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const unsubFailed = vi.fn();
    mockOnAuthFailed.mockReturnValue(unsubFailed);
    const { unmount } = renderHook(() => useAuthFailure());
    unmount();
    expect(unsubFailed).toHaveBeenCalled();
  });
});
