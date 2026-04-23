import { describe, it, expect } from 'vitest';
import {
  fmtDuration,
  fmtTime,
  getName,
  getItemArt,
  isAlbum,
  isTrack,
  isArtist,
  isPlaylist,
  isProgram,
  extractItems,
  parseServiceSearch,
  resolveAlbumParams,
  resolveArtistParams,
  decodeDefaults,
} from '../itemHelpers';
import type { SonosItem } from '../../types/sonos';
import type { ServiceSearch } from '../../types/ServiceSearch';

// ─── fmtDuration ─────────────────────────────────────────────────────────────

describe('fmtDuration', () => {
  it('formats zero seconds', () => {
    expect(fmtDuration(0)).toBe('0:00');
  });

  it('formats sub-minute seconds', () => {
    expect(fmtDuration(9)).toBe('0:09');
    expect(fmtDuration(59)).toBe('0:59');
  });

  it('formats exactly one minute', () => {
    expect(fmtDuration(60)).toBe('1:00');
  });

  it('formats minutes and seconds', () => {
    expect(fmtDuration(90)).toBe('1:30');
    expect(fmtDuration(3661)).toBe('61:01');
  });

  it('pads single-digit seconds', () => {
    expect(fmtDuration(65)).toBe('1:05');
  });
});

// ─── fmtTime ─────────────────────────────────────────────────────────────────

describe('fmtTime', () => {
  it('formats zero ms', () => {
    expect(fmtTime(0)).toBe('0:00');
  });

  it('formats milliseconds to m:ss', () => {
    expect(fmtTime(61000)).toBe('1:01');
    expect(fmtTime(3600000)).toBe('60:00');
  });

  it('truncates fractional seconds', () => {
    expect(fmtTime(1500)).toBe('0:01');
  });
});

// ─── getName ─────────────────────────────────────────────────────────────────

describe('getName', () => {
  it('returns name when present', () => {
    expect(getName({ name: 'Foo' } as SonosItem)).toBe('Foo');
  });

  it('falls back to title', () => {
    expect(getName({ title: 'Bar' } as SonosItem)).toBe('Bar');
  });

  it('prefers name over title', () => {
    expect(getName({ name: 'Foo', title: 'Bar' } as SonosItem)).toBe('Foo');
  });

  it('falls back to resource.name', () => {
    expect(getName({ resource: { name: 'Res', type: 'TRACK', id: { objectId: 'x', serviceId: 'y', accountId: 'z' } } } as SonosItem)).toBe('Res');
  });

  it('falls back to track.name', () => {
    expect(getName({ track: { name: 'Track' } } as SonosItem)).toBe('Track');
  });

  it('returns (unknown) when nothing is present', () => {
    expect(getName({} as SonosItem)).toBe('(unknown)');
  });
});

// ─── getItemArt ──────────────────────────────────────────────────────────────

describe('getItemArt', () => {
  it('returns tile1x1 from images object (browse shape)', () => {
    expect(getItemArt({ images: { tile1x1: 'https://example.com/tile.jpg' } } as unknown as SonosItem)).toBe('https://example.com/tile.jpg');
  });

  it('returns imageUrl fallback', () => {
    expect(getItemArt({ imageUrl: 'https://example.com/img.jpg' } as SonosItem)).toBe('https://example.com/img.jpg');
  });

  it('returns track.imageUrl', () => {
    expect(getItemArt({ track: { imageUrl: 'https://example.com/track.jpg' } } as SonosItem)).toBe('https://example.com/track.jpg');
  });

  it('returns null when no art', () => {
    expect(getItemArt({} as SonosItem)).toBeNull();
  });
});

// ─── Type predicates ─────────────────────────────────────────────────────────

describe('isAlbum', () => {
  it('identifies ALBUM type', () => {
    expect(isAlbum({ type: 'ALBUM' } as SonosItem)).toBe(true);
  });

  it('identifies via resource.type', () => {
    expect(isAlbum({ resource: { type: 'ALBUM', id: { objectId: '', serviceId: '', accountId: '' } } } as SonosItem)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAlbum({ type: 'album' } as SonosItem)).toBe(true);
  });

  it('rejects non-album types', () => {
    expect(isAlbum({ type: 'TRACK' } as SonosItem)).toBe(false);
    expect(isAlbum({ type: 'ARTIST' } as SonosItem)).toBe(false);
    expect(isAlbum({} as SonosItem)).toBe(false);
  });
});

describe('isTrack', () => {
  it('identifies TRACK type', () => {
    expect(isTrack({ type: 'TRACK' } as SonosItem)).toBe(true);
  });

  it('rejects non-track types', () => {
    expect(isTrack({ type: 'ALBUM' } as SonosItem)).toBe(false);
  });
});

describe('isArtist', () => {
  it('identifies ARTIST type', () => {
    expect(isArtist({ type: 'ARTIST' } as SonosItem)).toBe(true);
  });

  it('rejects non-artist types', () => {
    expect(isArtist({ type: 'ALBUM' } as SonosItem)).toBe(false);
  });
});

