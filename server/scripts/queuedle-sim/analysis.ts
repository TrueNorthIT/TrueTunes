// Simulation + measurement helpers for the Queuedle generator. Shared by the vitest requirements
// suite and server/scripts/sim-queuedle.ts so that the tests and the printed report agree.
//
// WHAT THE PLAYER SEES (verified in renderer/src/components/queuedle/QueuedleQuestionCard.tsx):
//   - Question 1: two unknown items, no counts shown, no carryover.
//   - Question 2 onwards: the carried-over "bridge" item (question.carryover side) shows its play
//     count BEFORE the player answers; the other side (the "mystery", new this question) shows
//     only its name. The player picks which side was queued more often.
//   - After answering, both counts are revealed; the mystery then becomes the next bridge.
//
// FORCED ANSWER (the definition used by Q-1):
//   A question is "forced" when the revealed bridge count, plus knowledge of the game's rules,
//   rules out one side of the question entirely. The rules a regular player can learn are:
//     - the lowest and highest counts an item of that category ever has in a game (floor/ceiling);
//     - paired counts differ by at least MIN_GAP plays (Q-3);
//     - the larger count is between MIN_RATIO and MAX_RATIO times the smaller.
//   Let b be the bridge count. The mystery count m must be an integer with
//     lower side:  max(floor, ceil(b / MAX_RATIO)) <= m <= min(b - MIN_GAP, floor(b / MIN_RATIO))
//     upper side:  max(b + MIN_GAP, ceil(b * MIN_RATIO)) <= m <= min(floor(b * MAX_RATIO), ceiling)
//   If the lower side has no integer solution the mystery MUST be higher (bridge at/near the
//   floor, e.g. a revealed 3 or 4 when the floor is 3). If the upper side has none the mystery
//   MUST be lower (bridge at/near the ceiling). Either way the answer is deducible without
//   knowing the music, so the question is forced.
//   floor is the lowest count of any item shown in any simulated game (what a regular player has
//   seen as the bottom of the scale); ceiling is the highest play count among that category's items
//   in the data (the top of the scale). See knownRanges().

import type { AggregateResult, ItemCategory } from '../../src/shared/aggregate';
import { generateGame, GeneratedGame, GameItem, GameQuestion } from '../../src/shared/gameGenerator';

/** Player-visible rules. Edit deliberately if the game's contract is changed on purpose. */
export const RULES = {
  /** Q-3: paired counts never differ by only 1 play. */
  MIN_GAP: 2,
  MIN_RATIO: 1.15,
  MAX_RATIO: 3.0,
} as const;

/** Q-7 difficulty ramp: preferred ratio band (higher/lower count) by 1-based question number. */
export type Band = 'easy' | 'medium' | 'hard';
export function bandFor(questionNumber: number): Band {
  return questionNumber <= 3 ? 'easy' : questionNumber <= 7 ? 'medium' : 'hard';
}
export function inBand(band: Band, ratio: number): boolean {
  if (band === 'easy') return ratio >= 2.0 - EPS;
  if (band === 'medium') return ratio >= 1.5 - EPS && ratio <= 2.0 + EPS;
  return ratio <= 1.5 + EPS;
}

export interface RampRow {
  question: number;
  n: number;
  meanRatio: number;
  inBandShare: number;
}
export interface RampStats {
  byQuestion: RampRow[];
  /** Mean ratio per band over all questions in that band. */
  bandMeans: Record<Band, number>;
  inBandShare: number;
}

