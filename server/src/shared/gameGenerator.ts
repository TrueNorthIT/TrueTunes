import {
  AggregateResult,
  ItemCategory,
  itemKey,
  TrackEntry,
  ArtistEntry,
  AlbumEntry,
} from './aggregate';

export interface GameItem {
  category: ItemCategory;
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  uri?: string;
  count: number;
  topQueuer: string;
  queuerCandidates: string[];
  artistKey?: string;
  albumKey?: string;
}

export interface GameQuestion {
  index: number;
  left: GameItem;
  right: GameItem;
  winner: 'left' | 'right';
}

export interface GeneratedGame {
  questions: GameQuestion[];
  lowData: boolean;
}

export interface GeneratorOptions {
  targetCount?: number;
  minCount?: number;
  minRatio?: number;
  maxRatio?: number;
  minTopQueuerShare?: number;
  minDistinctQueuersForBonus?: number;
}

const DEFAULTS: Required<GeneratorOptions> = {
  targetCount: 10,
  minCount: 3,
  minRatio: 1.15,
  maxRatio: 3.0,
  minTopQueuerShare: 0,
  minDistinctQueuersForBonus: 1,
};

const BLACKLISTED_ARTISTS = new Set(['Various Artists', 'various artists', '', 'Unknown Artist']);

export function mulberry32(seedStr: string): () => number {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
  }
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function trackToItem(
  entry: TrackEntry,
  agg: AggregateResult,
  rng: () => number,
  opts: Required<GeneratorOptions>,
): GameItem | null {
  const id = entry.key;
  const queuers = agg.queuersByItem[itemKey('track', id)] ?? {};
  const bonus = buildBonus(queuers, agg.userCounts, rng, opts);
  if (!bonus) return null;
  return {
    category: 'track',
    id,
    name: entry.trackName,
    subtitle: entry.artist,
    imageUrl: entry.imageUrl,
    uri: entry.uri,
    count: entry.count,
    topQueuer: bonus.topQueuer,
    queuerCandidates: bonus.candidates,
    artistKey: entry.artist,
    albumKey: entry.albumId ?? entry.album,
  };
}

function artistToItem(
  entry: ArtistEntry,
  agg: AggregateResult,
  rng: () => number,
  opts: Required<GeneratorOptions>,
): GameItem | null {
  const id = entry.artist;
  if (BLACKLISTED_ARTISTS.has(entry.artist)) return null;
  const queuers = agg.queuersByItem[itemKey('artist', id)] ?? {};
  const bonus = buildBonus(queuers, agg.userCounts, rng, opts);
  if (!bonus) return null;
  return {
    category: 'artist',
    id,
    name: entry.artist,
    subtitle: 'Artist',
    imageUrl: entry.imageUrl,
    count: entry.count,
    topQueuer: bonus.topQueuer,
    queuerCandidates: bonus.candidates,
    artistKey: entry.artist,
  };
}

function albumToItem(
  entry: AlbumEntry,
  agg: AggregateResult,
  rng: () => number,
  opts: Required<GeneratorOptions>,
): GameItem | null {
  if (BLACKLISTED_ARTISTS.has(entry.artist)) return null;
  const id = entry.key;
  const queuers = agg.queuersByItem[itemKey('album', id)] ?? {};
  const bonus = buildBonus(queuers, agg.userCounts, rng, opts);
  if (!bonus) return null;
  return {
    category: 'album',
    id,
    name: entry.album,
    subtitle: entry.artist,
    imageUrl: entry.imageUrl,
    count: entry.count,
    topQueuer: bonus.topQueuer,
    queuerCandidates: bonus.candidates,
    artistKey: entry.artist,
    albumKey: id,
  };
}

function buildBonus(
  queuers: Record<string, number>,
  userCounts: Record<string, number>,
  rng: () => number,
  opts: Required<GeneratorOptions>,
): { topQueuer: string; candidates: string[] } | null {
  const entries = Object.entries(queuers);
  if (entries.length < opts.minDistinctQueuersForBonus) return null;

  entries.sort((a, b) => b[1] - a[1]);
  const [topName] = entries[0];
  // Reject when the top queuer is tied with someone else — the answer must be unambiguous.
  if (entries.length >= 2 && entries[0][1] === entries[1][1]) return null;

  const candidates = entries.slice(0, 4).map(([name]) => name);
  if (candidates.length < 4) {
    const pool = Object.keys(userCounts).filter((u) => !candidates.includes(u));
    const shuffled = shuffle(pool, rng);
    while (candidates.length < 4 && shuffled.length) {
      const next = shuffled.pop();
      if (next === undefined) break;
      candidates.push(next);
    }
  }
  if (candidates.length < 2) return null;

  return { topQueuer: topName, candidates: shuffle(candidates, rng) };
}

