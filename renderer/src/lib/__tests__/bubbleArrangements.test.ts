import { describe, it, expect } from 'vitest';
import { ARRANGEMENTS, arrangeBubbles, spanningLinks, type Arranged } from '../bubbleArrangements';
import { BUBBLE_RADII, MAX_BUBBLES } from '../pickBubbles';

const fans = (...counts: number[]) => counts.map((count, i) => ({ user: `P${i + 1}`, count }));
const scenarios = { two: fans(30, 12), four: fans(24, 15, 8, 4), eight: fans(31, 18, 9, 6, 3, 2, 1, 1) };

function overlaps(l: Arranged, gap: number): string[] {
  const bad: string[] = [];
  l.bubbles.forEach((a, i) =>
    l.bubbles.slice(i + 1).forEach((b, j) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap - 2e-3) bad.push(`${i}-${i + 1 + j}`);
    })
  );
  return bad;
}

describe('arrangeBubbles', () => {
  it('is empty with nobody to show', () => {
    for (const a of ARRANGEMENTS) expect(arrangeBubbles([], 'large', a).bubbles).toEqual([]);
  });

  for (const a of ARRANGEMENTS)
    for (const [name, people] of Object.entries(scenarios))
      it(`${a}, ${name} fans: every bubble inside its box, the same every time`, () => {
        const l = arrangeBubbles(people, 'large', a);
        expect(l.bubbles).toHaveLength(Math.min(people.length, MAX_BUBBLES));
        for (const b of l.bubbles) {
          expect(b.x - b.r).toBeGreaterThanOrEqual(-1e-3);
          expect(b.y - b.r).toBeGreaterThanOrEqual(-1e-3);
          expect(b.x + b.r).toBeLessThanOrEqual(l.width + 1e-3);
          expect(b.y + b.r).toBeLessThanOrEqual(l.height + 1e-3);
        }
        expect(arrangeBubbles(people, 'large', a)).toEqual(l);
      });

  // Everything but the soft stack, which overlaps on purpose.
  for (const a of ARRANGEMENTS.filter((x) => x !== 'stack'))
    it(`${a}: no two faces touch`, () => {
      for (const people of Object.values(scenarios))
        expect(overlaps(arrangeBubbles(people, 'large', a), BUBBLE_RADII.large.gap)).toEqual([]);
    });

  it('orbit: each satellite rests at its phase point on its ellipse; the biggest sits still at the centre', () => {
    const l = arrangeBubbles(scenarios.eight, 'large', 'orbit');
    expect(l.bubbles[0].orbit).toBeUndefined();
    expect(l.bubbles[0].x).toBeCloseTo(l.origin.x, 3);
    for (const b of l.bubbles.slice(1)) {
      const o = b.orbit;
      if (!o) throw new Error('satellite without an orbit');
      expect(b.x).toBeCloseTo(o.cx + o.a * Math.cos(o.phase), 2);
      expect(b.y).toBeCloseTo(o.cy + o.b * Math.sin(o.phase), 2);
    }
  });

  it('stack: the biggest is in front and the pile steps back from it', () => {
    const l = arrangeBubbles(scenarios.four, 'large', 'stack');
    const z = l.bubbles.map((b) => b.z ?? 0);
    expect(z).toEqual([...z].sort((a, b) => b - a));
  });

  it('constellation: joins every face with one fewer line than faces', () => {
    const l = arrangeBubbles(scenarios.eight, 'large', 'constellation');
    expect(l.links).toHaveLength(l.bubbles.length - 1);
  });
});

describe('spanningLinks', () => {
  it('joins the nearest points first', () => {
    expect(
      spanningLinks([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 1, y: 0 },
      ])
    ).toEqual([
      [0, 2],
      [2, 1],
    ]);
  });
});
