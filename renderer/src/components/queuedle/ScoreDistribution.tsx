import styles from '../../styles/Queuedle.module.css';

interface Props {
  scores: number[];
  maxScore: number;
  playerScore: number;
  title: string;
}

export function ScoreDistribution({ scores, maxScore, playerScore, title }: Props) {
  const total = scores.length;
  const buckets = Array.from({ length: maxScore + 1 }, (_, i) => {
    const count = scores.filter((s) => s === i).length;
    return { score: i, pct: total > 0 ? (count / total) * 100 : 0 };
  });

  return (
    <div>
      <h3 className={styles.distributionTitle}>{title}</h3>
    <div className={styles.distribution}>
      {buckets.map((b) => (
        <div key={b.score} className={styles.distributionCol}>
          <div className={styles.distributionTrack}>
            <div
              className={`${styles.distributionFill} ${b.score === playerScore ? styles.distributionHighlight : ''}`}
              style={{ height: `${b.pct}%` }}
            />
          </div>
          <span className={`${styles.distributionLabel} ${b.score === playerScore ? styles.distributionLabelHighlight : ''}`}>
            {b.score}
          </span>
        </div>
      ))}
    </div>
    </div>
  );
}
