// Requirements for the daily Queuedle generator (server/src/shared/gameGenerator.ts, `generateGame`).
//
// Problem being fixed: on track days the game often pits 3 plays against 4. Because 3 is the
// eligibility floor, a player shown a carried-over "3" (or "4") can deduce the answer without
// knowing the music. The older gameGenerator.test.ts fixture only used counts 6-9, which hid this.
//
// These tests run the real generator against a realistic synthetic aggregate built from
// production counts (see server/scripts/queuedle-sim/fixture.ts) over 1,000 seeded days.
// The same helpers drive the simulation report: `cd server && npm run sim:queuedle`.
//
// What the player sees (renderer/src/components/queuedle/QueuedleQuestionCard.tsx): from
// question 2 onwards the carried-over "bridge" item (question.carryover side) shows its play count
// before the player answers; the other side (the "mystery") shows only its name.
// "Forced answer" is defined precisely in server/scripts/queuedle-sim/analysis.ts (forcedKind):
// the bridge count, plus the floor/ceiling/gap/ratio rules of the game, rules out one side.

import { beforeAll, describe, expect, it } from 'vitest';
import { generateGame, GeneratedGame } from '../../../../server/src/shared/gameGenerator';
import type { AggregateResult } from '../../../../server/src/shared/aggregate';
import {
  buildRealisticAggregate,
  DataVariant,
} from '../../../../server/scripts/queuedle-sim/fixture';
import {
  carriedWinStats,
  rampStats,
  DayResult,
  findForced,
  findPairViolations,
  fullGameShare,
  knownRanges,
  RULES,
  simulateDays,
} from '../../../../server/scripts/queuedle-sim/analysis';

const DAYS = 1000;
const VARIANTS: Array<{ variant: DataVariant; label: string }> = [
  { variant: 'allTime', label: 'all-time data' },
  { variant: 'ninetyDay', label: '90-day-like data' },
];

const sims = new Map<DataVariant, { agg: AggregateResult; results: DayResult[] }>();

beforeAll(() => {
  for (const { variant } of VARIANTS) {
    const agg = buildRealisticAggregate(variant);
    sims.set(variant, { agg, results: simulateDays(agg, DAYS) });
  }
}, 180_000);

function sample<T>(items: T[], n = 5): string {
  return JSON.stringify(items.slice(0, n), null, 1);
}

