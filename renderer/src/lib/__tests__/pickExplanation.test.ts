import { describe, it, expect } from 'vitest';
import { explainPick } from '../pickExplanation';

// Production code under test: renderer/src/lib/pickExplanation.ts (does not exist yet), `explainPick`.
// It turns a DJ pick's server data (`because`, `fans`, `score`) into the content of the "Why this pick"
// tooltip shown from the info icon on Home pick cards, Discover act cards and the DJ's upcoming rows.
// Related: `pickReason` in renderer/src/lib/homeData.ts builds the "X & Y love Z" label from the same `because`.

const BECAUSE = 'Rich and Alex queue HAIM — never played here';

function fans(n: number) {
  // Person1 queued most (n times) ... PersonN least (1 time): strictly descending, as the server sends them.
  return Array.from({ length: n }, (_, i) => ({ user: `Person${i + 1}`, count: n - i }));
}

describe('REQ-W2: each credited person with how many times they have queued the artist, most first', () => {
  it('lists the people from the server fans with their counts, in the order given', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }],
      kind: 'unheard',
    });
    expect(r.people, 'Expected Rich (14) then Alex (6), heaviest first').toEqual([
      { name: 'Rich', count: 14 },
      { name: 'Alex', count: 6 },
    ]);
  });

  it('names the viewer "You" while keeping their count', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }],
      viewer: 'Rich',
      kind: 'unheard',
    });
    expect(r.people[0], 'Expected the viewer Rich to be shown as "You" with their count of 14').toEqual({
      name: 'You',
      count: 14,
    });
    expect(
      r.people.map((p) => p.name),
      "Expected the viewer's own name not to appear alongside \"You\"",
    ).toEqual(['You', 'Alex']);
  });

  it('leaves names alone when the viewer is not credited', () => {
    const r = explainPick({
      because: BECAUSE,
      fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }],
      viewer: 'Sam',
      kind: 'unheard',
    });
    expect(r.people.map((p) => p.name), 'Expected Rich and Alex when the viewer is someone else').toEqual([
      'Rich',
      'Alex',
    ]);
  });
});

describe('REQ-W3: every credited person is listed, up to 6 plus "and N more"', () => {
  it('lists all of 6 fans with nobody left over', () => {
    const r = explainPick({ because: BECAUSE, fans: fans(6), kind: 'unheard' });
    expect(r.people, 'Expected all 6 fans listed').toHaveLength(6);
    expect(r.more, 'Expected no "and N more" for exactly 6 fans').toBe(0);
  });

  it('shows the heaviest 6 of 8 fans and counts the other 2 as "more"', () => {
    const r = explainPick({ because: BECAUSE, fans: fans(8), kind: 'unheard' });
    expect(r.people.map((p) => p.name), 'Expected the 6 heaviest fans, in order').toEqual([
      'Person1', 'Person2', 'Person3', 'Person4', 'Person5', 'Person6',
    ]);
    expect(r.more, 'Expected "and 2 more" for 8 fans').toBe(2);
  });

  it('does not collapse a 3-fan pick into "and others"', () => {
    const r = explainPick({
      because: 'A, B, C and others queue Muse',
      fans: [{ user: 'A', count: 3 }, { user: 'B', count: 2 }, { user: 'C', count: 1 }],
      kind: 'unheard',
    });
    expect(r.people.map((p) => p.name), 'Expected every credited person named').toEqual(['A', 'B', 'C']);
    expect(r.more).toBe(0);
  });
});

describe('REQ-W4: how well the pick fits who is in, as a whole percentage', () => {
  it('rounds the 0..1 score to a whole percent (0.8231 -> 82)', () => {
    expect(explainPick({ because: BECAUSE, score: 0.8231, kind: 'unheard' }).fit).toBe(82);
  });

  it('rounds half up (0.825 -> 83)', () => {
    expect(explainPick({ because: BECAUSE, score: 0.825, kind: 'unheard' }).fit).toBe(83);
  });

  it('reports 0 for a score of 0 rather than treating it as missing', () => {
    expect(explainPick({ because: BECAUSE, score: 0, kind: 'unheard' }).fit, 'A score of 0 is a real 0%').toBe(0);
  });

  it('is null when the server sent no score', () => {
    expect(explainPick({ because: BECAUSE, kind: 'unheard' }).fit, 'Expected null so the UI hides the fit line').toBeNull();
  });
});

