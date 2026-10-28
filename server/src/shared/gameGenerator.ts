import { AggregateResult, ItemCategory, itemKey, TrackEntry, ArtistEntry, AlbumEntry } from './aggregate';

export interface GameItem {
  category: ItemCategory;
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  uri?: string;
  /** With `uri`, what a track needs to be queued from the game. */
  serviceId?: string;
  accountId?: string;
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
  minGap?: number;
  minRatio?: number;
  maxRatio?: number;
  minTopQueuerShare?: number;
  minDistinctQueuersForBonus?: number;
}

const DEFAULTS: Required<GeneratorOptions> = {
  targetCount: 10,
  minCount: 3,
  minGap: 2,
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
  opts: Required<GeneratorOptions>
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
    serviceId: entry.serviceId,
    accountId: entry.accountId,
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
  opts: Required<GeneratorOptions>
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
  opts: Required<GeneratorOptions>
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
  opts: Required<GeneratorOptions>
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
  if (a.category !== b.category) return true;
  if (a.id === b.id) return true;
  if (a.artistKey && b.artistKey && a.artistKey === b.artistKey) {
    if (a.category === 'artist') return true;
  }
  if (a.albumKey && b.albumKey && a.albumKey === b.albumKey) {
    return true;
  }
  return false;
}

/** Share of days given to each category when the day's category is chosen from the seed. */
const CATEGORY_WEIGHTS: Array<{ category: ItemCategory; weight: number }> = [
  { category: 'artist', weight: 0.45 },
  { category: 'track', weight: 0.4 },
  { category: 'album', weight: 0.15 },
];

/** Max search nodes spent on one starting item, and max starting items tried per category. */
const NODE_BUDGET = 400;
const MAX_STARTS = 40;

interface CountScale {
  floor: number;
  ceiling: number;
}

/**
 * True when a revealed bridge count lets the player deduce the answer: the rules (gap, ratio band,
 * floor and ceiling of the scale) leave room for the hidden item on only one side.
 */
function isForced(b: number, scale: CountScale, opts: Required<GeneratorOptions>): boolean {
  const eps = 1e-9;
  const lowerLo = Math.max(scale.floor, Math.ceil(b / opts.maxRatio - eps));
  const lowerHi = Math.min(b - opts.minGap, Math.floor(b / opts.minRatio + eps));
  if (lowerLo > lowerHi) return true;
  const upperLo = Math.max(b + opts.minGap, Math.ceil(b * opts.minRatio - eps));
  const upperHi = Math.min(Math.floor(b * opts.maxRatio + eps), scale.ceiling);
  return upperLo > upperHi;
}

/** Is `next` an acceptable follower of `tail` in the requested direction (mystery higher/lower)? */
function validStep(tail: GameItem, next: GameItem, higher: boolean, opts: Required<GeneratorOptions>): boolean {
  const eps = 1e-9;
  const b = tail.count;
  const m = next.count;
  if (higher) {
    return m - b >= opts.minGap && m / b >= opts.minRatio - eps && m / b <= opts.maxRatio + eps;
  }
  return b - m >= opts.minGap && b / m >= opts.minRatio - eps && b / m <= opts.maxRatio + eps;
}

/** Preferred ratio band by question number: Q1-3 >= 2.0, Q4-7 1.5-2.0, Q8+ 1.15-1.5. */
function inRampBand(questionNumber: number, a: number, b: number): boolean {
  const ratio = Math.max(a, b) / Math.min(a, b);
  if (questionNumber <= 3) return ratio >= 2.0 - 1e-9;
  if (questionNumber <= 7) return ratio >= 1.5 - 1e-9 && ratio <= 2.0 + 1e-9;
  return ratio <= 1.5 + 1e-9;
}

