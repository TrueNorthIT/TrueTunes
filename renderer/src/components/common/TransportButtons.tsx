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
}

/** Previous / play-pause / next, as a fragment so each player's flex row is unchanged. */
export function TransportButtons({ disabled, isPlaying, btnClassName, playClassName, size, playSize, filled }: Props) {
  const fill = filled ? 'currentColor' : undefined;
  const refresh = () => getActiveProvider().refreshPlayback();
  const playLabel = isPlaying ? 'Pause' : 'Play';
  return (
    <>
      <button
        className={btnClassName}
        disabled={disabled}
        onClick={() => void getActiveProvider().skipPrev().then(refresh)}
        title="Previous"
        aria-label="Previous"
      >
        <SkipBack size={size} fill={fill} />
      </button>
      <button
        className={`${btnClassName} ${playClassName}`}
        disabled={disabled}
        onClick={() => void (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)}
        title={playLabel}
        aria-label={playLabel}
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <Play size={playSize} fill={fill} />
        )}
      </button>
      <button
        className={btnClassName}
        disabled={disabled}
        onClick={() => void getActiveProvider().skipNext().then(refresh)}
        title="Next"
        aria-label="Next"
      >
        <SkipForward size={size} fill={fill} />
      </button>
    </>
  );
}