describe('isPlaylist', () => {
  it('identifies PLAYLIST type', () => {
    expect(isPlaylist({ type: 'PLAYLIST' } as SonosItem)).toBe(true);
  });

  it('rejects ITEM_PLAYLIST (container browse, not browseable playlist)', () => {
    expect(isPlaylist({ type: 'ITEM_PLAYLIST' } as SonosItem)).toBe(false);
  });

  it('rejects non-playlist types', () => {
    expect(isPlaylist({ type: 'ALBUM' } as SonosItem)).toBe(false);
  });
});

describe('isProgram', () => {
  it('identifies PROGRAM type', () => {
    expect(isProgram({ type: 'PROGRAM' } as SonosItem)).toBe(true);
  });

  it('rejects partial match (e.g. PROGRAMMATIC would match TRACK, not this)', () => {
    expect(isProgram({ type: 'TRACK' } as SonosItem)).toBe(false);
  });
});

// ─── extractItems ─────────────────────────────────────────────────────────────

describe('extractItems', () => {
  const item1 = { name: 'Track 1', type: 'TRACK' } as SonosItem;
  const item2 = { name: 'Track 2', type: 'TRACK' } as SonosItem;

  it('handles null/undefined', () => {
    expect(extractItems(null)).toEqual([]);
    expect(extractItems(undefined)).toEqual([]);
  });

  it('returns bare array as-is', () => {
    expect(extractItems([item1, item2])).toEqual([item1, item2]);
  });

  it('extracts from .items property', () => {
    expect(extractItems({ items: [item1] })).toEqual([item1]);
  });

  it('extracts from .resources property', () => {
    expect(extractItems({ resources: [item2] })).toEqual([item2]);
  });

  it('extracts from .section.items property', () => {
    expect(extractItems({ section: { items: [item1, item2] } })).toEqual([item1, item2]);
  });

  it('flattens .services into tagged items', () => {
    const data = {
      services: [
        { serviceId: 'gm', results: { tracks: [item1] } },
      ],
    };
    const result = extractItems(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Track 1', _svcId: 'gm' });
  });

  it('returns empty array for unrecognised shape', () => {
    expect(extractItems({ foo: 'bar' })).toEqual([]);
  });
});

// ─── parseServiceSearch ───────────────────────────────────────────────────────

describe('parseServiceSearch', () => {
  it('parses TRACKS section into SonosItems with type TRACK', () => {
    const data: ServiceSearch = {
      resourceOrder: ['TRACKS'],
      TRACKS: {
        resources: [
          {
            name: 'Bohemian Rhapsody',
            id: { objectId: 'trk1', serviceId: 'gm', accountId: 'acc1' },
            explicit: false,
            durationMs: 354000,
          } as ServiceSearch['TRACKS']['resources'][0],
        ],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('TRACK');
    expect(result[0].name).toBe('Bohemian Rhapsody');
  });

  it('parses ARTISTS section', () => {
    const data: ServiceSearch = {
      resourceOrder: ['ARTISTS'],
      ARTISTS: {
        resources: [
          { name: 'Queen', id: { objectId: 'art1', serviceId: 'gm', accountId: 'acc1' } },
        ],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ARTIST');
    expect(result[0].name).toBe('Queen');
  });

  it('respects resourceOrder when multiple sections present', () => {
    const data: ServiceSearch = {
      resourceOrder: ['ARTISTS', 'TRACKS'],
      ARTISTS: { resources: [{ name: 'Artist', id: { objectId: 'a', serviceId: 's', accountId: 'c' } }] },
      TRACKS: { resources: [{ name: 'Track', id: { objectId: 't', serviceId: 's', accountId: 'c' } }] },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result[0].type).toBe('ARTIST');
    expect(result[1].type).toBe('TRACK');
  });

  it('handles empty sections gracefully', () => {
    const data: ServiceSearch = {
      resourceOrder: ['TRACKS'],
      TRACKS: { resources: [] },
    } as unknown as ServiceSearch;

    expect(parseServiceSearch(data)).toEqual([]);
  });

  it('parses ALBUMS section with artists', () => {
    const data = {
      resourceOrder: ['ALBUMS'],
      ALBUMS: {
        resources: [{
          name: 'A Night at the Opera',
          id: { objectId: 'alb1', serviceId: 'gm', accountId: 'acc1' },
          artists: [{ name: 'Queen', id: { objectId: 'art1', serviceId: 'gm', accountId: 'acc1' } }],
          explicit: false,
          summary: { content: 'Classic rock' },
        }],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ALBUM');
    expect(result[0].name).toBe('A Night at the Opera');
    expect(result[0].artists?.[0].name).toBe('Queen');
  });

  it('parses TRACKS section with artists (covers artists.map callback)', () => {
    const data = {
      resourceOrder: ['TRACKS'],
      TRACKS: {
        resources: [{
          name: 'Bohemian Rhapsody',
          id: { objectId: 'trk1', serviceId: 'gm', accountId: 'acc1' },
          artists: [{ name: 'Queen', id: { objectId: 'art1', serviceId: 'gm', accountId: 'acc1' } }],
          explicit: false,
          durationMs: 354000,
        }],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result[0].artists?.[0].name).toBe('Queen');
  });

  it('parses PLAYLISTS section', () => {
    const data = {
      resourceOrder: ['PLAYLISTS'],
      PLAYLISTS: {
        resources: [{
          name: 'My Playlist',
          id: { objectId: 'pl1', serviceId: 'gm', accountId: 'acc1' },
        }],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PLAYLIST');
    expect(result[0].name).toBe('My Playlist');
  });

  it('parses PODCASTS section', () => {
    const data = {
      resourceOrder: ['PODCASTS'],
      PODCASTS: {
        resources: [{
          name: 'Tech Talk',
          id: { objectId: 'pod1', serviceId: 'gm', accountId: 'acc1' },
        }],
      },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PODCAST');
    expect(result[0].name).toBe('Tech Talk');
  });

  it('uses default resourceOrder when not specified', () => {
    const data = {
      ARTISTS: { resources: [{ name: 'A', id: { objectId: 'a', serviceId: 's', accountId: 'c' } }] },
      ALBUMS:  { resources: [{ name: 'B', id: { objectId: 'b', serviceId: 's', accountId: 'c' } }] },
      TRACKS:  { resources: [{ name: 'C', id: { objectId: 'c', serviceId: 's', accountId: 'c' } }] },
    } as unknown as ServiceSearch;

    const result = parseServiceSearch(data);
    expect(result.map(r => r.type)).toEqual(['ARTIST', 'ALBUM', 'TRACK']);
  });
});

// ─── resolveAlbumParams ───────────────────────────────────────────────────────

describe('resolveAlbumParams', () => {
  it('extracts from resource.id and strips sn_ prefix from accountId', () => {
    const item: SonosItem = {
      type: 'ALBUM',
      resource: {
        type: 'ALBUM',
        id: { objectId: 'alb1', serviceId: 'gm', accountId: 'sn_abc' },
        defaults: 'eyJmb28iOiJiYXIifQ==',
      },
    };
    const result = resolveAlbumParams(item);
    expect(result.albumId).toBe('alb1');
    expect(result.serviceId).toBe('gm');
    expect(result.accountId).toBe('abc');
    expect(result.defaults).toBe('eyJmb28iOiJiYXIifQ==');
  });

  it('falls back to item.id when no resource.id', () => {
    const item: SonosItem = {
      type: 'ALBUM',
      id: { objectId: 'alb2', serviceId: 'sp', accountId: 'usr1' },
    };
    const result = resolveAlbumParams(item);
    expect(result.albumId).toBe('alb2');
    expect(result.serviceId).toBe('sp');
    expect(result.accountId).toBe('usr1');
  });

  it('returns undefined fields for bare item', () => {
    const result = resolveAlbumParams({ type: 'ALBUM' } as SonosItem);
    expect(result.albumId).toBeUndefined();
    expect(result.serviceId).toBeUndefined();
  });
});

// ─── resolveArtistParams ──────────────────────────────────────────────────────

describe('resolveArtistParams', () => {
  it('extracts artistId from direct ARTIST item', () => {
    const item: SonosItem = {
      type: 'ARTIST',
      name: 'Queen',
      resource: {
        type: 'ARTIST',
        id: { objectId: 'art1', serviceId: 'gm', accountId: 'acc1' },
      },
    };
    const result = resolveArtistParams(item);
    expect(result.artistId).toBe('art1');
    expect(result.name).toBe('Queen');
  });

  it('decodes artistId from base64 defaults on album item', () => {
    const defaults = btoa(JSON.stringify({ artistId: 'art99', artist: 'Led Zeppelin' }));
    const item: SonosItem = {
      type: 'ALBUM',
      resource: {
        type: 'ALBUM',
        id: { objectId: 'alb1', serviceId: 'gm', accountId: 'acc1' },
        defaults,
      },
    };
    const result = resolveArtistParams(item);
    expect(result.artistId).toBe('art99');
    expect(result.name).toBe('Led Zeppelin');
  });

  it('returns undefined artistId when nothing can be resolved', () => {
    const result = resolveArtistParams({ type: 'ALBUM' } as SonosItem);
    expect(result.artistId).toBeUndefined();
  });
});

// ─── decodeDefaults ───────────────────────────────────────────────────────────

describe('decodeDefaults', () => {
  it('decodes valid base64 JSON', () => {
    const payload = { artistId: 'abc', foo: 42 };
    const encoded = btoa(JSON.stringify(payload));
    expect(decodeDefaults(encoded)).toEqual(payload);
  });

  it('returns null for undefined input', () => {
    expect(decodeDefaults(undefined)).toBeNull();
  });

  it('returns null for invalid base64', () => {
    expect(decodeDefaults('!!!not-base64!!!')).toBeNull();
  });
});
