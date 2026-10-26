import type React from 'react';
import { usePlaybackPosition } from '../../hooks/playbackPosition';
import { wavePath } from '../../lib/wavePath';
import styles from './WavyProgress.module.css';

// Geometry in em, so the wave scales with the card's type. The stroke matches the flat bar it replaces.
const WAVELENGTH = 2;
const AMPLITUDE = 0.16;
const STROKE = 0.32;
const HEIGHT = 2 * AMPLITUDE + STROKE;
// Enough waves for the widest card (about 100em of bar), plus one to slide into while the wave travels.
const CYCLES = 52;
const WIDTH = CYCLES * WAVELENGTH;
// Built once: the wave never changes shape, only where it is clipped and how far it has slid.
const PATH = wavePath({ wavelength: WAVELENGTH, amplitude: AMPLITUDE, cycles: CYCLES, midY: HEIGHT / 2 });

const GEOMETRY = {
  '--wave-len': `${WAVELENGTH}em`,
  '--wave-h': `${HEIGHT}em`,
  '--wave-stroke': `${STROKE}em`,
} as React.CSSProperties;

interface Props {
  /** 0 to 100. */
  progressPct: number;
  /** Audio isn't actually playing: the wave eases to a straight line and stops travelling. */
  paused?: boolean;
  label?: string;
  className?: string;
}

/**
 * Material-style wavy progress: the played part is a sine wave sliding slowly to the right, the rest the flat track,
 * with a small gap between. No React work per frame: the wave slides on a CSS animation (compositor), the played
 * length is a clip that follows `progressPct`, and the flattening is a CSS transition. Flat and still under
 * reduced motion.
 */
export function WavyProgress({ progressPct, paused = false, label = 'Track progress', className }: Props) {
  const pct = Math.min(100, Math.max(0, progressPct || 0));
  return (
    <div
      className={[styles.wavy, paused ? styles.paused : '', className].filter(Boolean).join(' ')}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ ...GEOMETRY, '--wavy-p': pct / 100 } as React.CSSProperties}
    >
      <div className={styles.rest} />
      <div className={styles.played}>
        <div className={styles.travel}>
          <svg
            className={styles.wave}
            width={`${WIDTH}em`}
            height={`${HEIGHT}em`}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            aria-hidden="true"
            focusable="false"
          >
            <path className={styles.path} d={PATH} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** WavyProgress fed by the playback position store, so the once-a-second tick re-renders this alone. */
export function LiveWavyProgress(props: Omit<Props, 'progressPct'>) {
  const pct = usePlaybackPosition((p) => p.progressPct);
  return <WavyProgress {...props} progressPct={pct} />;
}
