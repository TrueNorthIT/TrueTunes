import { describe, expect, it } from 'vitest';
import { envelopeStrips, startEnvelope, wavePath } from '../wavePath';

type Pt = [number, number];

/** Parse "M x y C x y x y x y ..." into its start point and cubic segments. */
function parse(d: string): { start: Pt; segs: [Pt, Pt, Pt][] } {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const start: Pt = [nums[0], nums[1]];
  const segs: [Pt, Pt, Pt][] = [];
  for (let i = 2; i < nums.length; i += 6) {
    segs.push([
      [nums[i], nums[i + 1]],
      [nums[i + 2], nums[i + 3]],
      [nums[i + 4], nums[i + 5]],
    ]);
  }
  return { start, segs };
}

/** Sample every segment densely: points on the drawn curve. */
function sample(d: string): Pt[] {
  const { start, segs } = parse(d);
  const pts: Pt[] = [];
  let p0 = start;
  for (const [p1, p2, p3] of segs) {
    for (let k = 0; k <= 50; k++) {
      const t = k / 50;
      const a = (1 - t) ** 3,
        b = 3 * (1 - t) ** 2 * t,
        c = 3 * (1 - t) * t * t,
        e = t ** 3;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]]);
    }
    p0 = p3;
  }
  return pts;
}

const opts = { wavelength: 1.4, amplitude: 0.15, cycles: 4, midY: 0.31 };

describe('wavePath', () => {
  it('starts on the midline at x = 0 and ends after whole cycles', () => {
    const { start, segs } = parse(wavePath(opts));
    expect(start).toEqual([0, 0.31]);
    expect(segs).toHaveLength(8);
    expect(segs[segs.length - 1][2][0]).toBeCloseTo(5.6, 6);
    expect(segs[segs.length - 1][2][1]).toBeCloseTo(0.31, 6);
  });

  it('follows a true sine to within 0.5% of the amplitude (rising first, as y grows downward)', () => {
    for (const [x, y] of sample(wavePath(opts))) {
      const expected = opts.midY - opts.amplitude * Math.sin((2 * Math.PI * x) / opts.wavelength);
      expect(Math.abs(y - expected)).toBeLessThan(0.005 * opts.amplitude);
    }
  });

  it('peaks at exactly the amplitude', () => {
    const ys = sample(wavePath(opts)).map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(opts.midY - opts.amplitude, 3);
    expect(Math.max(...ys)).toBeCloseTo(opts.midY + opts.amplitude, 3);
  });

  it('repeats every wavelength, so translating by one wavelength loops seamlessly', () => {
    const { segs } = parse(wavePath(opts));
    // Full wave = two segments; segment i and i + 2 are the same shape shifted by one wavelength.
    for (let i = 0; i + 2 < segs.length; i++) {
      segs[i].forEach(([x, y], j) => {
        expect(segs[i + 2][j][0] - x).toBeCloseTo(opts.wavelength, 6);
        expect(segs[i + 2][j][1]).toBeCloseTo(y, 6);
      });
    }
  });

  it('draws a straight line at amplitude 0', () => {
    for (const [, y] of sample(wavePath({ ...opts, amplitude: 0 }))) expect(y).toBeCloseTo(opts.midY, 6);
  });

  it('is deterministic and draws nothing past the start for no cycles', () => {
    expect(wavePath(opts)).toBe(wavePath(opts));
    expect(wavePath({ ...opts, cycles: 0 })).toBe('M0 0.31');
  });
});

describe('startEnvelope', () => {
  it('is flat at the left edge and full height from one wavelength on', () => {
    expect(startEnvelope(0)).toBe(0);
    expect(startEnvelope(-1)).toBe(0);
    expect(startEnvelope(1)).toBe(1);
    expect(startEnvelope(3)).toBe(1);
    expect(startEnvelope(0.5)).toBeCloseTo(0.5, 6);
  });

  it('rises monotonically and eases at both ends', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = startEnvelope(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Zero slope at both ends: no kink where the ramp meets the flat start or the full wave.
    expect(startEnvelope(0.01)).toBeLessThan(0.001);
    expect(1 - startEnvelope(0.99)).toBeLessThan(0.001);
  });
});

describe('envelopeStrips', () => {
  it('tiles the first wavelength with equal strips, without gaps or overlaps', () => {
    const strips = envelopeStrips(10);
    expect(strips).toHaveLength(10);
    expect(strips[0].from).toBe(0);
    expect(strips[strips.length - 1].to).toBe(1);
    strips.forEach((s, i) => {
      expect(s.to - s.from).toBeCloseTo(0.1, 9);
      if (i > 0) expect(s.from).toBe(strips[i - 1].to);
    });
  });

  it('samples the envelope at each strip centre: near flat first, then rising in small steps', () => {
    const strips = envelopeStrips(10);
    strips.forEach((s) => expect(s.scale).toBeCloseTo(startEnvelope((s.from + s.to) / 2), 9));
    expect(strips[0].scale).toBeLessThan(0.01);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i].scale).toBeGreaterThan(strips[i - 1].scale);
      expect(strips[i].scale - strips[i - 1].scale).toBeLessThan(0.2);
    }
  });

  it('copes with odd counts', () => {
    expect(envelopeStrips(0)).toHaveLength(1);
    expect(envelopeStrips(2.7)).toHaveLength(2);
  });
});
