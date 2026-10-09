import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useContainerBrowse } from '../useContainerBrowse';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ data: null });
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useContainerBrowse', () => {
  it('does not fetch when containerId is undefined', () => {
    renderHook(() => useContainerBrowse(undefined, 'svc', 'acc'), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when serviceId is undefined', () => {
    renderHook(() => useContainerBrowse('cont-1', undefined, 'acc'), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches and returns items when all params provided', async () => {
    const mockData = {
      container: {
        items: [{ type: 'TRACK', title: 'Song A', resource: { type: 'TRACK', id: {} } }],
      },
    };
    mockFetch.mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(
      () => useContainerBrowse('cont-1', 'svc', 'acc'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeInstanceOf(Array);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'browseContainer' })
    );
  });

  it('returns error when response has error field', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: 'Not found' });
    const { result } = renderHook(
      () => useContainerBrowse('cont-1', 'svc', 'acc'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
