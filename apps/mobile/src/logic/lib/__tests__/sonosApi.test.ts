import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../sonosApi';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ data: null });
});

// ─── defined() filtering (tested via observable API behaviour) ────────────────

describe('defined() param filtering', () => {
  it('omits undefined pathParams instead of passing them as "undefined" strings', async () => {
    await api.playback.getState(); // groupId not provided
    const call = mockFetch.mock.calls[0][0];
    expect(call.pathParams).not.toHaveProperty('groupId');
  });

  it('includes defined pathParams', async () => {
    await api.playback.getState('g:abc');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathParams: { groupId: 'g:abc' } })
    );
  });
});

// ─── auth ────────────────────────────────────────────────────────────────────

describe('api.auth', () => {
  it('getDiscovery uses correct operationId', async () => {
    await api.auth.getDiscovery();
    expect(mockFetch).toHaveBeenCalledWith({ operationId: 'getAuthDiscovery' });
  });
});

// ─── groups ──────────────────────────────────────────────────────────────────

describe('api.groups', () => {
  it('list uses getGroups operationId', async () => {
    await api.groups.list();
    expect(mockFetch).toHaveBeenCalledWith({ operationId: 'getGroups' });
  });
});

// ─── playback ────────────────────────────────────────────────────────────────

describe('api.playback', () => {
  it('play sends correct operationId with groupId', async () => {
    await api.playback.play('g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'play', pathParams: { groupId: 'g:1' } })
    );
  });

  it('pause sends correct operationId', async () => {
    await api.playback.pause('g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'pause' })
    );
  });

  it('skipNext sends skipToNextTrack operationId', async () => {
    await api.playback.skipNext('g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'skipToNextTrack' })
    );
  });

  it('setPlayMode sends body with mode flags', async () => {
    await api.playback.setPlayMode({ shuffle: true, repeat: false }, 'g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'setPlayMode',
        body: { shuffle: true, repeat: false },
      })
    );
  });
});

// ─── queue ───────────────────────────────────────────────────────────────────

describe('api.queue', () => {
  it('list converts count and offset to strings', async () => {
    await api.queue.list({ count: 50, offset: 100 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'getQueueResources',
        query: { count: '50', offset: '100' },
      })
    );
  });

  it('list omits undefined count/offset from query', async () => {
    await api.queue.list({});
    const call = mockFetch.mock.calls[0][0];
    expect(call.query).not.toHaveProperty('count');
    expect(call.query).not.toHaveProperty('offset');
  });

  it('add defaults position to -1 when not provided', async () => {
    await api.queue.add({});
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: { position: '-1' } })
    );
  });

  it('add uses provided position', async () => {
    await api.queue.add({}, { position: 3 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: { position: '3' } })
    );
  });

  it('add includes If-Match header when ifMatch provided', async () => {
    await api.queue.add({}, { ifMatch: 'abc123' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'If-Match': 'abc123' } })
    );
  });

  it('add does not include headers when ifMatch absent', async () => {
    await api.queue.add({});
    const call = mockFetch.mock.calls[0][0];
    expect(call.headers).toBeUndefined();
  });

  it('remove joins item indices with commas', async () => {
    await api.queue.remove([0, 2, 5]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: { items: '0,2,5' } })
    );
  });

  it('reorder sends items and positions joined', async () => {
    await api.queue.reorder([1, 3], [0, 2], []);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'reorderQueueResources',
        query: { items: '1,3', positions: '0,2' },
      })
    );
  });
});

// ─── browse ──────────────────────────────────────────────────────────────────

describe('api.browse', () => {
  it('album sends albumId as pathParam and count as string', async () => {
    await api.browse.album('alb-1', { serviceId: 'gm', count: 25 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browseAlbum',
        pathParams: expect.objectContaining({ albumId: 'alb-1', serviceId: 'gm' }),
        query: expect.objectContaining({ count: '25' }),
      })
    );
  });

  it('album includes muse2=true as string when requested', async () => {
    await api.browse.album('alb-1', { muse2: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ muse2: 'true' }) })
    );
  });

  it('album omits muse2 query param when false', async () => {
    await api.browse.album('alb-1', { muse2: false });
    const call = mockFetch.mock.calls[0][0];
    expect(call.query).not.toHaveProperty('muse2');
  });

  it('artist sends artistId as pathParam', async () => {
    await api.browse.artist('art-1', { serviceId: 'gm', accountId: 'acc1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browseArtist',
        pathParams: expect.objectContaining({ artistId: 'art-1' }),
      })
    );
  });

  it('container sends containerId as pathParam', async () => {
    await api.browse.container('c-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browseContainer',
        pathParams: expect.objectContaining({ containerId: 'c-1' }),
      })
    );
  });
});

