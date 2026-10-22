import type { SonosItem, SonosItemId, QueueItem, SonosTrack } from '../types/sonos';
import type { ServiceSearch } from '../types/ServiceSearch';
import type { NormalizedQueueItem } from '../types/provider';

// ─── Defaults decoder ─────────────────────────────────────────────────────────

export function decodeDefaults(defaults: string | undefined): Record<string, unknown> | null {
  if (!defaults) return null;
  try {
    // Base64 (or base64url) of UTF-8 JSON. atob() returns raw bytes as Latin-1 chars, so decode them
    // as UTF-8 or accented names come out as mojibake ("MisÃ©rables").
    const bin = atob(defaults.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
}

// ─── Optimistic queue normaliser ─────────────────────────────────────────────
//
// Raw browse/album track items have `id` as a string SRN and `images` as
// `{ tile1x1 }` rather than an array.  useQueueTrack needs an object `id` to
// extract the trackId for the nowPlaying query, and getArt needs `imageUrl` or
// an images array.  This function converts browse-shaped items into the shape
// that the queue row renderer expects.

export function normalizeForQueue(item: SonosItem): SonosItem {
  const rid = item.resource?.id as SonosItemId | undefined;
  // If id is already an object the item is already normalised (e.g. search results)
  if (typeof item.id === 'object' || !rid?.objectId) return item;

  const imageUrl =
    (item.images as Record<string, string> | undefined)?.['tile1x1'] ?? item.imageUrl;
  const artistName = (item as Record<string, string>)['subtitle'] ?? '';

  return {
    ...item,
    id: rid,
    track: {
      id: rid,
      name: item.title ?? item.name,
      artist: artistName ? { name: artistName } : undefined,
      imageUrl,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
  };
}

// ─── Album param resolver ─────────────────────────────────────────────────────

export function resolveAlbumParams(item: SonosItem) {
  const rid = item.resource?.id as SonosItemId | undefined;
  const iid = typeof item.id === 'object' ? item.id as SonosItemId : undefined;
  return {
    albumId:   rid?.objectId  ?? iid?.objectId,
    serviceId: rid?.serviceId ?? iid?.serviceId,
    accountId: (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, ''),
    defaults:  item.resource?.defaults as string | undefined,
  };
}

// ─── Response normalisation ───────────────────────────────────────────────────

export function extractItems(data: unknown): SonosItem[] {
  if (!data) return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(data))               return data as SonosItem[];
  if (Array.isArray(d['items']))         return d['items'] as SonosItem[];
  if (Array.isArray(d['resources']))     return d['resources'] as SonosItem[];
  // Container browse: { section: { items: [...] } }
  const sec = d['section'] as Record<string, unknown> | undefined;
  if (sec && Array.isArray(sec['items'])) return sec['items'] as SonosItem[];
  if (Array.isArray(d['services'])) {
    const flat: SonosItem[] = [];
    for (const svc of d['services'] as Record<string, unknown>[]) {
      const r = (svc['results'] ?? svc) as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        if (Array.isArray(r[key])) {
          (r[key] as SonosItem[]).forEach(item => {
            flat.push({ ...item, _svcId: svc['serviceId'] } as SonosItem);
          });
        }
      }
    }
    return flat;
  }
  return [];
}

// ─── Field extractors ─────────────────────────────────────────────────────────

export function getName(item: SonosItem): string {
  return item?.name ?? item?.title ?? item?.resource?.name ?? item?.track?.name ?? '(unknown)';
}

function resolveArtistName(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { name?: string }).name ?? '';
  }
  return String(raw);
}

export function getSub(item: SonosItem): string {
  // subtitle is used by container browse responses (e.g. album items have subtitle = artist name)
  const raw = item?.artist ?? item?.primaryArtist ?? (item as Record<string,unknown>)?.['subtitle']
           ?? item?.resource?.artist ?? item?.track?.artist ?? item?.description ?? '';
  const result = resolveArtistName(raw);
  return item?.summary?.content ?? result;
}

export function getArtist(item: QueueItem): string {
  return resolveArtistName(item?.track?.artist ?? item?.artist ?? item?.primaryArtist ?? '');
}

// Sonos serves multi-artist credits as a single joined string ("Sonny Stitt, Kenny Garrett").
export function splitArtists(artist: string): string[] {
  return artist.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
}