describe('REQ-W5: why this track', () => {
  it('Home/Discover (unheard) explains it is one of their top songs, never played here', () => {
    const r = explainPick({ because: BECAUSE, trackName: 'Seventeen', kind: 'unheard' });
    expect(r.track).toBe('"Seventeen": one of their top songs, never played here.');
  });

  it("queue DJ picks (played) explain it is one of the office's most-played songs by them", () => {
    const r = explainPick({ because: BECAUSE, trackName: 'Seventeen', kind: 'played' });
    expect(r.track).toBe('"Seventeen": one of the office\'s most-played songs by them.');
  });

  it('is null without a trackName (e.g. a Discover act card)', () => {
    const r = explainPick({ because: BECAUSE, kind: 'unheard' });
    expect(r.track, 'Expected no track line when there is no track name').toBeNull();
  });
});

describe('REQ-W6: picks with nobody to credit explain themselves, with no names list', () => {
  it('uses the "Like {neighbour}" reason when fans is empty', () => {
    const r = explainPick({ because: 'Like Muse, which the room plays', fans: [], kind: 'played' });
    expect(r.people, 'Expected no names list').toEqual([]);
    expect(r.more).toBe(0);
    expect(r.reason, "Expected the server's reason to be passed through").toBe('Like Muse, which the room plays');
  });

  it('uses "Popular with the office" when fans is empty', () => {
    const r = explainPick({ because: 'Popular with the office', fans: [], kind: 'unheard' });
    expect(r.people).toEqual([]);
    expect(r.reason).toBe('Popular with the office');
  });

  it('has no reason when somebody is credited', () => {
    const r = explainPick({ because: BECAUSE, fans: [{ user: 'Rich', count: 3 }], kind: 'unheard' });
    expect(r.reason, 'Expected reason to be null when there are names to show').toBeNull();
  });
});

describe('REQ-W10: before the server is redeployed (no fans, no score), names show without counts or fit', () => {
  const OLD = 'Rich, Alex, Sam and others queue HAIM — never played here';

  it('parses the people out of because, dropping "others" and the " — ..." suffix', () => {
    const r = explainPick({ because: OLD, kind: 'unheard' });
    expect(r.people, 'Expected Rich, Alex and Sam, with no counts').toEqual([
      { name: 'Rich' },
      { name: 'Alex' },
      { name: 'Sam' },
    ]);
    expect(r.more, 'Expected no "more" without server counts').toBe(0);
    expect(r.reason, 'Expected no reason when names were parsed').toBeNull();
  });

  it('parses a pair ("A and B queue X")', () => {
    const r = explainPick({ because: 'Rich and Alex queue HAIM', kind: 'unheard' });
    expect(r.people).toEqual([{ name: 'Rich' }, { name: 'Alex' }]);
  });

  it('parses a single person ("A queues X")', () => {
    const r = explainPick({ because: 'Rich queues HAIM', kind: 'unheard' });
    expect(r.people).toEqual([{ name: 'Rich' }]);
  });

  it('still shows the viewer as "You"', () => {
    const r = explainPick({ because: OLD, viewer: 'Alex', kind: 'unheard' });
    const names = r.people.map((p) => p.name);
    expect(names, 'Expected the viewer Alex to appear as "You"').toContain('You');
    expect(names, "Expected the viewer's own name to be replaced").not.toContain('Alex');
    expect(names).toHaveLength(3);
  });

  it('has no fit when the old server sent no score', () => {
    expect(explainPick({ because: OLD, kind: 'unheard' }).fit).toBeNull();
  });

  it("falls back to the reason when the old server's because names nobody", () => {
    const r = explainPick({ because: 'Popular with the office', kind: 'unheard' });
    expect(r.people).toEqual([]);
    expect(r.reason).toBe('Popular with the office');
  });
});