// ─── search ──────────────────────────────────────────────────────────────────

describe('api.search', () => {
  it('serviceQuery sends query string and count as string', async () => {
    await api.search.serviceQuery('Beatles', { serviceId: 'gm', count: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'searchService',
        query: expect.objectContaining({ query: 'Beatles', count: '50' }),
      })
    );
  });

  it('query joins services array with commas', async () => {
    await api.search.query('jazz', ['gm', 'sp']);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ services: 'gm,sp' }) })
    );
  });

  it('query omits services when not provided', async () => {
    await api.search.query('jazz');
    const call = mockFetch.mock.calls[0][0];
    expect(call.query).not.toHaveProperty('services');
  });
});

// ─── playback — remaining methods ────────────────────────────────────────────

describe('api.playback — remaining', () => {
  it('getState sends getPlaybackState operationId', async () => {
    await api.playback.getState('g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'getPlaybackState', pathParams: { groupId: 'g:1' } })
    );
  });

  it('skipPrev sends skipToPreviousTrack operationId', async () => {
    await api.playback.skipPrev('g:1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'skipToPreviousTrack' })
    );
  });
});

// ─── browse — remaining methods ───────────────────────────────────────────────

describe('api.browse — remaining', () => {
  it('artist sends artistId as pathParam', async () => {
    await api.browse.artist('art-1', { serviceId: 'gm', accountId: 'acc1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browseArtist',
        pathParams: expect.objectContaining({ artistId: 'art-1', serviceId: 'gm' }),
      })
    );
  });

  it('container sends containerId as pathParam', async () => {
    await api.browse.container('c-1', { serviceId: 'gm' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browseContainer',
        pathParams: expect.objectContaining({ containerId: 'c-1' }),
      })
    );
  });

  it('playlist sends playlistId as pathParam', async () => {
    await api.browse.playlist('pl-1', { serviceId: 'gm', count: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'browsePlaylist',
        pathParams: expect.objectContaining({ playlistId: 'pl-1' }),
        query: expect.objectContaining({ count: '50' }),
      })
    );
  });

  it('catalogContainer sends containerId as pathParam', async () => {
    await api.browse.catalogContainer('cat-1', { serviceId: 'gm', count: 10 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'getCatalogContainerResources',
        pathParams: expect.objectContaining({ containerId: 'cat-1' }),
        query: expect.objectContaining({ count: '10' }),
      })
    );
  });
});

// ─── content ─────────────────────────────────────────────────────────────────

describe('api.content', () => {
  it('favorites sends getFavoriteResources operationId with count', async () => {
    await api.content.favorites({ count: 20 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'getFavoriteResources',
        query: expect.objectContaining({ count: '20' }),
      })
    );
  });

  it('history sends getHistory operationId with count', async () => {
    await api.content.history({ count: 20 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'getHistory',
        query: expect.objectContaining({ count: '20' }),
      })
    );
  });
});

// ─── integrations ────────────────────────────────────────────────────────────

describe('api.integrations', () => {
  it('list sends getIntegrations operationId', async () => {
    await api.integrations.list();
    expect(mockFetch).toHaveBeenCalledWith({ operationId: 'getIntegrations' });
  });

  it('registrations sends getIntegrationRegistrations operationId', async () => {
    await api.integrations.registrations();
    expect(mockFetch).toHaveBeenCalledWith({ operationId: 'getIntegrationRegistrations' });
  });
});

// ─── nowPlaying ──────────────────────────────────────────────────────────────

describe('api.nowPlaying', () => {
  it('track sends trackId as pathParam', async () => {
    await api.nowPlaying.track('trk-1', { serviceId: 'gm', accountId: 'acc1' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'getTrackNowPlaying',
        pathParams: expect.objectContaining({ trackId: 'trk-1' }),
      })
    );
  });
});

// ─── platform ────────────────────────────────────────────────────────────────

describe('api.platform', () => {
  it('mfe sends getMfe operationId', async () => {
    await api.platform.mfe();
    expect(mockFetch).toHaveBeenCalledWith({ operationId: 'getMfe' });
  });

  it('featureFlag sends key as pathParam', async () => {
    await api.platform.featureFlag('my-flag');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'getOptimizelyConfig', pathParams: { key: 'my-flag' } })
    );
  });

  it('metrics sends events array as body', async () => {
    await api.platform.metrics([{ type: 'click' }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'postMetrics', body: [{ type: 'click' }] })
    );
  });
});
