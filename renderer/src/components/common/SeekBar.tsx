import type React from 'react';
import { getActiveProvider } from '../../providers';
import { usePlaybackPosition } from '../../hooks/playbackPosition';
import { fmtTime } from '../../lib/itemHelpers';

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

type LiveProps = Omit<Props, 'progressPct' | 'elapsedLabel' | 'durationLabel' | 'title'> & {
  /** Tooltip reads "1:29 / 3:42". */
  timeTitle?: boolean;
};

const labels = (timeLabel: string) => (timeLabel ? timeLabel.split(' / ') : ['', '']);

/** The SeekBar fed by the playback position store, so the once-a-second tick re-renders this alone. */
export function LiveSeekBar({ timeTitle, ...props }: LiveProps) {
  const { progressPct, timeLabel } = usePlaybackPosition();
  const [elapsedLabel = '', durationLabel = ''] = labels(timeLabel);
  const title = timeTitle && elapsedLabel && durationLabel ? `${elapsedLabel} / ${durationLabel}` : undefined;
  return (
    <SeekBar
      {...props}
      title={title}
      progressPct={progressPct}
      elapsedLabel={elapsedLabel}
      durationLabel={durationLabel}
    />
  );
}

/** Elapsed or total time as text, live. */
export function PlaybackTime({ part, className }: { part: 'elapsed' | 'duration'; className?: string }) {
  const text = usePlaybackPosition((p) => labels(p.timeLabel)[part === 'elapsed' ? 0 : 1] ?? '');
  return <span className={className}>{text}</span>;
}

/** Time left as "−2:15", or nothing when the duration is unknown. */
export function PlaybackRemaining({ className }: { className?: string }) {
  const text = usePlaybackPosition((p) =>
    p.durationMs > 0 ? `−${fmtTime(Math.max(0, p.durationMs * (1 - p.progressPct / 100)))}` : ''
  );
  return text ? (
    <span className={className} aria-hidden="true">
      {text}
    </span>
  ) : null;
}
