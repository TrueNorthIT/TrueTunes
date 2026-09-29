// Pure helpers behind the detail screens (no React Native imports so vitest can cover them).
import type { AlbumTrack } from '../../logic/hooks/useAlbumBrowse';
import { fmtDuration } from '../../logic/lib/itemHelpers';
import { getPlaylistColor } from '../../logic/lib/playlistColor';
import type { SonosItem, SonosItemId } from '../../logic/types/sonos';

// ─── Route params ────────────────────────────────────────────────────────────

type Param = string | string[] | undefined;

export interface DetailParams {
  id?: string;
  serviceId?: string;
  accountId?: string;
  defaults?: string;
  name?: string;
}

const one = (p: Param): string | undefined => {
  const v = Array.isArray(p) ? p[0] : p;
  return v ? v : undefined;
};

/** Reads the params documented in ui/media/routes.ts. accountId loses any "sn_" prefix defensively. */
export function parseDetailParams(p: Record<string, Param>): DetailParams {
  return {
    id: one(p.id),
    serviceId: one(p.serviceId),
    accountId: one(p.accountId)?.replace(/^sn_/, ''),
    defaults: one(p.defaults),
    name: one(p.name),
  };
}

/** Route for the create-playlist modal, optionally carrying the track to drop into the new playlist. */
export function createPlaylistRoute(track?: PlaylistTrack | null): string {
  return track ? `/create-playlist?track=${encodeURIComponent(JSON.stringify(track))}` : '/create-playlist';
}

export function parsePendingTrack(p: Param): PlaylistTrack | null {
  const raw = one(p);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<PlaylistTrack>;
    return t && typeof t.uri === 'string' && t.uri && typeof t.trackName === 'string' ? (t as PlaylistTrack) : null;
  } catch {
    return null;
  }
}

// ─── Synthetic items (what desktop got from router state) ────────────────────

/** Builds the SonosItem that addToQueue needs for an album/playlist opened by route params. */
export function buildBrowseItem(
  kind: 'ALBUM' | 'PLAYLIST',
  p: DetailParams,
  extra: { title?: string } = {}
): SonosItem | null {
  if (!p.id) return null;
  return {
    type: kind,
    name: extra.title ?? p.name,
    title: extra.title ?? p.name,
    resource: {
      type: kind,
      id: { objectId: p.id, serviceId: p.serviceId, accountId: p.accountId },
      defaults: p.defaults,
    },
  };
}

/** Desktop PlaylistPanel.trackToSonosItem. */
export function playlistTrackToItem(t: PlaylistTrack): SonosItem {
  return {
    type: 'TRACK',
    title: t.trackName,
    artist: t.artist,
    imageUrl: t.imageUrl ?? undefined,
    id: { objectId: t.uri, serviceId: t.serviceId, accountId: t.accountId },
  };
}

// ─── Track lists ─────────────────────────────────────────────────────────────

export function albumMetaLine(totalTracks: number, totalSeconds: number, year: number | null): string {
  const mins = Math.round(totalSeconds / 60);
  return [`${totalTracks} songs`, mins > 0 ? `${mins} min` : null, year].filter(Boolean).join(' • ');
}

export function totalSeconds(tracks: Pick<AlbumTrack, 'durationSeconds'>[]): number {
  return tracks.reduce((s, t) => s + (t.durationSeconds || 0), 0);
}

export const durationLabel = (seconds: number): string => (seconds > 0 ? fmtDuration(seconds) : '');

/**
 * The item handed to the long-press sheet for a browse track: the raw track normalised so the
 * sheet's queue/playlist/go-to actions work (object id, credited artists with ids, album ref).
 */
