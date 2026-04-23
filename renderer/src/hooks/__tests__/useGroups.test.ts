import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGroups } from '../useGroups';
import type { GroupInfo } from '../../types/sonos';

const mockOnWsGroups = vi.mocked(window.sonos.onWsGroups);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnWsGroups.mockReturnValue(() => {});
});

const group: GroupInfo = {
  id: 'g:1',
  coordinatorId: 'RINCON_1',
  name: 'Living Room',
  playerIds: ['RINCON_1'],
};

describe('useGroups', () => {
  it('returns empty array initially', () => {
    const { result } = renderHook(() => useGroups());
    expect(result.current).toEqual([]);
  });

  it('registers onWsGroups listener on mount', () => {
    renderHook(() => useGroups());
    expect(mockOnWsGroups).toHaveBeenCalledOnce();
  });

  it('updates when WS fires group data', () => {
    let captured: ((groups: unknown[]) => void) | undefined;
    mockOnWsGroups.mockImplementation((cb: (groups: unknown[]) => void) => { captured = cb; return () => {}; });

    const { result } = renderHook(() => useGroups());
    expect(result.current).toEqual([]);

    act(() => { captured?.([group]); });
    expect(result.current).toEqual([group]);
  });

  it('calls the unsub function on unmount', () => {
    const unsub = vi.fn();
    mockOnWsGroups.mockReturnValue(unsub);
    const { unmount } = renderHook(() => useGroups());
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
