import { useImage } from '../../hooks/useImage';
import { SectionCard } from '../common/SectionCard';
import styles from '../../styles/Queuedle.module.css';

function ReviewSide({ item, won, end }: { item: GameItem; won: boolean; end?: boolean }) {
  const art = useImage(item.imageUrl);
  const artClass = `${styles.reviewArt}${item.category === 'artist' ? ' ' + styles.round : ''}`;
  return (
    <span
      className={`${styles.reviewSide}${end ? ' ' + styles.reviewSideEnd : ''}${won ? ' ' + styles.reviewWon : ''}`}
    >
      {art ? <img src={art} className={artClass} alt="" /> : <span className={artClass} />}
      <span className={styles.reviewText}>
        <span className={styles.reviewName} title={item.name}>
          {item.name}
        </span>
        <span className={styles.reviewCount}>{item.count.toLocaleString()} queues</span>
      </span>
    </span>
  );
}

interface ReviewRowProps {
  question: GameQuestion;
  guess: 'left' | 'right';
  /** The user's bonus (top queuer) pick, if known. */
  bonusGuess?: string;
  qStat?: GameQuestionStat;
}

function ReviewRow({ question: q, guess, bonusGuess, qStat }: ReviewRowProps) {
  const correct = guess === q.winner;
  // The bonus question is about the winning item (bonusItem, else the winner).
  const bonusTarget = (q.bonusItem ?? q.winner) === 'left' ? q.left : q.right;
  const bonusCorrect = !!bonusGuess && bonusGuess === bonusTarget.topQueuer;
  const correctPct = q.winner === 'left' ? qStat?.leftPct : qStat?.rightPct;

  return (
    <li className={styles.reviewItem}>
      <span
        className={`${styles.mark} ${correct ? styles.markRight : styles.markWrong}`}
        role="img"
        aria-label={correct ? 'You got this right' : 'You got this wrong'}
      >
        {correct ? '✓' : '✗'}
      </span>
      <span className={styles.faceoff}>
        <ReviewSide item={q.left} won={q.winner === 'left'} />
        <span className={styles.reviewVs}>vs</span>
        <ReviewSide item={q.right} won={q.winner === 'right'} end />
      </span>
      {(qStat || bonusGuess) && (
        <span className={styles.reviewMeta}>
          {bonusGuess && (
            <span className={bonusCorrect ? styles.metaRight : styles.metaWrong}>
              Top Queuer: {bonusCorrect ? '✓' : '✗'} {bonusGuess}
            </span>
          )}
          {qStat && correctPct !== undefined && <span>{correctPct}% got it right</span>}
          {qStat && qStat.bonusOptions.length > 0 && (
            <span className={styles.metaPicks}>{qStat.bonusOptions.map((o) => `${o.name} ${o.pct}%`).join(' · ')}</span>
          )}
        </span>
      )}
    </li>
  );
}

interface Props {
  questions?: GameQuestion[];
  mainGuesses?: Array<'left' | 'right'>;
  bonusGuesses?: string[];
  stats?: GameStatsResult;
}

/** Your answers, round by round: the winner in full white, your mark, and how the room did. */
export function QueuedleSummary({ questions, mainGuesses, bonusGuesses, stats }: Props) {
  if (!questions || !mainGuesses || questions.length === 0 || mainGuesses.length < questions.length) return null;
  return (
    <SectionCard title="Your answers">
      <ol className={styles.review}>
        {questions.map((q, i) => (
          <ReviewRow
            key={i}
            question={q}
            guess={mainGuesses[i]}
            bonusGuess={bonusGuesses?.[i] || undefined}
            qStat={stats?.questions?.[i]}
          />
        ))}
      </ol>
    </SectionCard>
  );
}
