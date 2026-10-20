// Realistic synthetic aggregate for the Queuedle generator, shared by the vitest requirements
// suite (renderer/src/lib/__tests__/queuedleGenerator.requirements.test.ts) and the simulation
// harness (server/scripts/sim-queuedle.ts).
//
// Why this exists: the original generator fixture only used counts 6-9, which hid the real
// problem. Production data has a very long tail of tracks played 1-5 times, so the 3-play floor
// is reachable and "3 vs 4" questions appear. This fixture rebuilds that shape:
//   - the top 100 tracks / artists / albums are the real production counts (anonymised);
//   - everything below the export's cut-off is an extrapolated geometric/power-law tail, tuned
//     so that total track plays are about 12k (the all-time event count);
//   - the 'ninetyDay' variant thins every count (about 60%) to mimic the generator's 90-day window.
//
// Pure TypeScript with no Node or DOM dependencies so both vitest and tsc can use it.

import type { AggregateResult, AlbumEntry, ArtistEntry, TrackEntry } from '../../src/shared/aggregate';
import { itemKey } from '../../src/shared/aggregate';
import { mulberry32 } from '../../src/shared/gameGenerator';
import {
  REAL_TOP_ALBUM_COUNTS,
  REAL_TOP_ARTIST_COUNTS,
  REAL_TOP_TRACKS,
  REAL_USER_WEIGHTS,
} from './realdata';

export type DataVariant = 'allTime' | 'ninetyDay';

/** Fraction of plays kept for the 90-day variant (all-time spans roughly five months). */
export const NINETY_DAY_KEEP = 0.6;

interface RawItem {
  count: number;
}

interface RawTrack extends RawItem {
  artistGroup: number;
  albumGroup: number;
}

/** Tail of the track distribution below the export cut-off: plays -> number of tracks. */
function trackTailCounts(): Array<{ count: number; n: number }> {
  const out: Array<{ count: number; n: number }> = [];
  // The export cut-off sits inside the 6-play band (56 shown), so assume more at 6 were cut.
  out.push({ count: 6, n: 20 });
  const at5 = 160;
  const ratio = 2.15;
  for (let c = 5; c >= 1; c--) {
    out.push({ count: c, n: Math.round(at5 * Math.pow(ratio, 5 - c)) });
  }
  return out;
}

/** Tail of the artist distribution below the export cut-off (35 plays and under). */
function artistTailCounts(targetTailPlays: number): Array<{ count: number; n: number }> {
  const build = (exponent: number) => {
    const rows: Array<{ count: number; n: number }> = [];
    let plays = 0;
    for (let c = 35; c >= 1; c--) {
      const n = Math.max(1, Math.round(4 * Math.pow(36 / c, exponent)));
      rows.push({ count: c, n });
      plays += c * n;
    }
    return { rows, plays };
  };
  let lo = 0.5;
  let hi = 2.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    // Total plays grow with the exponent (more mass in the low-count tail).
    if (build(mid).plays > targetTailPlays) hi = mid;
    else lo = mid;
  }
  return build((lo + hi) / 2).rows;
}

