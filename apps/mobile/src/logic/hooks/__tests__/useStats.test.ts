import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useStats } from '../useStats';

const mockFetchStats = vi.mocked(window.sonos.fetchStats);

beforeEach(() => {
  vi.clearAllMocks();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useStats', () => {
  it('calls window.sonos.fetchStats with the given period', async () => {
    const data = { topUsers: [], topTracks: [], topArtists: [], topAlbums: [], totalEvents: 0, periodStart: 0 };
    mockFetchStats.mockResolvedValue(data);

    const { result } = renderHook(() => useStats('today'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchStats).toHaveBeenCalledWith('today', undefined);
    expect(result.current.data).toEqual(data);
  });

  it('passes userId when provided', async () => {
    mockFetchStats.mockResolvedValue({ topUsers: [], topTracks: [], topArtists: [], topAlbums: [], totalEvents: 0, periodStart: 0 });
    const { result } = renderHook(() => useStats('week', 'alice'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchStats).toHaveBeenCalledWith('week', 'alice');
  });

  it('returns error state when fetch fails', async () => {
    mockFetchStats.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useStats('alltime'), { wrapper });
    // retry:1 means two attempts before error is set; give extra time
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 5000 });
  });
});
