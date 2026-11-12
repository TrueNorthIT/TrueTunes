import { SkipBack, Play, SkipForward } from 'lucide-react';
import { getActiveProvider } from '../../providers';

interface Props {
  disabled: boolean;
  isPlaying: boolean;
  btnClassName: string;
  playClassName: string;
  /** Prev/next icon size; the play icon takes `playSize`. */
  size: number;
  playSize: number;
  /** Solid glyphs (Mini and Skinny); PlayerBar keeps outlines. */
  filled?: boolean;
  /** Play/pause alone, without previous and next (the phone's mini player). */
  playOnly?: boolean;
  /** The pause glyph, 14px unless a larger player says otherwise. */
  pauseSize?: number;
}

/** Previous / play-pause / next, as a fragment so each player's flex row is unchanged. */
export function TransportButtons({
  disabled,
  isPlaying,
  btnClassName,
  playClassName,
  size,
  playSize,
  filled,
  playOnly,
  pauseSize = 14,
}: Props) {
  const fill = filled ? 'currentColor' : undefined;
  const refresh = () => getActiveProvider().refreshPlayback();
  const playLabel = isPlaying ? 'Pause' : 'Play';
  return (
    <>
      {!playOnly && (
        <button
          className={btnClassName}
          disabled={disabled}
          onClick={() => void getActiveProvider().skipPrev().then(refresh)}
          title="Previous"
          aria-label="Previous"
        >
          <SkipBack size={size} fill={fill} />
        </button>
      )}
      <button
        className={`${btnClassName} ${playClassName}`}
        disabled={disabled}
        onClick={() => void (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)}
        title={playLabel}
        aria-label={playLabel}
      >
        {isPlaying ? (
          <svg width={pauseSize} height={pauseSize} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <Play size={playSize} fill={fill} />
        )}
      </button>
      {!playOnly && (
        <button
          className={btnClassName}
          disabled={disabled}
          onClick={() => void getActiveProvider().skipNext().then(refresh)}
          title="Next"
          aria-label="Next"
        >
          <SkipForward size={size} fill={fill} />
        </button>
      )}
    </>
  );
}