describe.each(VARIANTS)('Queuedle generator on $label', ({ variant, label }) => {
  const results = () => sims.get(variant)!.results;

  // Q-1: No question has a forced answer.
  // Given 1,000 seeded days of realistic data, `generateGame` must never produce a question whose
  // revealed carried item (the bridge) lets the player deduce the answer from the game's rules
  // (e.g. a revealed count at the floor means the hidden item must be higher). Expected change in
  // gameGenerator.ts: pick bridges/mystery items so the bridge is never at the floor or ceiling.
  it(`Q-1: no question has a forced answer across ${DAYS} seeded days (${label})`, () => {
    const all = results();
    const asked = carriedWinStats(all).questions;
    expect(asked, 'Q-1 needs bridge questions to analyse; the generator produced almost none').toBeGreaterThan(1000);

    const ranges = knownRanges(sims.get(variant)!.agg, all);
    const forced = findForced(all, ranges);
    expect(
      forced.length,
      `Q-1: expected 0 forced-answer questions, found ${forced.length} of ${asked} bridge questions ` +
        `(${((forced.length / asked) * 100).toFixed(1)}%). Count scale (floor = lowest count shown in any game, ceiling = top count in data): ${JSON.stringify(ranges)}. ` +
        `First examples (bridge count is what the player sees; "mystery-must-be-higher" means the ` +
        `bridge sits at/near the floor so the other side cannot be lower):\n${sample(forced)}`,
    ).toBe(0);
  });

  // Q-2: The answer side is not predictable.
  // Across the simulated days the carried (revealed) item should win in roughly half of the
  // questions that have one (40-60%). Guards against the fix biasing the hidden item to always
  // be higher (or lower) than the revealed one.
  it(`Q-2: the carried-over item wins between 40% and 60% of questions (${label})`, () => {
    const { questions, carriedWins, carriedWinShare } = carriedWinStats(results());
    expect(questions, 'Q-2 needs bridge questions to analyse; the generator produced almost none').toBeGreaterThan(1000);
    expect(
      carriedWinShare,
      `Q-2: expected the revealed carried item to win 40-60% of the time, but it won ${carriedWins} of ` +
        `${questions} (${(carriedWinShare * 100).toFixed(1)}%). Players could exploit a skewed answer side.`,
    ).toBeGreaterThanOrEqual(0.4);
    expect(
      carriedWinShare,
      `Q-2: expected the revealed carried item to win 40-60% of the time, but it won ${carriedWins} of ` +
        `${questions} (${(carriedWinShare * 100).toFixed(1)}%). Players could exploit a skewed answer side.`,
    ).toBeLessThanOrEqual(0.6);
  });

  // Q-3: Paired counts never differ by only 1 play ("3 vs 4 never appears"), and the larger count
  // stays within a sensible multiple of the smaller (1.15x to 3x, as before).
  it(`Q-3: no question pairs counts that differ by only ${RULES.MIN_GAP - 1} play, and ratios stay in ${RULES.MIN_RATIO}-${RULES.MAX_RATIO} (${label})`, () => {
    const all = results();
    const questions = all.reduce((n, r) => n + r.game.questions.length, 0);
    expect(questions, 'Q-3 needs questions to analyse; the generator produced almost none').toBeGreaterThan(1000);

    const violations = findPairViolations(all);
    expect(
      violations.length,
      `Q-3: expected every question to pair counts at least ${RULES.MIN_GAP} plays apart with ratio ` +
        `${RULES.MIN_RATIO}-${RULES.MAX_RATIO}, but ${violations.length} of ${questions} questions broke this. ` +
        `First examples:\n${sample(violations)}`,
    ).toBe(0);
  });
});

describe('Queuedle generator on all-time data: full games', () => {
  // Q-4: Tightening the pairing rules must not starve the generator. On realistic all-time data a
  // full 10-question game (lowData false) is still produced on at least 95% of days.
  it(`Q-4: a full 10-question game is produced on at least 95% of ${DAYS} days`, () => {
    const all = sims.get('allTime')!.results;
    const share = fullGameShare(all, 10);
    const short = all.filter((r) => r.game.lowData || r.game.questions.length !== 10);
    expect(
      share,
      `Q-4: expected >= 95% of days to yield 10 questions with lowData=false, got ` +
        `${(share * 100).toFixed(1)}% (${short.length} of ${all.length} days short). ` +
        `First short days: ${JSON.stringify(short.slice(0, 5).map((r) => ({ seed: r.seed, questions: r.game.questions.length })))}`,
    ).toBeGreaterThanOrEqual(0.95);
  });
});

describe('Queuedle generator on all-time data: category mix', () => {
  // Q-6: Enforcing Q-1/Q-3 must not make one category dominate. Track days and artist days must each
  // be at least 25% of the days (album days make up the rest).
  it(`Q-6: track days and artist days are each at least 25% of ${DAYS} seeded days`, () => {
    const all = sims.get('allTime')!.results;
    const share = (c: string) => all.filter((r) => r.category === c).length / all.length;
    const mix = { track: share('track'), artist: share('artist'), album: share('album') };
    expect(mix.track, `Q-6: track days below 25%. Mix: ${JSON.stringify(mix)}`).toBeGreaterThanOrEqual(0.25);
    expect(mix.artist, `Q-6: artist days below 25%. Mix: ${JSON.stringify(mix)}`).toBeGreaterThanOrEqual(0.25);
  });
});

