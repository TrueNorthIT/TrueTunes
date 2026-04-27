import { useImage } from '../../hooks/useImage';
import styles from '../../styles/Queuedle.module.css';

interface ReviewRowProps {
  question: GameQuestion;
  guess: 'left' | 'right';
  qStat?: GameQuestionStat;
}

function ReviewRow({ question: q, guess, qStat }: ReviewRowProps) {
  const correct = guess === q.winner;
  const leftArt = useImage(q.left.imageUrl);
  const rightArt = useImage(q.right.imageUrl);

  const color = correct ? '74, 222, 128' : '248, 113, 113';
  const bg =
    guess === 'left'
      ? `linear-gradient(90deg, rgba(${color}, 0.18) 0%, rgba(${color}, 0.06) 75%, transparent 85%)`
      : `linear-gradient(270deg, rgba(${color}, 0.18) 0%, rgba(${color}, 0.06) 75%, transparent 85%)`;

  const correctPct = q.winner === 'left' ? qStat?.leftPct : qStat?.rightPct;

  return (
    <div className={styles.reviewItem}>
      <div className={styles.reviewRow} style={{ background: bg }}>
        {leftArt ? <img src={leftArt} className={styles.reviewArt} alt={q.left.name} /> : <div className={styles.reviewArt} />}
        <span className={`${styles.reviewSide} ${q.winner === 'left' ? styles.reviewSidePicked : ''}`}>
          <span className={styles.reviewName}>{q.left.name}</span>
          <span className={styles.reviewCount}>{q.left.count.toLocaleString()}</span>
        </span>
        <span className={styles.reviewVs}>
          <span className={styles.reviewCategory}>{q.left.category}</span>
          vs
          <span className={styles.reviewCategory}>{q.right.category}</span>
        </span>
        <span
          className={`${styles.reviewSide} ${styles.reviewSideRight} ${q.winner === 'right' ? styles.reviewSidePicked : ''}`}
        >
          <span className={styles.reviewName}>{q.right.name}</span>
          <span className={styles.reviewCount}>{q.right.count.toLocaleString()}</span>
        </span>
        {rightArt ? <img src={rightArt} className={styles.reviewArt} alt={q.right.name} /> : <div className={styles.reviewArt} />}
      </div>
      {qStat && (
        <div className={styles.reviewMeta}>
          {correctPct !== undefined && (
            <span className={styles.reviewMetaCorrect}>{correctPct}% got this right</span>
          )}
          {qStat.bonusOptions.length > 0 && (
            <span className={styles.reviewMetaBonus}>
              {qStat.bonusOptions.map((o) => `${o.name} ${o.pct}%`).join(' · ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  mainScore: number;
  bonusScore: number;
  maxMain: number;
  maxBonus: number;
  alreadySubmitted?: boolean;
  hideScoreSummary?: boolean;
  questions?: GameQuestion[];
  mainGuesses?: Array<'left' | 'right'>;
  stats?: GameStatsResult;
  onPlayAgain?: () => void;
}

export function QueuedleSummary({
  mainScore,
  bonusScore,
  maxMain,
  maxBonus,
  alreadySubmitted,
  hideScoreSummary,
  questions,
  mainGuesses,
  stats,
  onPlayAgain,
}: Props) {
  const total = mainScore + bonusScore;
  const maxTotal = maxMain + maxBonus;
  return (
    <div className={styles.summary}>
      {!hideScoreSummary && (
        <>
          <div className={styles.summaryScore}>{total}</div>
          <div className={styles.summaryTotal}>out of {maxTotal}</div>
          <div className={styles.summaryRows}>
            <div className={styles.summaryCell}>
              <div className={styles.summaryCellValue}>{mainScore}/{maxMain}</div>
              <div className={styles.summaryCellLabel}>Higher or lower</div>
            </div>
            <div className={styles.summaryCell}>
              <div className={styles.summaryCellValue}>{bonusScore}/{maxBonus}</div>
              <div className={styles.summaryCellLabel}>Top queuer</div>
            </div>
          </div>
        </>
      )}

      {questions && mainGuesses && questions.length > 0 && mainGuesses.length >= questions.length && (
        <div className={styles.reviewList}>
          <h2 className={styles.leaderboardTitle}>Question Breakdown</h2>
          {questions.map((q, i) => (
            <ReviewRow key={i} question={q} guess={mainGuesses[i]} qStat={stats?.questions?.[i]} />
          ))}
        </div>
      )}

      {alreadySubmitted && (
        <div className={styles.alreadyPlayed}>
          <p className={styles.bonusIntroSub}>
            You&apos;ve already played today — come back tomorrow for a new Queuedle.
          </p>
          {import.meta.env.DEV && onPlayAgain && (
            <button className={styles.playAgainBtn} onClick={onPlayAgain}>
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