export function trackSheetItem(
  track: AlbumTrack,
  ctx: { serviceId?: string; accountId?: string; includeAlbum?: boolean }
): SonosItem {
  const rid = track.id as SonosItemId;
  const serviceId = rid.serviceId ?? ctx.serviceId;
  const accountId = (rid.accountId ?? ctx.accountId)?.replace(/^sn_/, '');
  const id: SonosItemId = { objectId: rid.objectId, serviceId, accountId };
  const imageUrl = track.artUrl ?? undefined;
  const artists = (track.artistObjects ?? []).map((a) => ({
    name: a.name,
    id: { objectId: a.objectId, serviceId, accountId } as SonosItemId,
  }));
  const base: SonosItem = {
    ...track.raw,
    type: 'TRACK',
    title: track.title,
    name: track.title,
    id,
    explicit: track.explicit,
    imageUrl,
    resource: { ...(track.raw.resource ?? {}), type: 'TRACK', id },
    track: {
      id,
      name: track.title,
      artist: track.artists[0] ? { name: track.artists[0] } : undefined,
      imageUrl,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    artists: artists.length ? artists : track.artists.map((name) => ({ name })),
  };
  if (ctx.includeAlbum && track.albumId && track.albumName) {
    base.album = { name: track.albumName, id: { objectId: track.albumId, serviceId, accountId } };
  }
  return base;
}

// ─── Playlist reorder ────────────────────────────────────────────────────────

/** Returns a copy with the item at `from` moved to index `to` (same semantics as the server's reorder). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const canMoveUp = (index: number) => index > 0;
export const canMoveDown = (index: number, length: number) => index < length - 1;

/** First hsl() stop of the desktop gradient (RN has no CSS gradients without a native dep). */
export function flatPlaylistColour(name: string): string {
  const m = /hsl\([^)]+\)/.exec(getPlaylistColor(name));
  return m ? m[0] : '#252528';
}

export function playlistMetaParts(pl: Pick<PlaylistDoc, 'isPublic' | 'members' | 'tracks' | 'createdAt'>): string[] {
  const parts = [pl.isPublic ? 'Public' : 'Private'];
  if (pl.isPublic) parts.push(`${pl.members.length} member${pl.members.length !== 1 ? 's' : ''}`);
  parts.push(`${pl.tracks.length} track${pl.tracks.length !== 1 ? 's' : ''}`);
  return parts;
}

// ─── Genius DOM ──────────────────────────────────────────────────────────────

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
}
export interface TextBlock {
  kind: 'p' | 'li' | 'heading';
  runs: TextRun[];
}

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_TAGS = new Set(['img', 'iframe', 'script', 'style', 'embedded-content']);

/**
 * Flattens a Genius description tree into paragraph blocks of styled runs, ready for <Text>.
 * Block tags start a new block; inline tags (a, b/strong, i/em) become run styles; br is a newline.
 */
export function geniusToBlocks(root: GeniusDomNode | null | undefined): TextBlock[] {
  const blocks: TextBlock[] = [];
  let kind: TextBlock['kind'] = 'p';
  let runs: TextRun[] = [];

  const flush = () => {
    const joined = runs.map((r) => r.text).join('');
    if (joined.trim()) {
      // trim outer whitespace of the block
      const first = runs.findIndex((r) => r.text.trim());
      let last = runs.length - 1;
      while (last > 0 && !runs[last].text.trim()) last--;
      const out = runs.slice(first, last + 1).map((r) => ({ ...r }));
      out[0].text = out[0].text.replace(/^\s+/, '');
      out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
      blocks.push({ kind, runs: out });
    }
    runs = [];
    kind = 'p';
  };

  const walk = (node: GeniusDomNode, style: Omit<TextRun, 'text'>) => {
    if (typeof node === 'string') {
      if (node) runs.push({ text: node, ...style });
      return;
    }
    const tag = (node.tag ?? '').toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'br') {
      runs.push({ text: '\n', ...style });
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) {
      flush();
      if (tag === 'li') kind = 'li';
      else if (/^h[1-6]$/.test(tag)) kind = 'heading';
    }
    let next = style;
    if (tag === 'b' || tag === 'strong') next = { ...style, bold: true };
    else if (tag === 'i' || tag === 'em') next = { ...style, italic: true };
    else if (tag === 'a' && node.attributes?.href) next = { ...style, href: node.attributes.href };
    for (const c of node.children ?? []) walk(c, next);
    if (isBlock) flush();
  };

  if (root) walk(root, {});
  flush();
  return blocks;
}

/** Plain text of the first paragraphs (desktop extractBio) — used for accessibility / tests. */
export function blocksToPlain(blocks: TextBlock[]): string {
  return blocks.map((b) => b.runs.map((r) => r.text).join('')).join('\n\n');
}