describe('Queuedle generator on all-time data: difficulty ramp', () => {
  // Q-7: Questions get harder as the game goes on. Ratio = higher/lower count of the pair. Preferred
  // bands: Q1-3 easy (>= 2.0), Q4-7 medium (1.5-2.0), Q8-10 hard (1.15-1.5). Bands are a preference.
  it('Q-7: mean ratio ramps down easy > medium > hard and most questions land in their band', () => {
    const st = rampStats(sims.get('allTime')!.results);
    const ctx = JSON.stringify({ bandMeans: st.bandMeans, inBand: st.inBandShare, byQ: st.byQuestion.map((r) => +r.meanRatio.toFixed(2)) });
    const early = st.byQuestion.slice(0, 3);
    const late = st.byQuestion.slice(7, 10);
    const meanOf = (rows: typeof early) => rows.reduce((a, r) => a + r.meanRatio * r.n, 0) / rows.reduce((a, r) => a + r.n, 0);
    expect(meanOf(early), `Q-7: mean ratio of Q1-Q3 should be >= 1.8. ${ctx}`).toBeGreaterThanOrEqual(1.8);
    expect(meanOf(late), `Q-7: mean ratio of Q8-Q10 should be <= 1.5. ${ctx}`).toBeLessThanOrEqual(1.5);
    expect(st.bandMeans.easy, `Q-7: easy mean must exceed medium. ${ctx}`).toBeGreaterThan(st.bandMeans.medium);
    expect(st.bandMeans.medium, `Q-7: medium mean must exceed hard. ${ctx}`).toBeGreaterThan(st.bandMeans.hard);
    expect(st.inBandShare, `Q-7: in-band share should be >= 70%. ${ctx}`).toBeGreaterThanOrEqual(0.7);
  });
});

describe('Queuedle generator: small pool (diagnostic)', () => {
  // Q-1 / Q-3 on a tiny hand-built pool of tracks with counts 3..12, one per album. The game may
  // be short (lowData) but every question it does produce must still obey both rules.
  function smallPool(): AggregateResult {
    const agg: AggregateResult = { trackMap: {}, artistMap: {}, albumMap: {}, userCounts: {}, queuersByItem: {} };
    for (let count = 3; count <= 12; count++) {
      const key = `Song ${count}||Band ${count}`;
      agg.trackMap[key] = {
        key,
        trackName: `Song ${count}`,
        artist: `Band ${count}`,
        album: `Album ${count}`,
        albumId: `alb-${count}`,
        count,
      };
      agg.queuersByItem[`track:${key}`] = { alice: count };
    }
    agg.userCounts = { alice: 75, bob: 10, cara: 10, dan: 10 };
    return agg;
  }

  let pool: AggregateResult;
  let days: DayResult[] = [];
  beforeAll(() => {
    pool = smallPool();
    days = simulateDays(pool, 300);
  });

  it('Q-3: a pool containing counts 3..12 never yields a pair differing by only 1 play', () => {
    expect(days.every((d) => d.game.questions.length > 0), 'Q-3: every seed should still yield at least one question').toBe(true);
    const violations = findPairViolations(days);
    expect(
      violations.length,
      `Q-3: expected no pair of counts differing by only 1 (e.g. 3 vs 4), found ${violations.length}. ` +
        `First examples:\n${sample(violations)}`,
    ).toBe(0);
  });

  it('Q-1: a pool containing counts 3..12 never shows a carried item whose count gives the answer away', () => {
    expect(
      carriedWinStats(days).questions,
      'Q-1: the small pool should still yield bridge questions (on average at least one per day) to analyse',
    ).toBeGreaterThan(300);
    const forced = findForced(days, knownRanges(pool, days));
    expect(
      forced.length,
      `Q-1: expected no forced-answer questions, found ${forced.length}. First examples:\n${sample(forced)}`,
    ).toBe(0);
  });
});

