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

  it('does not reuse the same item across questions', () => {
    const agg = buildAgg();
    const { questions } = generateGame(agg, 'seed-3');
    const seen = new Set<string>();
    for (const q of questions) {
      const lKey = `${q.left.category}:${q.left.id}`;
      const rKey = `${q.right.category}:${q.right.id}`;
      expect(seen.has(lKey)).toBe(false);
      expect(seen.has(rKey)).toBe(false);
      seen.add(lKey);
      seen.add(rKey);
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