export function getAlbum(item: QueueItem): string {
  const raw = item?.track?.album ?? item?.album ?? '';
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { name?: string }).name ?? '';
  }
  return String(raw);
}

export function getArt(item: SonosItem): string | null {
  return item?.track?.imageUrl
      ?? item?.track?.images?.[0]?.url
      ?? item?.imageUrl
      ?? item?.images?.[0]?.url
      ?? null;
}

/** Like getArt but also handles browse API items where images is { tile1x1 } not an array. */
export function getItemArt(item: SonosItem): string | null {
  return (item.images as Record<string, string> | undefined)?.['tile1x1'] ?? getArt(item) ?? null;
}

export function isAlbum(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase().includes('ALBUM');
}

export function isPlaylist(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  const t = type.toUpperCase();
  // ITEM_PLAYLIST is a container browse item, not a directly-browseable playlist
  return t.includes('PLAYLIST') && !t.startsWith('ITEM_');
}

export function isArtist(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase().includes('ARTIST');
}

/** Exact (case-insensitive) name match among artist items; undefined if none. */
export function findArtistByName(items: SonosItem[], name: string): SonosItem | undefined {
  const lower = name.trim().toLowerCase();
  return items.find((i) => isArtist(i) && getName(i).trim().toLowerCase() === lower);
}

/** Podcast shows and episodes. Deliberately excludes PROGRAM, which also covers radio and mixes. */
export function isPodcast(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return /PODCAST|EPISODE/i.test(type);
}

export function isTrack(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase().includes('TRACK');
}

export function isContainer(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  const t = type.toUpperCase();
  return t === 'ITEM_AUDIO' || t === 'ITEM_STUDIO' || t === 'ITEM_PLAYLIST'
      || t === 'CONTAINER' || t === 'SECTION';
}

/** Stations, radio mixes and supermixes. Sonos only plays one by replacing the whole queue. */
export function isProgram(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase() === 'PROGRAM';
}

/**
 * Whether a one-click "+" may queue the item whole. Not a station: the queue is shared, so a
 * station opens as its track list and songs go in one at a time. Not a shelf: it has no queueable id.
 */
export function canQueueWhole(item: SonosItem): boolean {
  return !isProgram(item) && !isContainer(item);
}

const TYPE_LABELS: Record<string, string> = {
  TRACK:        'Track',
  ALBUM:        'Album',
  ARTIST:       'Artist',
  PLAYLIST:     'Playlist',
  PODCAST:      'Podcast',
  PROGRAM:      'Station',
  AUDIO:        'Collection',
  STUDIO:       'Studio Mix',
  CONTAINER:    '',
  SECTION:      '',
};

function formatItemType(raw: string | undefined): string {
  if (!raw) return '';
  const key = raw.toUpperCase().replace(/^ITEM_/, '');
  return TYPE_LABELS[key] ?? '';
}

export function browseSub(item: SonosItem): string {
  if (item?.summary?.content) return item.summary.content;
  const type    = formatItemType(item?.type);
  const artists = item?.artists?.map((a) => a.name).join(', ') ?? getSub(item);
  return [type, artists].filter(Boolean).join(' \u2022 ');
}

// ─── Artist param resolver ────────────────────────────────────────────────────

export function resolveArtistParams(item: SonosItem) {
  const rid = item.resource?.id as SonosItemId | undefined;
  const iid = typeof item.id === 'object' ? item.id as SonosItemId : undefined;
  const serviceId = rid?.serviceId ?? iid?.serviceId;
  const accountId = (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, '');

  // Direct ARTIST-type item
  if (item.resource?.type === 'ARTIST' || item.type === 'ARTIST') {
    return {
      artistId: rid?.objectId ?? iid?.objectId,
      serviceId,
      accountId,
      defaults: item.resource?.defaults as string | undefined,
      name: (item.title ?? item.name) as string | undefined,
    };
  }

  // Album/track item: extract artistId from decoded defaults
  const decoded = decodeDefaults(item.resource?.defaults as string | undefined);
  if (decoded?.['artistId']) {
    return {
      artistId: decoded['artistId'] as string,
      serviceId,
      accountId,
      defaults: undefined as string | undefined,
      name: decoded['artist'] as string | undefined,
    };
  }

  return { artistId: undefined, serviceId, accountId, defaults: undefined, name: undefined };
}

