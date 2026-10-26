import type { ReactNode } from 'react';
import { SectionCard } from '../common/SectionCard';
import { ScoreDistribution } from './ScoreDistribution';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  mainScore: number;
  bonusScore: number;
  maxMain: number;
  maxBonus: number;
  /** "Joint 1st of 5 today". */
  standing?: string;
  /** Everyone's round scores (you included), for the two distributions. */
  mainScores?: number[];
  bonusScores?: number[];
  /** Under the standing: the "come back tomorrow" line. */
  note?: ReactNode;
}

/** The results hero: your total and place, beside how the room scored in each round. */
export function MyScores({ mainScore, bonusScore, maxMain, maxBonus, standing, mainScores, bonusScores, note }: Props) {
  return (
    <SectionCard className={styles.scoreHero}>
      <div className={styles.scoreMain}>
        <h2 className={styles.scoreLabel}>Your score</h2>
        <p className={styles.scoreLine}>
          <span className={styles.scoreValue}>{mainScore + bonusScore}</span>
          <span className={styles.scoreOf}>out of {maxMain + maxBonus}</span>
        </p>
        {standing && <p className={styles.standing}>{standing}</p>}
        {note}
      </div>
      <div className={styles.rounds}>
        <ScoreDistribution
          title="Higher or Lower"
          scores={mainScores ?? [mainScore]}
          maxScore={maxMain}
          playerScore={mainScore}
        />
        <ScoreDistribution
          title="Top Queuer"
          scores={bonusScores ?? [bonusScore]}
          maxScore={maxBonus}
          playerScore={bonusScore}
        />
      </div>
    </SectionCard>
  );
}
