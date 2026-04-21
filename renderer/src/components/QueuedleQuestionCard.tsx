import styles from '../styles/Queuedle.module.css';

interface Props {
  question: GameQuestion;
  revealed: boolean;
  pickedSide: 'left' | 'right' | null;
  onPick: (side: 'left' | 'right') => void;
  onNext: () => void;
}

function CategoryLabel({ category }: { category: GameItemCategory }) {
  const label = category === 'track' ? 'Track' : category === 'artist' ? 'Artist' : 'Album';
  return <span className={styles.categoryBadge}>{label}</span>;
}

function Side({
  item,
  side,
  revealed,
  isWinner,
  pickedSide,
  onPick,
}: {
  item: GameItem;
  side: 'left' | 'right';
  revealed: boolean;
  isWinner: boolean;
  pickedSide: 'left' | 'right' | null;
  onPick: (side: 'left' | 'right') => void;
}) {
  const cls = [
    styles.side,
    revealed && isWinner && styles.sideWinner,
    revealed && !isWinner && styles.sideLoser,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <CategoryLabel category={item.category} />
      {item.imageUrl ? (
        <img className={styles.artBig} src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <div className={styles.artBigPlaceholder}>♪</div>
      )}
      <div className={styles.itemName}>{item.name}</div>
      {item.subtitle ? <div className={styles.itemSub}>{item.subtitle}</div> : null}
      {revealed ? (
        <div>
          <div className={styles.revealCount}>{item.count}</div>
          <div className={styles.revealLabel}>queues</div>
        </div>
      ) : (
        <div className={styles.pickRow}>
          <button
            className={styles.pickBtn}
            onClick={() => onPick(side)}
            disabled={pickedSide !== null}
          >
            Pick
          </button>
        </div>
      )}
    </div>
  );
}

export function QueuedleQuestionCard({ question, revealed, pickedSide, onPick, onNext }: Props) {
  return (
    <>
      <div className={styles.question}>
        <Side
          item={question.left}
          side="left"
          revealed={revealed}
          isWinner={question.winner === 'left'}
          pickedSide={pickedSide}
          onPick={onPick}
        />
        <div className={styles.versus}>VS</div>
        <Side
          item={question.right}
          side="right"
          revealed={revealed}
          isWinner={question.winner === 'right'}
          pickedSide={pickedSide}
          onPick={onPick}
        />
      </div>
      {revealed && (
        <div className={styles.nextRow}>
          <button className={styles.nextBtn} onClick={onNext}>
            Next
          </button>
        </div>
      )}
    </>
  );
}