// ─── ServiceSearch normaliser ─────────────────────────────────────────────────

export function parseServiceSearch(data: ServiceSearch): SonosItem[] {
  const order = data.resourceOrder ?? ['ARTISTS', 'ALBUMS', 'TRACKS'];
  const result: SonosItem[] = [];

  for (const section of order) {
    switch (section) {
      case 'ARTISTS':
        for (const r of data.ARTISTS?.resources ?? []) {
          result.push({
            type: 'ARTIST',
            name: r.name,
            images: r.images,
            summary: { content: r.bio?.content ?? '' },
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'ARTIST',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            },
          });
        }
        break;
      case 'ALBUMS':
        for (const r of data.ALBUMS?.resources ?? []) {
          result.push({
            type: 'ALBUM',
            name: r.name,
            images: r.images,
            artists: r.artists?.map(a => ({ name: a.name, id: a.id })),
            explicit: r.explicit,
            summary: r.summary,
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'ALBUM',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            },
          });
        }
        break;
      case 'TRACKS':
        for (const r of data.TRACKS?.resources ?? []) {
          // The album tells versions apart (Hot Fuss vs a live set). Tracks with none are videos and uploads.
          const defs = decodeDefaults(r.defaults);
          const albumName = r.container?.name ?? (defs?.['containerName'] as string | undefined);
          const albumId = r.container?.id?.objectId ?? (defs?.['containerId'] as string | undefined);
          result.push({
            type: 'TRACK',
            name: r.name,
            images: r.images,
            artists: r.artists?.map(a => ({ name: a.name, id: a.id })),
            explicit: r.explicit,
            durationMs: r.durationMs ?? (defs?.['durationMs'] as number | undefined),
            ...(albumName
              ? { album: { name: albumName, id: albumId ? { objectId: albumId, serviceId: r.id.serviceId, accountId: r.id.accountId } : undefined } }
              : {}),
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'TRACK',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
              defaults: r.defaults,
            },
          });
        }
        break;
      case 'PLAYLISTS':
        for (const r of data.PLAYLISTS?.resources ?? []) {
          result.push({
            type: 'PLAYLIST',
            name: r.name,
            images: r.images,
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'PLAYLIST',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            },
          });
        }
        break;
      case 'PODCASTS':
        for (const r of data.PODCASTS?.resources ?? []) {
          result.push({
            type: 'PODCAST',
            name: r.name,
            images: r.images,
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'PODCAST',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            },
          });
        }
        break;
    }
  }

  return result;
}

// ─── Sonos→Normalized queue item converter (for optimistic inserts) ──────────

export function sonosItemToNormalizedQueueItem(item: SonosItem, index: number): NormalizedQueueItem {
  const track = item.track as SonosTrack | undefined;
  const id = (track?.id ?? (typeof item.id === 'object' ? item.id : undefined)) as SonosItemId | undefined;
  const albumObj = track?.album as { name?: string; id?: { objectId?: string } } | undefined;
  const rawArtist = track?.artist ?? track?.primaryArtist ?? item.artist ?? item.primaryArtist;
  const artistName = rawArtist
    ? typeof rawArtist === 'object' ? (rawArtist as { name?: string }).name ?? '' : String(rawArtist)
    : '';
  const artUrls = [
    ...(track?.images?.map((i: { url: string }) => i.url) ?? []),
    track?.imageUrl,
    item.imageUrl,
  ].filter((u): u is string => !!u);
  const imageUrl = artUrls.find((u) => u.startsWith('https://')) ?? null;

  return {
    index,
    track: {
      id: id?.objectId ?? '',
      title: track?.name ?? track?.title ?? item.name ?? item.title ?? '',
      artist: artistName,
      albumName: albumObj?.name ?? null,
      albumId: albumObj?.id?.objectId ?? null,
      imageUrl,
      durationMs: track?.durationMillis ?? 0,
      isExplicit: !!(track?.explicit ?? (track as Record<string, unknown> | undefined)?.['isExplicit']),
      serviceId: id?.serviceId ?? null,
      accountId: id?.accountId ?? null,
    },
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