function buildChain(shuffledPool: GameItem[], opts: Required<GeneratorOptions>, rng: () => number): GameItem[] {
  const itemId = (item: GameItem) => `${item.category}:${item.id}`;
  if (shuffledPool.length === 0) return [];

  const length = opts.targetCount + 1;
  // Bridges are shown with their count; none may leave only one possible side for the hidden item
  // given the pool's floor and ceiling (the scale a regular player learns).
  const poolMin = shuffledPool.reduce((a, x) => Math.min(a, x.count), Infinity);
  const poolMax = shuffledPool.reduce((a, x) => Math.max(a, x.count), 0);
  const scale: CountScale = { floor: poolMin, ceiling: poolMax };
  const bridgeOk = new Map<number, boolean>();
  const canBridge = (count: number): boolean => {
    let ok = bridgeOk.get(count);
    if (ok === undefined) {
      ok = !isForced(count, scale, opts);
      bridgeOk.set(count, ok);
    }
    return ok;
  };

  let bestChain: GameItem[] = [];

  const chain: GameItem[] = [];
  const usedIds = new Set<string>();
  const usedAlbumKeys = new Set<string>();
  let nodes = 0;

  const extend = (): boolean => {
    if (chain.length > bestChain.length) bestChain = chain.slice();
    if (chain.length >= length) return true;
    if (++nodes > NODE_BUDGET) return false;

    const tail = chain[chain.length - 1];
    const isLast = chain.length === length - 1;
    const firstHigher = rng() < 0.5;
    const questionNumber = chain.length;
    // Difficulty ramp is a preference: try in-band candidates (both directions) before any valid one.
    for (const [inBandOnly, higher] of [
      [true, firstHigher],
      [true, !firstHigher],
      [false, firstHigher],
      [false, !firstHigher],
    ] as Array<[boolean, boolean]>) {
      for (let ci = 0; ci < shuffledPool.length; ci++) {
        const candidate = shuffledPool[ci];
        // Cheap count checks first: most of the pool fails them, and this loop dominates generation time.
        if (!validStep(tail, candidate, higher, opts)) continue;
        if (inBandOnly && !inRampBand(questionNumber, tail.count, candidate.count)) continue;
        if (!isLast && !canBridge(candidate.count)) continue;
        if (usedIds.has(itemId(candidate))) continue;
        if (candidate.albumKey && usedAlbumKeys.has(candidate.albumKey)) continue;
        if (itemsOverlap(tail, candidate)) continue;

        chain.push(candidate);
        usedIds.add(itemId(candidate));
        if (candidate.albumKey) usedAlbumKeys.add(candidate.albumKey);
        if (extend()) return true;
        chain.pop();
        usedIds.delete(itemId(candidate));
        if (candidate.albumKey) usedAlbumKeys.delete(candidate.albumKey);
        if (nodes > NODE_BUDGET) return false;
        // One candidate per direction per level; deeper failure means this direction is a dead end.
        break;
      }
    }
    return false;
  };

  const starts = Math.min(shuffledPool.length, MAX_STARTS);
  for (let si = 0; si < starts; si++) {
    const start = shuffledPool[si];
    chain.length = 0;
    usedIds.clear();
    usedAlbumKeys.clear();
    chain.push(start);
    usedIds.add(itemId(start));
    if (start.albumKey) usedAlbumKeys.add(start.albumKey);
    nodes = 0;
    if (extend()) return chain.slice();
  }

  return bestChain;
}

function buildPool(
  category: ItemCategory,
  agg: AggregateResult,
  rng: () => number,
  opts: Required<GeneratorOptions>
): GameItem[] {
  const pool: GameItem[] = [];
  if (category === 'track') {
    for (const t of Object.values(agg.trackMap)) {
      if (t.count < opts.minCount) continue;
      const item = trackToItem(t, agg, rng, opts);
      if (item) pool.push(item);
    }
  } else if (category === 'artist') {
    for (const a of Object.values(agg.artistMap)) {
      if (a.count < opts.minCount) continue;
      const item = artistToItem(a, agg, rng, opts);
      if (item) pool.push(item);
    }
  } else {
    for (const al of Object.values(agg.albumMap)) {
      if (al.count < opts.minCount) continue;
      const item = albumToItem(al, agg, rng, opts);
      if (item) pool.push(item);
    }
  }
  return pool;
}

/** The day's category is drawn from the seed by weight; the others follow as fallbacks. */
function categoryOrder(rng: () => number): ItemCategory[] {
  const total = CATEGORY_WEIGHTS.reduce((a, c) => a + c.weight, 0);
  let r = rng() * total;
  let first = CATEGORY_WEIGHTS[CATEGORY_WEIGHTS.length - 1].category;
  for (const c of CATEGORY_WEIGHTS) {
    if (r < c.weight) {
      first = c.category;
      break;
    }
    r -= c.weight;
  }
  const rest = CATEGORY_WEIGHTS.filter((c) => c.category !== first).map((c) => c.category);
  return [first, ...rest];
}

export function generateGame(agg: AggregateResult, seed: string, options: GeneratorOptions = {}): GeneratedGame {
  const opts = { ...DEFAULTS, ...options };
  const rng = mulberry32(seed);

  let chain: GameItem[] = [];
  for (const category of categoryOrder(rng)) {
    const pool = buildPool(category, agg, rng, opts);
    const candidate = buildChain(shuffle(pool, rng), opts, rng);
    if (candidate.length > chain.length) chain = candidate;
    if (chain.length >= opts.targetCount + 1) break;
  }

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
      ? left.count > right.count
        ? 'left'
        : 'right'
      : swap
        ? 'left'
        : 'right';

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
