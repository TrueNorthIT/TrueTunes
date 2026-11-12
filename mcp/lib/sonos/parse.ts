// Pure parsers for play.sonos.com (web-player BFF) and Sonos WebSocket payloads.
// Shapes follow what the desktop app relies on (renderer/src/lib/itemHelpers.ts, providers/sonos/SonosProvider.ts).
// No imports, so node:test can load it directly.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deep-search /api/mfe for the WebSocket ticket (a UUID under a key containing "ticket"). */
export function findTicket(obj: unknown, depth = 0): string | null {
  if (depth > 10 || obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findTicket(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      if (key.toLowerCase().includes('ticket') && typeof val === 'string' && UUID_RE.test(val)) return val;
    }
    for (const val of Object.values(rec)) {
      const hit = findTicket(val, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
}

export interface Room {
  /** Session-scoped group id (RINCON_xxx:n). Changes when speakers are regrouped. */
  id: string;
  /** Bare RINCON id of the coordinator; the fallback queue id. */
  coordinatorId: string;
  name: string;
  players: Player[];
}

/** Rooms (groups) from the `devices` namespace's devicesStatus push. */
export function roomsFromDevices(payload: unknown): Room[] {
  const devices: Loose[] = (payload as Loose)?.devices ?? [];
  const byGroup = new Map<string, { coordinator?: Loose; members: Loose[] }>();
  for (const d of devices) {
    if (!d?.groupId) continue;
    const g = byGroup.get(d.groupId) ?? { members: [] };
    g.members.push(d);
    if (d.isCoordinator) g.coordinator = d;
    byGroup.set(d.groupId, g);
  }
  const rooms: Room[] = [];
  for (const [id, { coordinator, members }] of byGroup) {
    const coordinatorId = coordinator?.info?.id;
    if (!coordinatorId) continue;
    rooms.push({
      id,
      coordinatorId,
      name: coordinator.info.name ?? coordinatorId,
      players: members
        .filter((m) => m?.info?.id)
        .map((m) => ({ id: String(m.info.id), name: String(m.info.name ?? m.info.id) })),
    });
  }
  return rooms;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Finds a room by group name or by the name of any speaker in it; exact matches first, then substrings. */
export function matchRoom(rooms: Room[], wanted?: string | null): Room | undefined {
  if (!wanted?.trim()) return undefined;
  const w = norm(wanted);
  return (
    rooms.find((r) => norm(r.name) === w) ??
    rooms.find((r) => r.players.some((p) => norm(p.name) === w)) ??
    rooms.find((r) => norm(r.name).includes(w) || r.players.some((p) => norm(p.name).includes(w)))
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type Kind = 'TRACK' | 'ALBUM' | 'PLAYLIST' | 'ARTIST' | 'PODCAST' | 'PROGRAM' | 'OTHER';

/** What addQueueResource needs: `{ id: { objectId, serviceId, accountId }, type }`. */
export interface MusicRef {
  objectId: string;
  serviceId: string;
  accountId: string;
  type: string;
}

export interface SearchHit {
  kind: Kind;
  name: string;
  artists: string[];
  album?: string;
  albumId?: string;
  durationMs?: number;
  explicit?: boolean;
  art?: string;
  summary?: string;
  ref: MusicRef;
}

const SECTION_KIND: Record<string, Kind> = {
  TRACKS: 'TRACK',
  ALBUMS: 'ALBUM',
  PLAYLISTS: 'PLAYLIST',
  ARTISTS: 'ARTIST',
  PODCASTS: 'PODCAST',
};

export function kindOf(type: unknown): Kind {
  const t = String(type ?? '').toUpperCase();
  if (t === 'PROGRAM') return 'PROGRAM';
  if (t.includes('PLAYLIST') && !t.startsWith('ITEM_')) return 'PLAYLIST';
  if (t.includes('TRACK')) return 'TRACK';
  if (t.includes('ALBUM')) return 'ALBUM';
  if (t.includes('ARTIST')) return 'ARTIST';
  if (t.includes('PODCAST')) return 'PODCAST';
  return 'OTHER';
}

function decodeDefaults(defaults: unknown): Record<string, Loose> {
  if (typeof defaults !== 'string' || !defaults) return {};
  try {
    return JSON.parse(Buffer.from(defaults, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

const stripSn = (accountId: unknown) => String(accountId ?? '').replace(/^sn_/, '');

/** Flattens a searchService response into hits, section by section in Sonos' own order. */
export function parseSearch(data: unknown): SearchHit[] {
  const d = (data ?? {}) as Loose;
  const order: string[] = [
    ...(Array.isArray(d.resourceOrder) ? d.resourceOrder : []),
    ...Object.keys(SECTION_KIND),
  ].filter((k, i, all) => all.indexOf(k) === i);

  const hits: SearchHit[] = [];
  for (const section of order) {
    const resources: Loose[] = d[section]?.resources ?? [];
    for (const r of resources) {
      const id = r?.resource?.id ?? r?.id;
      if (!id?.objectId || !id?.serviceId) continue;
      const kind = SECTION_KIND[section] ?? kindOf(r.type ?? r.resource?.type);
      const defaults = decodeDefaults(r.defaults ?? r.resource?.defaults);
      hits.push({
        kind,
        name: String(r.name ?? r.title ?? ''),
        artists: (r.artists ?? []).map((a: Loose) => a?.name).filter(Boolean),
        album: r.container?.name ?? defaults.containerName ?? undefined,
        albumId: r.container?.id?.objectId ?? defaults.containerId ?? undefined,
        durationMs: r.durationMs ?? defaults.durationMs ?? undefined,
        explicit: r.explicit ?? undefined,
        art: r.images?.[0]?.url ?? undefined,
        summary: r.summary?.content ?? undefined,
        ref: {
          objectId: String(id.objectId),
          serviceId: String(id.serviceId),
          accountId: stripSn(id.accountId),
          type: kind === 'OTHER' ? String(r.type ?? 'TRACK').replace(/^ITEM_/, '') : kind,
        },
      });
    }
  }
  return hits;
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export interface QueueEntry {
  /** 1-based, as Sonos' playback.itemId counts. */
  position: number;
  title: string;
  artist: string;
  album?: string;
  art?: string;
  durationMs?: number;
  objectId?: string;
  serviceId?: string;
  accountId?: string;
}

const nameOf = (v: unknown): string =>
  typeof v === 'string' ? v : typeof (v as Loose)?.name === 'string' ? (v as Loose).name : '';

export function queueItems(data: unknown): Loose[] {
  const d = data as Loose;
  if (Array.isArray(d)) return d;
  return d?.items ?? d?.resources ?? [];
}

/** `info.total` on a queue page, if Sonos sent it. */
export function queueTotal(data: unknown): number | undefined {
  const total = (data as Loose)?.info?.total;
  return typeof total === 'number' ? total : undefined;
}

/** Only https art is any use outside the office; Sonos often hands out LAN URLs (http://192.168.x.x:1400/getaa…). */
const httpsArt = (...urls: unknown[]): string | undefined =>
  urls.find((u): u is string => typeof u === 'string' && u.startsWith('https://'));

const artistNames = (artists: unknown): string =>
  Array.isArray(artists)
    ? artists
        .map((a: Loose) => a?.name)
        .filter(Boolean)
        .join(', ')
    : '';

/** Queue pages are flat resources: `{ id, name, type, artists: [], defaults }` (often with no artists at all). */
export function parseQueueItem(it: Loose, index: number): QueueEntry {
  const track = it?.track ?? it ?? {};
  const id = track.id ?? it?.id ?? {};
  const art = httpsArt(...(track.images ?? []).map((i: Loose) => i?.url), track.imageUrl);
  return {
    position: index + 1,
    title: String(track.name ?? track.title ?? it?.name ?? it?.title ?? 'Unknown'),
    artist:
      nameOf(track.artist ?? track.primaryArtist ?? it?.artist ?? it?.primaryArtist) ||
      artistNames(track.artists ?? it?.artists),
    album: nameOf(track.album) || undefined,
    art,
    durationMs: track.durationMillis ?? undefined,
    objectId: id.objectId ?? undefined,
    serviceId: id.serviceId != null ? String(id.serviceId) : undefined,
    accountId: id.accountId != null ? stripSn(id.accountId) : undefined,
  };
}

// ─── Playback ────────────────────────────────────────────────────────────────

export interface NowPlaying {
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  art?: string;
  objectId?: string;
  positionMs?: number;
  durationMs?: number;
  /** 1-based queue position of the current track. */
  itemNumber?: number;
  queueId?: string;
  queueVersion?: string;
  shuffle?: boolean;
  repeat?: 'off' | 'all' | 'one';
  next?: { title: string; artist: string };
}

export function parsePlayback(payload: unknown): NowPlaying {
  const p = (payload ?? {}) as Loose;
  const pb = p.playback ?? {};
  const md = p.metadata ?? {};
  const raw = String(pb.playbackState ?? 'UNKNOWN');
  const state = raw.replace(/^PLAYBACK_STATE_/, '').toLowerCase();
  const track = md.currentItem?.track;
  const nextTrack = md.nextItem?.track;
  const item = Number(pb.itemId);
  const modes = pb.playModes ?? {};
  return {
    state,
    title: track?.name ?? undefined,
    artist: nameOf(track?.artist) || undefined,
    album: nameOf(track?.album) || undefined,
    art: httpsArt(track?.imageUrl, ...(track?.images ?? []).map((i: Loose) => i?.url)),
    objectId: track?.id?.objectId ?? undefined,
    positionMs: typeof pb.positionMillis === 'number' ? pb.positionMillis : undefined,
    durationMs: typeof track?.durationMillis === 'number' ? track.durationMillis : undefined,
    itemNumber: Number.isInteger(item) && item >= 1 ? item : undefined,
    queueId: pb.queueId ?? undefined,
    queueVersion: pb.queueVersion ?? undefined,
    shuffle: typeof modes.shuffle === 'boolean' ? modes.shuffle : undefined,
    repeat: modes.repeatOne ? 'one' : modes.repeat ? 'all' : modes.repeat === false ? 'off' : undefined,
    next: nextTrack?.name ? { title: nextTrack.name, artist: nameOf(nextTrack.artist) } : undefined,
  };
}

/** 0-based insert index straight after the current track, or -1 (append) when that is unknown or the end. */
export function positionAfterCurrent(itemNumber: number | undefined, queueLength: number): number {
  if (!itemNumber || itemNumber < 1) return -1;
  return itemNumber >= queueLength ? -1 : itemNumber;
}

/** Who queued what, keyed by track objectId (the shape of the TrueTunes attribution function). */
export type Credits = Record<string, { trackName?: string }>;

const titleKey = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Where the DJ autoplay's parked track sits in the queue (0-based), or -1.
 *
 * The desktop app inserts people's picks in front of it, so nothing anyone chose ends up behind the
 * algorithm's choice. Only the DJ coordinator's session knows its exact id, so we recognise it from the
 * coordinator's own rules: it parks one track only when nothing is waiting after the playhead, appends it
 * at the tail, and never credits it to anyone. Picks added in front of it are credited. A run of uncredited
 * tracks at the end is more likely an album added in the Sonos app, so that doesn't count.
 * Credits match by objectId, or by title when Sonos has re-keyed the id.
 */
export function djFillerIndex(entries: QueueEntry[], itemNumber: number | undefined, credits: Credits): number {
  if (!itemNumber || itemNumber < 1) return -1;
  const current = itemNumber - 1;
  const tail = entries.length - 1;
  if (tail <= current) return -1;

  const titles = new Set(Object.values(credits).map((c) => titleKey(c.trackName)));
  const credited = (e: QueueEntry) => (!!e.objectId && !!credits[e.objectId]) || titles.has(titleKey(e.title));

  if (credited(entries[tail])) return -1;
  const before = tail - 1;
  if (before > current && !credited(entries[before])) return -1;
  return tail;
}

export function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
