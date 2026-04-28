import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restoreTracks } from '../useRestoreQueue';

const mockFetch = vi.mocked(window.sonos.fetch);
const mockPublishQueued = vi.mocked(window.sonos.publishQueued);

function track(overrides: Partial<RecentQueuedTrack> = {}): RecentQueuedTrack {
  return {
    uri: 'obj-1',
    serviceId: 'gm',
    accountId: 'acc1',
    trackName: 'Track 1',
    artist: 'Artist 1',
    timestamp: 1700000000000,
    queuedBy: 'alice',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ data: null });
});

describe('restoreTracks', () => {
  it('calls addQueueResource with the canonical body shape per track', async () => {
    await restoreTracks([track({ uri: 'obj-1' }), track({ uri: 'obj-2' })], {});
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operationId: 'addQueueResource',
      body: { id: { objectId: 'obj-1', serviceId: 'gm', accountId: 'acc1' }, type: 'TRACK' },
      query: { position: '-1' },
    }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      body: { id: { objectId: 'obj-2', serviceId: 'gm', accountId: 'acc1' }, type: 'TRACK' },
    }));
  });

  it('strips a leading sn_ prefix from accountId before sending', async () => {
    await restoreTracks([track({ accountId: 'sn_acc1' })], {});
    expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({
      body: { id: { objectId: 'obj-1', serviceId: 'gm', accountId: 'acc1' }, type: 'TRACK' },
    }));
  });

  it('threads queueId and the latest etag into each call', async () => {
    mockFetch
      .mockResolvedValueOnce({ data: null, etag: 'etag-2' })
      .mockResolvedValueOnce({ data: null, etag: 'etag-3' });
    const onEtagChange = vi.fn();

    await restoreTracks(
      [track({ uri: 'obj-1' }), track({ uri: 'obj-2' })],
      { queueId: 'q-1', initialEtag: 'etag-1', onEtagChange },
    );

    expect(mockFetch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      pathParams: { queueId: 'q-1' },
      headers: { 'If-Match': 'etag-1' },
    }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      headers: { 'If-Match': 'etag-2' },
    }));
    expect(onEtagChange).toHaveBeenCalledWith('etag-2');
    expect(onEtagChange).toHaveBeenCalledWith('etag-3');
  });

  it('retries once with a refreshed etag when the first add returns an error', async () => {
    mockFetch
      .mockResolvedValueOnce({ error: 'precondition failed' })
      .mockResolvedValueOnce({ data: null, etag: 'etag-fresh-2' });
    const reloadEtag = vi.fn().mockResolvedValue('etag-fresh-1');

    const summary = await restoreTracks(
      [track()],
      { initialEtag: 'stale', reloadEtag },
    );

    expect(reloadEtag).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      headers: { 'If-Match': 'etag-fresh-1' },
    }));
    expect(summary).toEqual({ added: 1, failed: 0, firstError: undefined });
  });

  it('reports failures without aborting the rest of the batch', async () => {
    mockFetch
      .mockResolvedValueOnce({ error: 'boom' })
      .mockResolvedValueOnce({ data: null });

    const summary = await restoreTracks(
      [track({ uri: 'a' }), track({ uri: 'b' })],
      {},
    );

    expect(summary.added).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.firstError).toBe('boom');
  });

  it('NEVER calls publishQueued — restored tracks must not pollute the leaderboard', async () => {
    await restoreTracks(
      [track({ uri: 'a' }), track({ uri: 'b' }), track({ uri: 'c' })],
      {},
    );
    expect(mockPublishQueued).not.toHaveBeenCalled();
  });
});