/** Ratio ramp across question numbers, optionally for one category's days only. */
export function rampStats(results: DayResult[], category?: ItemCategory): RampStats {
  const rows: Array<{ sum: number; n: number; inb: number }> = [];
  const bandAcc: Record<Band, { sum: number; n: number }> = {
    easy: { sum: 0, n: 0 },
    medium: { sum: 0, n: 0 },
    hard: { sum: 0, n: 0 },
  };
  let total = 0;
  let inTotal = 0;
  for (const r of results) {
    if (category && r.category !== category) continue;
    for (const q of r.game.questions) {
      const hi = Math.max(q.left.count, q.right.count);
      const lo = Math.min(q.left.count, q.right.count);
      const ratio = hi / lo;
      const num = q.index + 1;
      const band = bandFor(num);
      const ok = inBand(band, ratio);
      const row = (rows[num - 1] ??= { sum: 0, n: 0, inb: 0 });
      row.sum += ratio;
      row.n++;
      if (ok) row.inb++;
      bandAcc[band].sum += ratio;
      bandAcc[band].n++;
      total++;
      if (ok) inTotal++;
    }
  }
  const mean = (a: { sum: number; n: number }) => (a.n === 0 ? 0 : a.sum / a.n);
  return {
    byQuestion: rows.map((row, i) => ({
      question: i + 1,
      n: row.n,
      meanRatio: row.n === 0 ? 0 : row.sum / row.n,
      inBandShare: row.n === 0 ? 0 : row.inb / row.n,
    })),
    bandMeans: { easy: mean(bandAcc.easy), medium: mean(bandAcc.medium), hard: mean(bandAcc.hard) },
    inBandShare: total === 0 ? 0 : inTotal / total,
  };
}

export interface DayResult {
  seed: string;
  game: GeneratedGame;
  /** Category of the chain (decided by its first item); null when no questions were produced. */
  category: ItemCategory | null;
}

export interface CountRange {
  floor: number;
  ceiling: number;
}

export type ForcedKind = 'mystery-must-be-higher' | 'mystery-must-be-lower';

export interface ForcedQuestion {
  seed: string;
  questionIndex: number;
  category: ItemCategory;
  bridgeName: string;
  bridgeCount: number;
  otherCount: number;
  kind: ForcedKind;
}

/** Consecutive London-style date strings (YYYY-MM-DD) used as seeds, as the production timer does. */
export function dateSeeds(days: number, start = '2025-01-01'): string[] {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(base + i * 86_400_000).toISOString().slice(0, 10));
}

export function simulateDays(agg: AggregateResult, days: number, start?: string): DayResult[] {
  return dateSeeds(days, start).map((seed) => {
    const game = generateGame(agg, seed);
    const category = game.questions.length > 0 ? game.questions[0].left.category : null;
    return { seed, game, category };
  });
}

export function bridgeOf(q: GameQuestion): { bridge: GameItem; other: GameItem } | null {
  if (q.carryover === undefined) return null;
  return q.carryover === 'left' ? { bridge: q.left, other: q.right } : { bridge: q.right, other: q.left };
}

/**
 * The scale a regular player knows. floor: lowest count of any item that appears in a game, over
 * all categories (so a rarely-chosen category does not distort it). ceiling: highest play count of
 * that category in the data.
 */
export function knownRanges(agg: AggregateResult, results: DayResult[]): Record<ItemCategory, CountRange> {
  let floor = Infinity;
  for (const r of results) {
    for (const q of r.game.questions) floor = Math.min(floor, q.left.count, q.right.count);
  }
  const top = (m: Record<string, { count: number }>) => Object.values(m).reduce((a, x) => Math.max(a, x.count), 0);
  return {
    track: { floor, ceiling: top(agg.trackMap) },
    artist: { floor, ceiling: top(agg.artistMap) },
    album: { floor, ceiling: top(agg.albumMap) },
  };
}

const EPS = 1e-9;

/** Returns why the answer is deducible from the bridge count alone, or null when it is not. */
export function forcedKind(bridgeCount: number, range: CountRange, minGap: number = RULES.MIN_GAP): ForcedKind | null {
  const b = bridgeCount;
  const lowerLo = Math.max(range.floor, Math.ceil(b / RULES.MAX_RATIO - EPS));
  const lowerHi = Math.min(b - minGap, Math.floor(b / RULES.MIN_RATIO + EPS));
  if (lowerLo > lowerHi) return 'mystery-must-be-higher';
  const upperLo = Math.max(b + minGap, Math.ceil(b * RULES.MIN_RATIO - EPS));
  const upperHi = Math.min(Math.floor(b * RULES.MAX_RATIO + EPS), range.ceiling);
  if (upperLo > upperHi) return 'mystery-must-be-lower';
  return null;
}