function itemsOverlap(a: GameItem, b: GameItem): boolean {
  if (a.category === b.category && a.id === b.id) return true;
  if (a.artistKey && b.artistKey && a.artistKey === b.artistKey) {
    if (a.category === 'artist' || b.category === 'artist') return true;
    if (a.category === 'album' && b.category === 'track') return true;
    if (a.category === 'track' && b.category === 'album') return true;
  }
  if (a.albumKey && b.albumKey && a.albumKey === b.albumKey) {
    return true;
  }
  return false;
}

function pairQuality(a: GameItem, b: GameItem): number {
  const max = Math.max(a.count, b.count);
  const min = Math.min(a.count, b.count);
  const ratio = max / min;
  return -Math.abs(ratio - 1.6);
}

export function generateGame(
  agg: AggregateResult,
  seed: string,
  options: GeneratorOptions = {},
): GeneratedGame {
  const opts = { ...DEFAULTS, ...options };
  const rng = mulberry32(seed);

  const pool: GameItem[] = [];
  for (const t of Object.values(agg.trackMap)) {
    if (t.count < opts.minCount) continue;
    const item = trackToItem(t, agg, rng, opts);
    if (item) pool.push(item);
  }
  for (const a of Object.values(agg.artistMap)) {
    if (a.count < opts.minCount) continue;
    const item = artistToItem(a, agg, rng, opts);
    if (item) pool.push(item);
  }
  for (const al of Object.values(agg.albumMap)) {
    if (al.count < opts.minCount) continue;
    const item = albumToItem(al, agg, rng, opts);
    if (item) pool.push(item);
  }

  const shuffledPool = shuffle(pool, rng);

  const candidatePairs: Array<{ a: GameItem; b: GameItem; quality: number }> = [];
  for (let i = 0; i < shuffledPool.length; i++) {
    for (let j = i + 1; j < shuffledPool.length; j++) {
      const a = shuffledPool[i];
      const b = shuffledPool[j];
      if (itemsOverlap(a, b)) continue;
      if (a.count === b.count) continue;
      const max = Math.max(a.count, b.count);
      const min = Math.min(a.count, b.count);
      const ratio = max / min;
      if (ratio < opts.minRatio || ratio > opts.maxRatio) continue;
      candidatePairs.push({ a, b, quality: pairQuality(a, b) });
    }
  }

  candidatePairs.sort((x, y) => y.quality - x.quality);

  const questions: GameQuestion[] = [];
  const usedItems = new Set<string>();
  const usedAlbumKeys = new Set<string>();
  for (const { a, b } of candidatePairs) {
    if (questions.length >= opts.targetCount) break;
    const aKey = `${a.category}:${a.id}`;
    const bKey = `${b.category}:${b.id}`;
    if (usedItems.has(aKey) || usedItems.has(bKey)) continue;
    if (a.albumKey && usedAlbumKeys.has(a.albumKey)) continue;
    if (b.albumKey && usedAlbumKeys.has(b.albumKey)) continue;
    usedItems.add(aKey);
    usedItems.add(bKey);
    if (a.albumKey) usedAlbumKeys.add(a.albumKey);
    if (b.albumKey) usedAlbumKeys.add(b.albumKey);

    const swap = rng() < 0.5;
    const left = swap ? b : a;
    const right = swap ? a : b;
    const winner: 'left' | 'right' = left.count > right.count ? 'left' : 'right';

    questions.push({ index: questions.length, left, right, winner });
  }

  questions.sort((x, y) => {
    const xr = Math.max(x.left.count, x.right.count) / Math.min(x.left.count, x.right.count);
    const yr = Math.max(y.left.count, y.right.count) / Math.min(y.left.count, y.right.count);
    return yr - xr;
  });
  questions.forEach((q, i) => (q.index = i));

  return {
    questions,
    lowData: questions.length < opts.targetCount,
  };
}
