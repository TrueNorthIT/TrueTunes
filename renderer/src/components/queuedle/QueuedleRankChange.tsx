import { useEffect, useRef, useState } from 'react';
import { getGameRankIcon } from '../../lib/gameRankAssets';
import type { GameRankTierKey } from '../../hooks/useDailyGame';
import { ArrowRight } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { SectionCard } from '../common/SectionCard';
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
      const t = durationMs > 0 ? Math.min(1, (now - startRef.current) / durationMs) : 1;
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
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const display = useTween(fromRating, after.rating, reduceMotion ? 0 : ANIM_MS);
  const delta = before ? after.rating - before.rating : 0;
  const tierChanged = !!before && before.tierKey !== after.tierKey;
  const tierIcon = getGameRankIcon(after.tierKey);
  const prevTierIcon = before ? getGameRankIcon(before.tierKey) : null;
  const showDelta = !!before && !after.isProvisional && !before.isProvisional && delta !== 0;
  const gamesLeft = Math.max(0, 3 - after.gamesPlayed);

  return (
    <SectionCard featured className={styles.rankCard}>
      <h2 className={styles.rankTitle}>{before ? 'Rank update' : 'Welcome to the ranks'}</h2>

      <div className={styles.rankBadges}>
        {tierChanged && prevTierIcon && (
          <>
            <span className={`${styles.rankBadge} ${styles.rankBadgePrev}`}>
              <img src={prevTierIcon} alt="" />
            </span>
            <ArrowRight className={styles.rankArrow} size={22} aria-hidden="true" />
          </>
        )}
        <span className={`${styles.rankBadge}${tierChanged ? ' ' + styles.rankBadgeIn : ''}`}>
          {tierIcon ? <img src={tierIcon} alt="" /> : <span className={styles.rankBadgeEmpty} />}
        </span>
      </div>

      <p className={styles.rankTier}>
        {tierChanged && before ? `${before.tierName} to ${after.tierName}` : after.tierName}
      </p>

      <p className={styles.rankRating}>
        <span className={styles.rankNumber}>{display}</span>
        {showDelta && (
          <span className={`${styles.rankDelta} ${delta > 0 ? styles.markRight : styles.markWrong}`}>
            {delta > 0 ? `+${delta}` : `${delta}`}
          </span>
        )}
      </p>
      <p className={styles.rankCaption}>Rating</p>

      {after.isProvisional && (
        <p className={styles.rankProvisional}>
          Provisional: play {gamesLeft} more {gamesLeft === 1 ? 'game' : 'games'} to lock in a tier
        </p>
      )}

      <div className={styles.submitRow}>
        <PillButton variant="primary" onClick={onContinue}>
          Continue
        </PillButton>
      </div>
    </SectionCard>
  );
}
