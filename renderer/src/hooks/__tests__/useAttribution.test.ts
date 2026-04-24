import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAttribution } from '../useAttribution';

const mockOnAttributionMap   = vi.mocked(window.sonos.onAttributionMap);
const mockOnAttributionEvent = vi.mocked(window.sonos.onAttributionEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnAttributionMap.mockReturnValue(() => {});
  mockOnAttributionEvent.mockReturnValue(() => {});
});

describe('useAttribution', () => {
  it('returns empty map initially', () => {
    const { result } = renderHook(() => useAttribution());
    expect(result.current).toEqual({});
  });

  it('registers attribution map listener on mount', () => {
    renderHook(() => useAttribution());
    expect(mockOnAttributionMap).toHaveBeenCalledOnce();
  });

  it('updates map when onAttributionMap fires', () => {
    let mapCb: ((map: AttributionMap) => void) | undefined;
    mockOnAttributionMap.mockImplementation((cb) => { mapCb = cb; return () => {}; });

    const { result } = renderHook(() => useAttribution());
    act(() => {
      mapCb?.({ 'uri:1': { user: 'alice', timestamp: 1234, trackName: 'Song', artist: 'Artist' } });
    });
    expect(result.current['uri:1'].user).toBe('alice');
  });

  it('merges new events into existing map', () => {
    let mapCb: ((map: AttributionMap) => void) | undefined;
    let eventCb: ((event: AttributionEvent) => void) | undefined;
    mockOnAttributionMap.mockImplementation((cb) => { mapCb = cb; return () => {}; });
    mockOnAttributionEvent.mockImplementation((cb) => { eventCb = cb; return () => {}; });

    const { result } = renderHook(() => useAttribution());
    act(() => {
      mapCb?.({ 'uri:1': { user: 'alice', timestamp: 1234, trackName: 'Song', artist: 'Artist' } });
    });
    act(() => {
      eventCb?.({ type: 'queued', uri: 'uri:2', user: 'bob', timestamp: 5678, trackName: 'Other', artist: 'Band' });
    });

    expect(result.current['uri:1'].user).toBe('alice');
    expect(result.current['uri:2'].user).toBe('bob');
  });

  it('calls onRemoteQueue when an attribution event fires', () => {
    let eventCb: ((event: AttributionEvent) => void) | undefined;
    mockOnAttributionEvent.mockImplementation((cb) => { eventCb = cb; return () => {}; });
    const onRemoteQueue = vi.fn();

    renderHook(() => useAttribution(onRemoteQueue));
    act(() => {
      eventCb?.({ type: 'queued', uri: 'uri:1', user: 'charlie', timestamp: 0, trackName: 'T', artist: 'A' });
    });
    expect(onRemoteQueue).toHaveBeenCalled();
  });

  it('calls unsubscribe functions on unmount', () => {
    const unsubMap   = vi.fn();
    const unsubEvent = vi.fn();
    mockOnAttributionMap.mockReturnValue(unsubMap);
    mockOnAttributionEvent.mockReturnValue(unsubEvent);

    const { unmount } = renderHook(() => useAttribution());
    unmount();
    expect(unsubMap).toHaveBeenCalled();
    expect(unsubEvent).toHaveBeenCalled();
  });
});
