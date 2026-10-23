import styles from '../../styles/Queuedle.module.css';

interface Props {
  scores: number[];
  maxScore: number;
  /** Your score in this round; its bar is lit. -1 for none. */
  playerScore: number;
  title: string;
}

/** One round: your score, and a bar per possible score showing how many people got it. */
export function ScoreDistribution({ scores, maxScore, playerScore, title }: Props) {
  const counts = Array.from({ length: maxScore + 1 }, () => 0);
  scores.forEach((s) => {
    if (s >= 0 && s <= maxScore) counts[s]++;
  });
  const peak = Math.max(1, ...counts);
  const summary = counts
    .map((c, s) => (c ? `${c} scored ${s}` : ''))
    .filter(Boolean)
    .join(', ');

  return (
    <figure className={styles.dist}>
      <figcaption className={styles.distHead}>
        <span className={styles.distTitle}>{title}</span>
        {playerScore >= 0 && (
          <span className={styles.distValue}>
            {playerScore}/{maxScore}
          </span>
        )}
      </figcaption>
      <div
        className={styles.distBars}
        role="img"
        aria-label={`${title} across the room: ${summary || 'no scores yet'}`}
      >
        {counts.map((c, score) => (
          <div key={score} className={styles.distCol}>
            <div className={styles.distTrack}>
              <div
                className={`${styles.distFill}${score === playerScore ? ' ' + styles.distFillMine : ''}`}
                style={{ height: c ? `${Math.max(8, (c / peak) * 100)}%` : 0 }}
              />
            </div>
            <span className={`${styles.distLabel}${score === playerScore ? ' ' + styles.distLabelMine : ''}`}>
              {score}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
