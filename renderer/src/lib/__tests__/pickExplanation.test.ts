import { describe, it, expect } from 'vitest';
import { explainPick } from '../pickExplanation';

// explainPick turns a DJ pick's server data into the lines of the "Why this pick" tooltip.

const BECAUSE = 'Rich and Alex queue HAIM — never played here';

function fans(n: number) {
  // Person1 queued most (n times) ... PersonN least (1 time): strictly descending, as the server sends them.
  return Array.from({ length: n }, (_, i) => ({ user: `Person${i + 1}`, count: n - i }));
}

const RICH_ALEX = [
  { user: 'Rich', count: 14 },
  { user: 'Alex', count: 6 },
];

describe('artist line: who queued the artist, with numbers', () => {
  it('names the artist, then each person with their count, the first carrying the verb', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: [
        { user: 'Alex', count: 12 },
        { user: 'Rich', count: 4 },
      ],
      artist: 'Sugababes',
      kind: 'unheard',
    });
    expect(r.lines).toEqual(['Sugababes: Alex queued them 12 times, Rich 4 times']);
  });

  it('says once and twice for 1 and 2', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: [
        { user: 'Alex', count: 2 },
        { user: 'Rich', count: 1 },
      ],
      artist: 'Sugababes',
      kind: 'unheard',
    });
    expect(r.lines).toEqual(['Sugababes: Alex queued them twice, Rich once']);
  });

  it('names the viewer "You"', () => {
    const r = explainPick({ because: BECAUSE, fans: RICH_ALEX, viewer: 'Rich', artist: 'Justice', kind: 'unheard' });
    expect(r.lines).toEqual(['Justice: You queued them 14 times, Alex 6 times']);
  });

  it('leaves names alone when the viewer is not credited', () => {
    const r = explainPick({ because: BECAUSE, fans: RICH_ALEX, viewer: 'Sam', artist: 'Justice', kind: 'unheard' });
    expect(r.lines[0]).toBe('Justice: Rich queued them 14 times, Alex 6 times');
  });

  it('lists up to 6 people, then "and N more"', () => {
    expect(explainPick({ because: BECAUSE, fans: fans(6), artist: 'X', kind: 'unheard' }).lines[0]).toBe(
      'X: Person1 queued them 6 times, Person2 5 times, Person3 4 times, Person4 3 times, Person5 twice, Person6 once'
    );
    expect(explainPick({ because: BECAUSE, fans: fans(8), artist: 'X', kind: 'unheard' }).lines[0]).toBe(
      'X: Person1 queued them 8 times, Person2 7 times, Person3 6 times, Person4 5 times, Person5 4 times, Person6 3 times, and 2 more'
    );
  });
});

describe('song line (played picks)', () => {
  it('leads with "This song" ahead of the artist line', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: RICH_ALEX,
      trackFans: [
        { user: 'Rich', count: 3 },
        { user: 'Alex', count: 1 },
      ],
      artist: 'Justice',
      trackName: 'Genesis',
      kind: 'played',
    });
    expect(r.lines).toEqual([
      'This song: Rich queued it 3 times, Alex once',
      'Justice: Rich queued them 14 times, Alex 6 times',
    ]);
  });

  it('uses You for the viewer', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: RICH_ALEX,
      trackFans: [
        { user: 'Rich', count: 3 },
        { user: 'Alex', count: 2 },
      ],
      viewer: 'Rich',
      kind: 'played',
    });
    expect(r.lines[0]).toBe('This song: You queued it 3 times, Alex twice');
  });

  it('has no song line when trackFans is empty or absent', () => {
    expect(
      explainPick({ because: BECAUSE, fans: RICH_ALEX, trackFans: [], artist: 'Justice', kind: 'played' }).lines
    ).toEqual(['Justice: Rich queued them 14 times, Alex 6 times']);
    expect(explainPick({ because: BECAUSE, fans: RICH_ALEX, artist: 'Justice', kind: 'played' }).lines).toHaveLength(1);
  });

  it('has no song line on unheard picks, and ends with the never-played line instead', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: RICH_ALEX,
      trackFans: [{ user: 'Rich', count: 3 }],
      artist: 'Sugababes',
      trackName: 'Too Lost In You',
      kind: 'unheard',
    });
    expect(r.lines).toEqual([
      'Sugababes: Rich queued them 14 times, Alex 6 times',
      '"Too Lost In You" has never been played here',
    ]);
  });

  it('has no never-played line on played picks or without a track name', () => {
    expect(
      explainPick({ because: BECAUSE, fans: RICH_ALEX, trackName: 'Seventeen', kind: 'played' }).lines.join()
    ).not.toContain('never been played');
    expect(explainPick({ because: BECAUSE, fans: RICH_ALEX, kind: 'unheard' }).lines).toHaveLength(1);
  });
});

describe('picks with nobody to credit explain themselves', () => {
  it('uses the "Like {neighbour}" reason when fans is empty', () => {
    expect(explainPick({ because: 'Like Muse, which the room plays', fans: [], kind: 'played' }).lines).toEqual([
      'Like Muse, which the room plays',
    ]);
  });

  it('uses "Popular with the office", then the never-played line for an unheard track', () => {
    const r = explainPick({ because: 'Popular with the office', fans: [], trackName: 'Seventeen', kind: 'unheard' });
    expect(r.lines).toEqual(['Popular with the office', '"Seventeen" has never been played here']);
  });

  it('has no reason when somebody is credited', () => {
    const r = explainPick({ because: BECAUSE, fans: [{ user: 'Rich', count: 3 }], kind: 'unheard' });
    expect(r.lines).toEqual(['Rich queued them 3 times']);
  });
});

describe('before the server is redeployed (no fans): names only, no counts', () => {
  const OLD = 'Rich, Alex, Sam and others queue HAIM — never played here';

  it('parses the people out of because, dropping "others" and the " — ..." suffix', () => {
    expect(explainPick({ because: OLD, artist: 'HAIM', kind: 'unheard' }).lines).toEqual([
      'HAIM: Rich, Alex and Sam queue them',
    ]);
  });

  it('parses a pair and a single person', () => {
    expect(explainPick({ because: 'Rich and Alex queue HAIM', artist: 'Sugababes', kind: 'unheard' }).lines).toEqual([
      'Sugababes: Rich and Alex queue them',
    ]);
    expect(explainPick({ because: 'Rich queues HAIM', kind: 'unheard' }).lines).toEqual(['Rich queues them']);
  });

  it('still shows the viewer as "You"', () => {
    expect(explainPick({ because: OLD, viewer: 'Alex', artist: 'HAIM', kind: 'unheard' }).lines).toEqual([
      'HAIM: Rich, You and Sam queue them',
    ]);
  });

  it("falls back to the reason when the old server's because names nobody", () => {
    expect(explainPick({ because: 'Popular with the office', kind: 'unheard' }).lines).toEqual([
      'Popular with the office',
    ]);
  });
});
