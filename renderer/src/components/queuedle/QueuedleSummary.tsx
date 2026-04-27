import styles from '../styles/Queuedle.module.css';

interface Props {
  mainScore: number;
  bonusScore: number;
  maxMain: number;
  maxBonus: number;
  alreadySubmitted?: boolean;
}

export function QueuedleSummary({ mainScore, bonusScore, maxMain, maxBonus, alreadySubmitted }: Props) {
  const total = mainScore + bonusScore;
  const maxTotal = maxMain + maxBonus;
  return (
    <div className={styles.summary}>
      <div className={styles.summaryScore}>{total}</div>
      <div className={styles.summaryTotal}>out of {maxTotal}</div>
      <div className={styles.summaryRows}>
        <div className={styles.summaryCell}>
          <div className={styles.summaryCellValue}>
            {mainScore}/{maxMain}
          </div>
          <div className={styles.summaryCellLabel}>Higher or lower</div>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.summaryCellValue}>
            {bonusScore}/{maxBonus}
          </div>
          <div className={styles.summaryCellLabel}>Top queuer</div>
        </div>
      </div>
      {alreadySubmitted && (
        <p className={styles.bonusIntroSub} style={{ marginTop: 16 }}>
          You&apos;ve already played today — come back tomorrow for a new Queuedle.
        </p>
      )}
    </div>
  );
}