describe('Queuedle generator: determinism and returned shape', () => {
  const SEEDS = ['2026-04-21', '2026-04-22', '2026-05-01', 'seed-a', 'seed-b'];

  // Q-5 (determinism): the same seed and the same data must give an identical game, including every
  // item field and queuer candidate order. Two separately built aggregates guard against hidden state.
  it('Q-5: the same seed and the same data produce an identical game', () => {
    const aggA = buildRealisticAggregate('allTime');
    const aggB = buildRealisticAggregate('allTime');
    for (const seed of SEEDS) {
      const a = generateGame(aggA, seed);
      const b = generateGame(aggB, seed);
      expect(a.questions.length, `Q-5: seed ${seed} should produce some questions to compare`).toBeGreaterThan(0);
      expect(JSON.stringify(b), `Q-5: seed ${seed} produced a different game on a second run with identical data`).toBe(
        JSON.stringify(a),
      );
    }
  });

  // Q-5 (determinism on the same aggregate object): calling twice must not mutate the aggregate.
  it('Q-5: generating a game does not change the result of generating it again from the same aggregate', () => {
    const agg = buildRealisticAggregate('ninetyDay');
    const first = generateGame(agg, '2026-06-01');
    generateGame(agg, 'some-other-seed');
    const again = generateGame(agg, '2026-06-01');
    expect(JSON.stringify(again), 'Q-5: re-running a seed after another seed changed the game').toBe(JSON.stringify(first));
  });

  // Q-5 (shape): get-game/QueuedleQuestionCard rely on this exact structure.
  it('Q-5: the returned game keeps its shape (questions, lowData, per-question and per-item fields)', () => {
    const agg = buildRealisticAggregate('allTime');
    const questionKeys = ['bonusItem', 'carryover', 'index', 'left', 'right', 'winner'];
    const itemRequired = ['category', 'count', 'id', 'name', 'queuerCandidates', 'subtitle', 'topQueuer'];

    for (const seed of SEEDS) {
      const game: GeneratedGame = generateGame(agg, seed);
      expect(typeof game.lowData, `Q-5: seed ${seed} lowData must be a boolean`).toBe('boolean');
      expect(Array.isArray(game.questions), `Q-5: seed ${seed} questions must be an array`).toBe(true);
      expect(game.questions.length, `Q-5: seed ${seed} must produce at most 10 questions`).toBeLessThanOrEqual(10);
      expect(game.lowData, `Q-5: seed ${seed} lowData must be true exactly when fewer than 10 questions`).toBe(
        game.questions.length < 10,
      );
      expect(game.questions.length, `Q-5: seed ${seed} should produce at least one question`).toBeGreaterThan(0);

      game.questions.forEach((q, i) => {
        const where = `seed ${seed} question ${i + 1}`;
        // `carryover` is deliberately absent on question 1, so only key presence of the others is exact.
        const presentKeys = Object.keys(q).filter((k) => (q as unknown as Record<string, unknown>)[k] !== undefined).sort();
        const expectedKeys = i === 0 ? questionKeys.filter((k) => k !== 'carryover') : questionKeys;
        expect(presentKeys, `Q-5: ${where} must expose exactly ${expectedKeys.join(', ')}`).toEqual(expectedKeys);
        expect(q.index, `Q-5: ${where} index must equal its position`).toBe(i);
        expect(
          q.winner,
          `Q-5: ${where} winner must be the side with the higher count (${q.left.count} vs ${q.right.count})`,
        ).toBe(q.left.count > q.right.count ? 'left' : 'right');
        if (i === 0) {
          expect(q.carryover, `Q-5: ${where} (question 1) must have no carryover`).toBeUndefined();
        } else {
          expect(['left', 'right'], `Q-5: ${where} must say which side is carried over`).toContain(q.carryover);
          expect(
            q.bonusItem,
            `Q-5: ${where} bonusItem must be the new (non-carried) side`,
          ).toBe(q.carryover === 'left' ? 'right' : 'left');
        }
        for (const side of [q.left, q.right]) {
          for (const field of itemRequired) {
            expect(side, `Q-5: ${where} item "${side.name}" is missing field ${field}`).toHaveProperty(field);
          }
          expect(
            side.queuerCandidates.length,
            `Q-5: ${where} item "${side.name}" needs at least 2 queuer candidates`,
          ).toBeGreaterThanOrEqual(2);
          expect(side.queuerCandidates, `Q-5: ${where} candidates must contain the top queuer`).toContain(side.topQueuer);
        }
        expect(q.left.category, `Q-5: ${where} both sides must be the same category`).toBe(q.right.category);
      });
    }
  });
});
