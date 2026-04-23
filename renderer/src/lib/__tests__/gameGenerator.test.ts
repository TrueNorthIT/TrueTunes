import { describe, it, expect } from 'vitest';
import { aggregateEvents, RawEvent } from '../../../../server/src/shared/aggregate';
import { generateGame, mulberry32 } from '../../../../server/src/shared/gameGenerator';

function ev(overrides: Partial<RawEvent> & { userId: string; trackName: string; artist: string }): RawEvent {
  return {
    userId: overrides.userId,
    trackName: overrides.trackName,
    artist: overrides.artist,
    artistId: overrides.artistId,
    album: overrides.album ?? null,
    albumId: overrides.albumId ?? null,
    imageUrl: overrides.imageUrl ?? null,
    uri: overrides.uri ?? null,
  };
}

function manyEvents(args: {
  userId: string;
  trackName: string;
  artist: string;
  album?: string;
  albumId?: string;
  n: number;
}): RawEvent[] {
  return Array.from({ length: args.n }, () =>
    ev({
      userId: args.userId,
      trackName: args.trackName,
      artist: args.artist,
      album: args.album,
      albumId: args.albumId,
    }),
  );
}

describe('aggregateEvents', () => {
  it('counts plays per track, artist, album and records queuers', () => {
    const events = [
      ...manyEvents({ userId: 'alice', trackName: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours', n: 3 }),
      ...manyEvents({ userId: 'bob', trackName: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours', n: 2 }),
      ...manyEvents({ userId: 'alice', trackName: 'The Chain', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours', n: 1 }),
    ];
    const agg = aggregateEvents(events);

    expect(Object.keys(agg.trackMap)).toHaveLength(2);
    expect(agg.trackMap['Dreams||Fleetwood Mac'].count).toBe(5);
    expect(agg.trackMap['The Chain||Fleetwood Mac'].count).toBe(1);

    expect(agg.artistMap['Fleetwood Mac'].count).toBe(6);
    expect(agg.albumMap['alb-rumours'].count).toBe(6);

    expect(agg.userCounts.alice).toBe(4);
    expect(agg.userCounts.bob).toBe(2);

    expect(agg.queuersByItem['track:Dreams||Fleetwood Mac']).toEqual({ alice: 3, bob: 2 });
    expect(agg.queuersByItem['artist:Fleetwood Mac']).toEqual({ alice: 4, bob: 2 });
  });

  it('handles missing album gracefully', () => {
    const events = [ev({ userId: 'u1', trackName: 'Free Beer', artist: 'DIY', album: null })];
    const agg = aggregateEvents(events);
    expect(Object.keys(agg.albumMap)).toHaveLength(0);
  });
});

describe('aggregateEvents — eventType branching', () => {
  it("eventType 'track' bumps trackMap + artistMap + userCounts but not albumMap", () => {
    const events: RawEvent[] = [
      { eventType: 'track', userId: 'alice', trackName: 'Dreams',    artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
      { eventType: 'track', userId: 'alice', trackName: 'The Chain', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
    ];
    const agg = aggregateEvents(events);
    expect(agg.trackMap['Dreams||Fleetwood Mac'].count).toBe(1);
    expect(agg.trackMap['The Chain||Fleetwood Mac'].count).toBe(1);
    expect(agg.artistMap['Fleetwood Mac'].count).toBe(2);
    expect(agg.userCounts.alice).toBe(2);
    expect(agg.albumMap['alb-rumours']).toBeUndefined();
  });

  it("eventType 'album' bumps albumMap only — no trackMap, artistMap, or userCounts", () => {
    const events: RawEvent[] = [
      { eventType: 'album', userId: 'alice', trackName: 'Rumours', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
    ];
    const agg = aggregateEvents(events);
    expect(agg.albumMap['alb-rumours'].count).toBe(1);
    expect(Object.keys(agg.trackMap)).toHaveLength(0);
    expect(Object.keys(agg.artistMap)).toHaveLength(0);
    expect(Object.keys(agg.userCounts)).toHaveLength(0);
  });

  it('legacy events (no eventType) keep flowing into all three maps + userCounts', () => {
    const events: RawEvent[] = [
      { userId: 'alice', trackName: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
    ];
    const agg = aggregateEvents(events);
    expect(agg.trackMap['Dreams||Fleetwood Mac'].count).toBe(1);
    expect(agg.artistMap['Fleetwood Mac'].count).toBe(1);
    expect(agg.albumMap['alb-rumours'].count).toBe(1);
    expect(agg.userCounts.alice).toBe(1);
  });

  it('an album add (1 album event + N track events) gives albumMap +1, artistMap +N, userCounts +N — never +N+1', () => {
    // Simulates queueing one 3-track album under the new scheme.
    const events: RawEvent[] = [
      { eventType: 'album', userId: 'alice', trackName: 'Rumours',  artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
      { eventType: 'track', userId: 'alice', trackName: 'Dreams',   artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
      { eventType: 'track', userId: 'alice', trackName: 'The Chain',artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
      { eventType: 'track', userId: 'alice', trackName: 'Go Your Own Way', artist: 'Fleetwood Mac', album: 'Rumours', albumId: 'alb-rumours' },
    ];
    const agg = aggregateEvents(events);
    expect(agg.albumMap['alb-rumours'].count).toBe(1);   // not 4
    expect(agg.artistMap['Fleetwood Mac'].count).toBe(3); // not 4 — album event must not contribute
    expect(Object.keys(agg.trackMap)).toHaveLength(3);
    expect(agg.userCounts.alice).toBe(3); // not 4 — album event must not bump userCounts
  });
});

describe('generateGame', () => {
  function buildAgg(): ReturnType<typeof aggregateEvents> {
    const users = ['alice', 'bob', 'cara', 'dan'];
    const events: RawEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push(
        ...manyEvents({
          userId: users[i % users.length],
          trackName: `Track ${i}`,
          artist: `Artist ${i % 6}`,
          album: `Album ${i % 5}`,
          albumId: `alb-${i % 5}`,
          n: 6 + (i % 4),
        }),
      );
    }
    return aggregateEvents(events);
  }

  it('produces a deterministic game for the same seed', () => {
    const agg = buildAgg();
    const a = generateGame(agg, '2026-04-21');
    const b = generateGame(agg, '2026-04-21');
    expect(a.questions.map((q) => `${q.left.category}:${q.left.id}|${q.right.category}:${q.right.id}`)).toEqual(
      b.questions.map((q) => `${q.left.category}:${q.left.id}|${q.right.category}:${q.right.id}`),
    );
  });

  it('marks winner as the side with the higher count', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-1');
    for (const q of questions) {
      expect(q.left.count).not.toBe(q.right.count);
      const expected = q.left.count > q.right.count ? 'left' : 'right';
      expect(q.winner).toBe(expected);
    }
  });

  it('does not pair an entity with itself across categories', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-2');
    for (const q of questions) {
      if (q.left.albumKey && q.right.albumKey) {
        expect(q.left.albumKey).not.toBe(q.right.albumKey);
      }
      if (q.left.category === 'artist' || q.right.category === 'artist') {
        if (q.left.artistKey && q.right.artistKey) {
          expect(q.left.artistKey).not.toBe(q.right.artistKey);
        }
      }
    }
  });

  it('does not reuse the same mystery item across questions', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-3');
    // The bridge (carryover) item is intentionally shared with the previous question.
    // Only the mystery (non-carryover) side must be unique.
    const seenMysteries = new Set<string>();
    for (const q of questions) {
      if (q.carryover === undefined) {
        // Q1: both are new
        const lKey = `${q.left.category}:${q.left.id}`;
        const rKey = `${q.right.category}:${q.right.id}`;
        expect(seenMysteries.has(lKey)).toBe(false);
        expect(seenMysteries.has(rKey)).toBe(false);
        seenMysteries.add(lKey);
        seenMysteries.add(rKey);
      } else {
        const mystery = q.carryover === 'left' ? q.right : q.left;
        const key = `${mystery.category}:${mystery.id}`;
        expect(seenMysteries.has(key)).toBe(false);
        seenMysteries.add(key);
      }
    }
  });

  it('uses chain structure: Q1 has no carryover, Q2+ have carryover', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-3');
    if (questions.length > 0) expect(questions[0].carryover).toBeUndefined();
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i].carryover).toMatch(/^(left|right)$/);
    }
  });

  it('each bonusItem points to a unique item across questions', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-3');
    const seenBonus = new Set<string>();
    for (const q of questions) {
      const bonusSide = q.bonusItem;
      const item = bonusSide === 'left' ? q.left : q.right;
      const key = `${item.category}:${item.id}`;
      expect(seenBonus.has(key)).toBe(false);
      seenBonus.add(key);
    }
  });

  it('consecutive questions share the bridge item', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-3');
    for (let i = 1; i < questions.length; i++) {
      const prev = questions[i - 1];
      const curr = questions[i];
      // The bridge in curr is the carryover side — should match a side from prev
      const bridgeSide = curr.carryover!;
      const bridge = bridgeSide === 'left' ? curr.left : curr.right;
      const prevLeft = `${prev.left.category}:${prev.left.id}`;
      const prevRight = `${prev.right.category}:${prev.right.id}`;
      const bridgeKey = `${bridge.category}:${bridge.id}`;
      expect([prevLeft, prevRight]).toContain(bridgeKey);
    }
  });

  it('filters out pairs outside the ratio band', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-4');
    for (const q of questions) {
      const max = Math.max(q.left.count, q.right.count);
      const min = Math.min(q.left.count, q.right.count);
      const ratio = max / min;
      expect(ratio).toBeGreaterThanOrEqual(1.15);
      expect(ratio).toBeLessThanOrEqual(3.0);
    }
  });

  it('every item has a top queuer and at least 2 candidates', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-5');
    for (const q of questions) {
      for (const side of [q.left, q.right]) {
        expect(side.topQueuer.length).toBeGreaterThan(0);
        expect(side.queuerCandidates.length).toBeGreaterThanOrEqual(2);
        expect(side.queuerCandidates).toContain(side.topQueuer);
      }
    }
  });

  it('returns lowData=true when there are too few candidates', () => {
    const sparse = aggregateEvents([...manyEvents({ userId: 'alice', trackName: 'Only One', artist: 'Solo', n: 10 })]);
    const result = generateGame(sparse, 'sparse');
    expect(result.lowData).toBe(true);
    expect(result.questions.length).toBeLessThan(10);
  });
});

describe('mulberry32', () => {
  it('produces deterministic output for the same seed', () => {
    const a = mulberry32('hello');
    const b = mulberry32('hello');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('produces different output for different seeds', () => {
    const a = mulberry32('hello')();
    const b = mulberry32('world')();
    expect(a).not.toBe(b);
  });
});
