import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePrefetchNextLyrics } from '../usePrefetchNextLyrics';
import type { NormalizedQueueItem } from '../../types/provider';

const item = (title: string, artist: string) =>
  ({ track: { id: 'x', title, artist, albumName: 'Alb', durationMs: 1000 } }) as unknown as NormalizedQueueItem;

function run(next: NormalizedQueueItem) {
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // queueItemId is 1-based and indexes the item after the playing one, so '1' selects items[1]
  renderHook(() => usePrefetchNextLyrics([item('now', 'Me'), next], '1'), { wrapper });
  return spy;
}

describe('usePrefetchNextLyrics', () => {
  it('prefetches for a complete next track', () => {
    expect(run(item('Loser', 'Tame Impala'))).toHaveBeenCalled();
  });

  it.each([
    ['empty artist', item('Loser', '')],
    ['empty title', item('', 'Tame Impala')],
  ])('skips the prefetch for an %s', (_n, next) => {
    expect(run(next)).not.toHaveBeenCalled();
  });
});
