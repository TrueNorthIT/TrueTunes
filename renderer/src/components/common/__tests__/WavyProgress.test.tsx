import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setPlaybackPosition, ZERO_POSITION } from '../../../hooks/playbackPosition';
import { LiveWavyProgress, WavyProgress } from '../WavyProgress';

const css = readFileSync(resolve(__dirname, '../WavyProgress.module.css'), 'utf-8');
const rule = (name: string) => (css.match(new RegExp(`(^|\\n)\\.${name}\\s*\\{[^}]*\\}`)) ?? [''])[0];

afterEach(() => setPlaybackPosition(ZERO_POSITION));

describe('WavyProgress', () => {
  it('is a named progressbar with a rounded value, clamped to 0..100', () => {
    const { rerender } = render(<WavyProgress progressPct={28.4} />);
    const bar = screen.getByRole('progressbar', { name: 'Track progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '28');
    rerender(<WavyProgress progressPct={140} />);
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.style.getPropertyValue('--wavy-p')).toBe('1');
    rerender(<WavyProgress progressPct={-5} />);
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('marks itself paused, and keeps the wave out of the accessibility tree', () => {
    const { container } = render(<WavyProgress progressPct={50} paused />);
    expect(screen.getByRole('progressbar').className).toMatch(/paused/);
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
  });

  it('ramps the wave up across the first wavelength: ten strips of rising height, then the full wave', () => {
    const { container } = render(<WavyProgress progressPct={50} />);
    const envs = [...container.querySelectorAll<HTMLElement>('[style*="--strip-x"]')].map((el) =>
      el.style.getPropertyValue('--env')
    );
    expect(envs).toHaveLength(11);
    const ramp = envs.slice(0, 10).map(Number);
    expect(ramp[0]).toBeLessThan(0.01);
    ramp.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(ramp[i]));
    expect(envs[10]).toBe(''); // the full-height rest uses the default, 1
  });

  it('LiveWavyProgress follows the playback position store', () => {
    render(<LiveWavyProgress />);
    act(() => setPlaybackPosition({ ...ZERO_POSITION, durationMs: 200000, positionMs: 50000, progressPct: 25 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('moves with clips and transforms only, never width or layout properties', () => {
    for (const name of ['rest', 'played', 'travel', 'path']) {
      expect(rule(name), `Expected a .${name} rule`).not.toBe('');
      expect(rule(name), `.${name} must not transition layout`).not.toMatch(/transition:[^;]*(width|left|right)/);
    }
    expect(rule('played')).toMatch(/clip-path:\s*inset/);
    expect(css).toMatch(/@keyframes wavyTravel\s*\{\s*to\s*\{\s*transform:\s*translateX/);
  });

  it('stops all motion under prefers-reduced-motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.travel\s*\{\s*animation:\s*none/);
    expect(reduced).toMatch(/transition:\s*none/);
  });
});
