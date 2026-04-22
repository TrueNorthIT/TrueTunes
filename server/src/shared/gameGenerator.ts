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
  carryover?: 'left' | 'right';
  bonusItem: 'left' | 'right';
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

function validRatio(a: GameItem, b: GameItem, opts: Required<GeneratorOptions>): boolean {
  if (a.count === b.count) return false;
  const ratio = Math.max(a.count, b.count) / Math.min(a.count, b.count);
  return ratio >= opts.minRatio && ratio <= opts.maxRatio;
}

function buildChain(
  shuffledPool: GameItem[],
  opts: Required<GeneratorOptions>,
): GameItem[] {
  const itemId = (item: GameItem) => `${item.category}:${item.id}`;

  let bestChain: GameItem[] = [];

  for (let si = 0; si < shuffledPool.length; si++) {
    const start = shuffledPool[si];
    const chain: GameItem[] = [start];
    const usedIds = new Set<string>([itemId(start)]);
    const usedAlbumKeys = new Set<string>(start.albumKey ? [start.albumKey] : []);

    while (chain.length <= opts.targetCount) {
      const tail = chain[chain.length - 1];
      let found = false;
      for (let ci = 0; ci < shuffledPool.length; ci++) {
        const candidate = shuffledPool[ci];
        if (usedIds.has(itemId(candidate))) continue;
        if (candidate.albumKey && usedAlbumKeys.has(candidate.albumKey)) continue;
        if (itemsOverlap(tail, candidate)) continue;
        if (!validRatio(tail, candidate, opts)) continue;
        chain.push(candidate);
        usedIds.add(itemId(candidate));
        if (candidate.albumKey) usedAlbumKeys.add(candidate.albumKey);
        found = true;
        break;
      }
      if (!found) break;
    }

    if (chain.length > bestChain.length) {
      bestChain = chain;
      if (bestChain.length >= opts.targetCount + 1) break;
    }
  }

  return bestChain;
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
  const chain = buildChain(shuffledPool, opts);

  const questions: GameQuestion[] = [];

  for (let i = 0; i < chain.length - 1; i++) {
    const isFirst = i === 0;
    // bridge = chain[i], carried from previous question (known for Q2+)
    // mystery = chain[i+1], the new unknown item
    const bridge = chain[i];
    const mystery = chain[i + 1];

    const swap = rng() < 0.5;
    const left = swap ? mystery : bridge;
    const right = swap ? bridge : mystery;

    // carryover = which side the bridge (known item) landed on; absent for Q1
    const carryover: 'left' | 'right' | undefined = isFirst ? undefined : swap ? 'right' : 'left';
    // bonusItem = the mystery (new) side; for Q1 use the winner since both are new
    const bonusItem: 'left' | 'right' = isFirst
      ? left.count > right.count ? 'left' : 'right'
      : swap ? 'left' : 'right';

    questions.push({
      index: i,
      left,
      right,
      winner: left.count > right.count ? 'left' : 'right',
      carryover,
      bonusItem,
    });
  }

  return {
    questions,
    lowData: questions.length < opts.targetCount,
  };
}
