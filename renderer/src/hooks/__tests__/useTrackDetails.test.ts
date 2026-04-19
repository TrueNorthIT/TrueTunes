import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackQueryOptions } from '../useTrackDetails';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// Build a minimal nowPlaying response shape that parseResponse understands.
function makeResponse(overrides: Record<string, unknown> = {}) {
  return { data: { title: 'Default Title', ...overrides } };
}

// Encode defaults the same way the Sonos API does — btoa(JSON.stringify(...)).
function encodeDefaults(obj: Record<string, unknown>) {
  return btoa(JSON.stringify(obj));
}

// ─── accountId normalisation ──────────────────────────────────────────────────

describe('accountId normalisation', () => {
  it('strips sn_ prefix from accountId before sending the API request', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse());
    const opts = trackQueryOptions('trk-1', 'gm', 'sn_acc123');
    await opts.queryFn();
    // The fetch call must use 'acc123', not 'sn_acc123'
    const call = mockFetch.mock.calls[0][0];
    expect(call.pathParams?.accountId).toBe('acc123');
  });

  it('leaves accountId unchanged when no sn_ prefix', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse());
    const opts = trackQueryOptions('trk-1', 'gm', 'acc123');
    await opts.queryFn();
    const call = mockFetch.mock.calls[0][0];
    expect(call.pathParams?.accountId).toBe('acc123');
  });
});

// ─── parseResponse — title ────────────────────────────────────────────────────

describe('title parsing', () => {
  it('reads title from top-level title field', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ title: 'Come Together' }));
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.trackName).toBe('Come Together');
  });

  it('falls back to item.title when top-level title is absent', async () => {
    mockFetch.mockResolvedValueOnce({ data: { item: { title: 'Hey Jude' } } });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.trackName).toBe('Hey Jude');
  });
});

// ─── parseResponse — artUrl ───────────────────────────────────────────────────

describe('artUrl parsing', () => {
  it('reads artUrl from top-level images.tile1x1', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ images: { tile1x1: 'http://img/top.jpg' } }));
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.artUrl).toBe('http://img/top.jpg');
  });

  it('falls back to item.images.tile1x1 when top-level images absent', async () => {
    mockFetch.mockResolvedValueOnce({ data: { item: { images: { tile1x1: 'http://img/item.jpg' } } } });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.artUrl).toBe('http://img/item.jpg');
  });
});

// ─── parseResponse — artist ───────────────────────────────────────────────────

describe('artist parsing', () => {
  it('reads artist from top-level subtitle', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ subtitle: 'The Beatles' }));
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.artist).toBe('The Beatles');
  });

  it('falls back to item.subtitle', async () => {
    mockFetch.mockResolvedValueOnce({ data: { item: { subtitle: 'Led Zeppelin' } } });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.artist).toBe('Led Zeppelin');
  });

  it('falls back to item.artists[0].name when no subtitle', async () => {
    mockFetch.mockResolvedValueOnce({ data: { item: { artists: [{ name: 'Pink Floyd' }] } } });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.artist).toBe('Pink Floyd');
  });
});

// ─── parseResponse — album + artistId from defaults ──────────────────────────

describe('defaults parsing', () => {
  it('extracts albumName, albumId, and artistId from base64-encoded defaults', async () => {
    const defaults = encodeDefaults({ containerName: 'Abbey Road', containerId: 'alb-1', artistId: 'art-1' });
    mockFetch.mockResolvedValueOnce({
      data: { item: { resource: { id: { serviceId: 'gm', accountId: 'acc' }, defaults } } },
    });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.albumName).toBe('Abbey Road');
    expect(result?.albumId).toBe('alb-1');
    expect(result?.artistId).toBe('art-1');
  });

  it('extracts serviceId and accountId from resource.id', async () => {
    mockFetch.mockResolvedValueOnce({
      data: { item: { resource: { id: { serviceId: 'sp', accountId: 'acc-sp' } } } },
    });
    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result?.serviceId).toBe('sp');
    expect(result?.accountId).toBe('acc-sp');
  });
});

// ─── YT Music fallback ────────────────────────────────────────────────────────

describe('YT Music fallback', () => {
  it('calls YT Music (72711) when primary service errors', async () => {
    mockFetch
      .mockResolvedValueOnce({ data: null, error: 'not found' })
      .mockResolvedValueOnce(makeResponse({ title: 'Via YT' }));

    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();

    expect(result?.trackName).toBe('Via YT');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1][0];
    expect(secondCall.pathParams?.serviceId).toBe('72711');
  });

  it('returns null when both primary and YT fallback fail', async () => {
    mockFetch
      .mockResolvedValueOnce({ data: null, error: 'fail' })
      .mockResolvedValueOnce({ data: null, error: 'fail' });

    const result = await trackQueryOptions('t', 'gm', 'a').queryFn();
    expect(result).toBeNull();
  });

  it('does not attempt YT fallback when serviceId is already 72711', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: 'fail' });

    const result = await trackQueryOptions('t', '72711', 'a').queryFn();
    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
