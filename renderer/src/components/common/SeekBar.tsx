import type React from 'react';
import { getActiveProvider } from '../../providers';

const STEP_MS = 5000;

interface Props {
  progressPct: number;
  durationMs: number;
  elapsedLabel: string;
  durationLabel: string;
  /** The hit area; the caller's module supplies its height, cursor and hover. */
  className: string;
  trackClassName: string;
  fillClassName: string;
  title?: string;
}

/** Click-and-keyboard seek bar shared by the three players; each passes its own look. */
export function SeekBar({
  progressPct,
  durationMs,
  elapsedLabel,
  durationLabel,
  className,
  trackClassName,
  fillClassName,
  title,
}: Props) {
  const pct = Math.min(100, Math.max(0, progressPct || 0));

  const seekTo = (ms: number) => {
    if (!durationMs) return;
    const p = getActiveProvider();
    p.seek(Math.floor(Math.min(durationMs, Math.max(0, ms)))).then(() => p.refreshPlayback());
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * durationMs);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const now = (pct / 100) * durationMs;
    const target =
      e.key === 'ArrowLeft'
        ? now - STEP_MS
        : e.key === 'ArrowRight'
          ? now + STEP_MS
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? durationMs
              : null;
    if (target === null) return;
    e.preventDefault();
    seekTo(target);
  };

  return (
    <div
      className={className}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Track progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={elapsedLabel && durationLabel ? `${elapsedLabel} of ${durationLabel}` : undefined}
      title={title}
    >
      <div className={trackClassName}>
        <div className={fillClassName} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
