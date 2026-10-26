/**
 * The geometry behind WavyProgress: an SVG path for a sine wave, `y = midY - amplitude·sin(2πx / wavelength)`,
 * drawn as one cubic Bézier per half wave. Units are whatever the SVG's viewBox uses (WavyProgress uses em).
 */

// A half wave of sin over [0, π] as one cubic: control points at (K_X·π, ±K_Y) and ((1 − K_X)·π, ±K_Y).
// Fitted numerically (least maximum error); within 0.3% of the amplitude everywhere, so it reads as a true sine.
const K_X = 0.4119;
const K_Y = 1.336;

export interface WaveOptions {
  /** Length of one full wave. */
  wavelength: number;
  /** Peak height above (and depth below) the midline. 0 draws a straight line. */
  amplitude: number;
  /** Whole waves to draw. The path then repeats exactly every `wavelength`, so it can loop by translating. */
  cycles: number;
  /** The midline's y. */
  midY: number;
}

const num = (n: number) => String(Math.round(n * 10000) / 10000);

/** One continuous path starting at (0, midY) and ending at (cycles·wavelength, midY), rising first. */
export function wavePath({ wavelength, amplitude, cycles, midY }: WaveOptions): string {
  const half = wavelength / 2;
  const cx = K_X * half;
  const parts = [`M0 ${num(midY)}`];
  for (let i = 0; i < Math.max(0, Math.floor(cycles)) * 2; i++) {
    const x0 = i * half;
    // SVG y grows downward, so the first (positive) half wave goes up.
    const peak = midY + (i % 2 === 0 ? -1 : 1) * K_Y * amplitude;
    parts.push(`C${num(x0 + cx)} ${num(peak)} ${num(x0 + half - cx)} ${num(peak)} ${num(x0 + half)} ${num(midY)}`);
  }
  return parts.join(' ');
}

/**
 * The amplitude envelope at the start of the played line, `t` in wavelengths from the left edge: 0 at the edge,
 * easing (smoothstep) up to full height at one wavelength. A just-started track then shows a short flat line that
 * grows into the wave, rather than a stray hook of wave.
 */
export function startEnvelope(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

export interface EnvelopeStrip {
  /** Start and end of the strip, in wavelengths from the left edge. */
  from: number;
  to: number;
  /** The wave's height in this strip, 0 to 1. */
  scale: number;
}

/**
 * The first wavelength cut into `count` equal strips, each with the envelope at its centre. WavyProgress draws the
 * travelling wave once per strip at that fixed height, so the ramp stays put at the left edge while the wave slides
 * under it, all on the compositor. Ten strips step the height by under a fifth of the amplitude (a fraction of a
 * pixel), which reads as a smooth ramp.
 */
export function envelopeStrips(count: number): EnvelopeStrip[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => ({
    from: i / n,
    to: (i + 1) / n,
    scale: startEnvelope((i + 0.5) / n),
  }));
}
