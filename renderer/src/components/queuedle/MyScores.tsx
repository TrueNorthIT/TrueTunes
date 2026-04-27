import styles from '../../styles/Queuedle.module.css';

interface Props {
  mainScore: number;
  bonusScore: number;
  maxMain: number;
  maxBonus: number;
}

export function MyScores({ mainScore, bonusScore, maxMain, maxBonus }: Props) {
  const total = mainScore + bonusScore;
  const maxTotal = maxMain + maxBonus;
  return (
    <div className={styles.myScores}>
      <h2 className={styles.leaderboardTitle}>My Scores</h2>
      <div className={styles.myScoresTotal}>
        <span className={styles.myScoresTotalValue}>{total}</span>
        <span className={styles.myScoresTotalOf}>/ {maxTotal}</span>
      </div>
      <div className={styles.myScoresCells}>
        <div className={styles.summaryCell}>
          <div className={styles.summaryCellValue}>{mainScore}/{maxMain}</div>
          <div className={styles.summaryCellLabel}>Higher or lower</div>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.summaryCellValue}>{bonusScore}/{maxBonus}</div>
          <div className={styles.summaryCellLabel}>Top queuer</div>
        </div>
      </div>
    </div>
  );
}
