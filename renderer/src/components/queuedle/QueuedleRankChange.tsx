import { useEffect, useRef, useState } from 'react';
import { getGameRankIcon } from '../../lib/gameRankAssets';
import type { GameRankTierKey } from '../../hooks/useDailyGame';
import styles from '../../styles/Queuedle.module.css';

export interface RankSnapshot {
  rating: number;
  averagePercent: number;
  gamesPlayed: number;
  tierKey: GameRankTierKey;
  tierName: string;
  isProvisional: boolean;
}

interface Props {
  before: RankSnapshot | null;
  after: RankSnapshot;
  onContinue: () => void;
}

const ANIM_MS = 1200;

function useTween(from: number, to: number, durationMs: number) {
  const [value, setValue] = useState(from);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, durationMs]);

  return value;
}

export function QueuedleRankChange({ before, after, onContinue }: Props) {
  const fromRating = before?.rating ?? after.rating;
  const display = useTween(fromRating, after.rating, ANIM_MS);
  const delta = before ? after.rating - before.rating : 0;
  const tierChanged = !!before && before.tierKey !== after.tierKey;
  const tierIcon = getGameRankIcon(after.tierKey);
  const prevTierIcon = before ? getGameRankIcon(before.tierKey) : null;

  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaClass =
    delta > 0
      ? styles.rankDeltaUp
      : delta < 0
        ? styles.rankDeltaDown
        : styles.rankDeltaFlat;

  return (
    <div className={styles.rankChangeWrap}>
      <h2 className={styles.rankChangeTitle}>
        {before ? 'Rank update' : 'Welcome to the ranks'}
      </h2>

      <div className={styles.rankChangeBadgeRow}>
        {tierChanged && prevTierIcon && (
          <div className={styles.rankBadgePrev}>
            <img src={prevTierIcon} alt="" className={styles.rankBadgeImg} />
          </div>
        )}
        {tierChanged && prevTierIcon && (
          <div className={styles.rankBadgeArrow}>→</div>
        )}
        <div
          className={`${styles.rankBadgeCurrent}${tierChanged ? ' ' + styles.rankBadgePulse : ''}`}
        >
          {tierIcon ? (
            <img src={tierIcon} alt="" className={styles.rankBadgeImg} />
          ) : (
            <div className={styles.rankBadgePlaceholder} />
          )}
        </div>
      </div>

      <div className={styles.rankTierName}>{after.tierName}</div>

      <div className={styles.rankRatingRow}>
        <span className={styles.rankRatingNumber}>{display}</span>
        {before && !after.isProvisional && !before.isProvisional && delta !== 0 && (
          <span className={`${styles.rankDeltaChip} ${deltaClass}`}>{deltaLabel}</span>
        )}
      </div>

      {after.isProvisional && (
        <div className={styles.rankProvisional}>
          Provisional · play {Math.max(0, 3 - after.gamesPlayed)} more
          {Math.max(0, 3 - after.gamesPlayed) === 1 ? ' game' : ' games'} to lock in a tier
        </div>
      )}

      <div className={styles.submitRow}>
        <button className={styles.nextBtn} onClick={onContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}