function weightedPick(weights: number[], total: number, rng: () => number): number {
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Binomial thinning: keep each play independently with probability p. */
function thin(count: number, p: number, rng: () => number): number {
  let kept = 0;
  for (let i = 0; i < count; i++) if (rng() < p) kept++;
  return kept;
}

export function buildRealisticAggregate(variant: DataVariant): AggregateResult {
  const rng = mulberry32(`queuedle-fixture-${variant}`);

  // ---- Tracks -------------------------------------------------------------------------------
  const rawTracks: RawTrack[] = REAL_TOP_TRACKS.map(([count, artistGroup, albumGroup]) => ({
    count,
    artistGroup,
    albumGroup,
  }));
  // Album -> artist, seeded with the real groupings so tail tracks can join existing albums.
  const albumArtist = new Map<number, number>();
  for (const t of rawTracks) albumArtist.set(t.albumGroup, t.artistGroup);
  let nextAlbum = Math.max(...albumArtist.keys()) + 1;
  let nextArtist = Math.max(...rawTracks.map((t) => t.artistGroup)) + 1;

  for (const { count, n } of trackTailCounts()) {
    for (let i = 0; i < n; i++) {
      let albumGroup: number;
      let artistGroup: number;
      if (rng() < 0.35 || albumArtist.size === 0) {
        albumGroup = nextAlbum++;
        // Half of the new albums belong to an artist we already have.
        artistGroup = rng() < 0.5 ? Math.floor(rng() * nextArtist) : nextArtist++;
        albumArtist.set(albumGroup, artistGroup);
      } else {
        const albums = Array.from(albumArtist.keys());
        albumGroup = albums[Math.floor(rng() * albums.length)];
        artistGroup = albumArtist.get(albumGroup) as number;
      }
      rawTracks.push({ count, artistGroup, albumGroup });
    }
  }

  // ---- Artists ------------------------------------------------------------------------------
  const artistCounts: number[] = [...REAL_TOP_ARTIST_COUNTS];
  for (const { count, n } of artistTailCounts(5000)) {
    for (let i = 0; i < n; i++) artistCounts.push(count);
  }

  // ---- Albums -------------------------------------------------------------------------------
  const albumCounts: number[] = [...REAL_TOP_ALBUM_COUNTS];
  for (let i = 0; i < 60; i++) albumCounts.push(2);
  for (let i = 0; i < 500; i++) albumCounts.push(1);

  // ---- Thin for the 90-day variant ------------------------------------------------------------
  const keep = (c: number) => (variant === 'ninetyDay' ? thin(c, NINETY_DAY_KEEP, rng) : c);
  const tracksFinal = rawTracks.map((t) => ({ ...t, count: keep(t.count) })).filter((t) => t.count > 0);
  const artistsFinal = artistCounts.map(keep).filter((c) => c > 0);
  const albumsFinal = albumCounts.map(keep).filter((c) => c > 0);

  // ---- Users and queuers --------------------------------------------------------------------
  // Ten real-shaped users plus a handful of occasional ones, so candidate padding has a pool.
  const userWeights = [...REAL_USER_WEIGHTS, 120, 90, 60, 40];
  const userIds = userWeights.map((_, i) => `user-${i + 1}`);
  const weightTotal = userWeights.reduce((a, b) => a + b, 0);

  const queuersFor = (count: number): Record<string, number> => {
    // People queue their own favourites repeatedly: one owner takes about half the plays.
    const owner = weightedPick(userWeights, weightTotal, rng);
    const out: Record<string, number> = {};
    for (let i = 0; i < count; i++) {
      const u = rng() < 0.5 ? owner : weightedPick(userWeights, weightTotal, rng);
      out[userIds[u]] = (out[userIds[u]] ?? 0) + 1;
    }
    return out;
  };

  const trackMap: Record<string, TrackEntry> = {};
  const artistMap: Record<string, ArtistEntry> = {};
  const albumMap: Record<string, AlbumEntry> = {};
  const queuersByItem: Record<string, Record<string, number>> = {};
  const userCounts: Record<string, number> = {};

  const bumpUsers = (q: Record<string, number>) => {
    for (const [u, n] of Object.entries(q)) userCounts[u] = (userCounts[u] ?? 0) + n;
  };

  tracksFinal.forEach((t, i) => {
    const artist = `Track Artist ${t.artistGroup}`;
    const key = `Track ${i}||${artist}`;
    trackMap[key] = {
      key,
      trackName: `Track ${i}`,
      artist,
      album: `Album ${t.albumGroup}`,
      albumId: `alb-${t.albumGroup}`,
      uri: `uri:${i}`,
      count: t.count,
    };
    const q = queuersFor(t.count);
    queuersByItem[itemKey('track', key)] = q;
    bumpUsers(q);
  });

  artistsFinal.forEach((count, i) => {
    const artist = `Act ${i}`;
    artistMap[artist] = { artist, count };
    queuersByItem[itemKey('artist', artist)] = queuersFor(count);
  });

  albumsFinal.forEach((count, i) => {
    const key = `album-entry-${i}`;
    albumMap[key] = { key, album: `Release ${i}`, artist: `Album Artist ${i % 150}`, albumId: key, count };
    queuersByItem[itemKey('album', key)] = queuersFor(count);
  });

  return { trackMap, artistMap, albumMap, userCounts, queuersByItem };
}

export function totalTrackPlays(agg: AggregateResult): number {
  return Object.values(agg.trackMap).reduce((s, t) => s + t.count, 0);
}
