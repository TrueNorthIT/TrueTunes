import type { SonosItem, SonosItemId, QueueItem } from '../types/sonos';
import type { ServiceSearch } from '../types/ServiceSearch';

// ─── Defaults decoder ─────────────────────────────────────────────────────────

export function decodeDefaults(defaults: string | undefined): Record<string, unknown> | null {
  if (!defaults) return null;
  try { return JSON.parse(atob(defaults)); } catch { return null; }
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

/** Items played via WS loadContent (stations, radio mixes, programs). */
export function isProgram(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase() === 'PROGRAM';
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
          result.push({
            type: 'TRACK',
            name: r.name,
            images: r.images,
            artists: r.artists?.map(a => ({ name: a.name, id: a.id })),
            explicit: r.explicit,
            durationMs: r.durationMs,
            id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
            resource: {
              type: 'TRACK',
              id: { objectId: r.id.objectId, serviceId: r.id.serviceId, accountId: r.id.accountId },
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