export function findForced(
  results: DayResult[],
  ranges: Record<ItemCategory, CountRange>,
  minGap: number = RULES.MIN_GAP
): ForcedQuestion[] {
  const out: ForcedQuestion[] = [];
  for (const r of results) {
    for (const q of r.game.questions) {
      const pair = bridgeOf(q);
      if (!pair) continue;
      const kind = forcedKind(pair.bridge.count, ranges[pair.bridge.category], minGap);
      if (kind) {
        out.push({
          seed: r.seed,
          questionIndex: q.index + 1,
          category: pair.bridge.category,
          bridgeName: pair.bridge.name,
          bridgeCount: pair.bridge.count,
          otherCount: pair.other.count,
          kind,
        });
      }
    }
  }
  return out;
}

export interface PairViolation {
  seed: string;
  questionIndex: number;
  category: ItemCategory;
  left: number;
  right: number;
  reason: string;
}

/** Q-3: every question's pair must differ by >= MIN_GAP plays and sit inside the ratio band. */
export function findPairViolations(results: DayResult[]): PairViolation[] {
  const out: PairViolation[] = [];
  for (const r of results) {
    for (const q of r.game.questions) {
      const hi = Math.max(q.left.count, q.right.count);
      const lo = Math.min(q.left.count, q.right.count);
      const gap = hi - lo;
      const ratio = lo > 0 ? hi / lo : Infinity;
      let reason = '';
      if (gap < RULES.MIN_GAP) reason = `counts differ by only ${gap} play(s)`;
      else if (ratio < RULES.MIN_RATIO - EPS) reason = `ratio ${ratio.toFixed(2)} below ${RULES.MIN_RATIO}`;
      else if (ratio > RULES.MAX_RATIO + EPS) reason = `ratio ${ratio.toFixed(2)} above ${RULES.MAX_RATIO}`;
      if (reason) {
        out.push({
          seed: r.seed,
          questionIndex: q.index + 1,
          category: q.left.category,
          left: q.left.count,
          right: q.right.count,
          reason,
        });
      }
    }
  }
  return out;
}

export interface CarryStats {
  /** Questions with a revealed carried item (Q2 onwards). */
  questions: number;
  carriedWins: number;
  carriedWinShare: number;
}

export function carriedWinStats(results: DayResult[]): CarryStats {
  let questions = 0;
  let carriedWins = 0;
  for (const r of results) {
    for (const q of r.game.questions) {
      if (q.carryover === undefined) continue;
      questions++;
      if (q.winner === q.carryover) carriedWins++;
    }
  }
  return { questions, carriedWins, carriedWinShare: questions === 0 ? 0 : carriedWins / questions };
}

export function fullGameShare(results: DayResult[], targetQuestions = 10): number {
  const full = results.filter((r) => !r.game.lowData && r.game.questions.length === targetQuestions).length;
  return results.length === 0 ? 0 : full / results.length;
}

// ---- Report-only helpers (used by the sim script) ----------------------------------------------

function bucketise(values: number[], edges: Array<{ label: string; max: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of edges) out[e.label] = 0;
  for (const v of values) {
    const e = edges.find((x) => v <= x.max) ?? edges[edges.length - 1];
    out[e.label]++;
  }
  return out;
}

