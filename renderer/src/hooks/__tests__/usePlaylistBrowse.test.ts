import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePlaylistTracks } from '../usePlaylistBrowse';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ data: null });
});

function makeTrack(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    duration: 'PT3M26S',
    images: { tile1x1: `https://art/${title}.jpg` },
    resource: { id: { objectId: `obj-${title}`, serviceId: 'svc', accountId: 'acc' } },
    artists: [{ name: 'Artist One', id: 'srn:content:audio:artist:art-1#en' }],
    isExplicit: false,
    ...overrides,
  };
}

// ─── parsePlaylistTracks ──────────────────────────────────────────────────────

describe('parsePlaylistTracks', () => {
  it('returns empty array for empty data', () => {
    expect(parsePlaylistTracks({ tracks: { items: [] } })).toEqual([]);
  });

  it('parses title, ordinal, durationSeconds from tracks', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Song A'), makeTrack('Song B')] },
    });
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Song A');
    expect(result[0].ordinal).toBe(1);
    expect(result[0].durationSeconds).toBe(206); // 3*60+26
    expect(result[1].ordinal).toBe(2);
  });

  it('parses ISO 8601 duration with hours', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Long', { duration: 'PT1H2M3S' })] },
    });
    expect(result[0].durationSeconds).toBe(3723); // 3600+120+3
  });

  it('falls back to 0 for missing duration', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('No Dur', { duration: undefined })] },
    });
    expect(result[0].durationSeconds).toBe(0);
  });

  it('handles numeric duration', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Num', { duration: 180 })] },
    });
    expect(result[0].durationSeconds).toBe(180);
  });

  it('strips artistId prefix and hash from artistObjects', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Song')] },
    });
    expect(result[0].artistObjects?.[0].objectId).toBe('art-1');
  });

  it('collects artist names into artists array', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Song', { artists: [{ name: 'Alpha', id: 'id-1' }, { name: 'Beta', id: 'id-2' }] })] },
    });
    expect(result[0].artists).toEqual(['Alpha', 'Beta']);
  });

  it('sets artUrl from tile1x1', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Song')] },
    });
    expect(result[0].artUrl).toBe('https://art/Song.jpg');
  });

  it('returns null artUrl when no images', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Song', { images: undefined })] },
    });
    expect(result[0].artUrl).toBeNull();
  });

  it('sets explicit flag', () => {
    const result = parsePlaylistTracks({
      tracks: { items: [makeTrack('Exp', { isExplicit: true })] },
    });
    expect(result[0].explicit).toBe(true);
  });
});