export interface SimReport {
  days: number;
  categoryMix: Record<string, number>;
  lowDataShare: number;
  fullGameShare: number;
  questionsPerDay: number;
  carry: CarryStats;
  forcedCount: number;
  forcedShare: number;
  /** Forced under the CURRENT rules only (a gap of 1 is allowed): the bridge sits on the floor/ceiling. */
  forcedLegacyCount: number;
  forcedLegacyShare: number;
  forcedByKind: Record<string, number>;
  forcedByBridgeCount: Record<string, number>;
  oneGapCount: number;
  oneGapShare: number;
  threeVsFourCount: number;
  gapHistogram: Record<string, number>;
  ratioHistogram: Record<string, number>;
  ranges: Record<ItemCategory, CountRange>;
  pairViolations: number;
  /** Questions that follow a bridge (Q2 onwards). */
  asked: number;
  ramp: RampStats;
  rampByCategory: Record<string, RampStats>;
}

export function buildReport(agg: AggregateResult, results: DayResult[]): SimReport {
  const ranges = knownRanges(agg, results);
  const forced = findForced(results, ranges);
  const forcedLegacy = findForced(results, ranges, 1);
  const carry = carriedWinStats(results);

  const categoryMix: Record<string, number> = { track: 0, artist: 0, album: 0, none: 0 };
  for (const r of results) categoryMix[r.category ?? 'none']++;

  const gaps: number[] = [];
  const ratios: number[] = [];
  let threeVsFour = 0;
  let totalQuestions = 0;
  for (const r of results) {
    for (const q of r.game.questions) {
      totalQuestions++;
      const hi = Math.max(q.left.count, q.right.count);
      const lo = Math.min(q.left.count, q.right.count);
      gaps.push(hi - lo);
      ratios.push(hi / lo);
      if (lo === 3 && hi === 4) threeVsFour++;
    }
  }
  const oneGap = gaps.filter((g) => g === 1).length;

  const forcedByKind: Record<string, number> = {};
  const forcedByBridgeCount: Record<string, number> = {};
  for (const f of forced) {
    forcedByKind[f.kind] = (forcedByKind[f.kind] ?? 0) + 1;
    const k = `${f.category}:${f.bridgeCount}`;
    forcedByBridgeCount[k] = (forcedByBridgeCount[k] ?? 0) + 1;
  }

  return {
    days: results.length,
    categoryMix,
    lowDataShare: results.length === 0 ? 0 : results.filter((r) => r.game.lowData).length / results.length,
    fullGameShare: fullGameShare(results),
    questionsPerDay: results.length === 0 ? 0 : totalQuestions / results.length,
    carry,
    forcedCount: forced.length,
    forcedShare: carry.questions === 0 ? 0 : forced.length / carry.questions,
    forcedLegacyCount: forcedLegacy.length,
    forcedLegacyShare: carry.questions === 0 ? 0 : forcedLegacy.length / carry.questions,
    forcedByKind,
    forcedByBridgeCount,
    oneGapCount: oneGap,
    oneGapShare: totalQuestions === 0 ? 0 : oneGap / totalQuestions,
    threeVsFourCount: threeVsFour,
    gapHistogram: bucketise(gaps, [
      { label: '1', max: 1 },
      { label: '2', max: 2 },
      { label: '3', max: 3 },
      { label: '4', max: 4 },
      { label: '5', max: 5 },
      { label: '6-10', max: 10 },
      { label: '11-25', max: 25 },
      { label: '26+', max: Infinity },
    ]),
    ratioHistogram: bucketise(ratios, [
      { label: '<1.15', max: 1.15 - EPS },
      { label: '1.15-1.3', max: 1.3 },
      { label: '1.3-1.5', max: 1.5 },
      { label: '1.5-2', max: 2 },
      { label: '2-2.5', max: 2.5 },
      { label: '2.5-3', max: 3 + EPS },
      { label: '>3', max: Infinity },
    ]),
    ranges,
    pairViolations: findPairViolations(results).length,
    asked: carry.questions,
    ramp: rampStats(results),
    rampByCategory: {
      track: rampStats(results, 'track'),
      artist: rampStats(results, 'artist'),
      album: rampStats(results, 'album'),
    },
  };
}
