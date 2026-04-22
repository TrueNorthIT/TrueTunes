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

function CountDisplay({ count }: { count: number }) {
  return (
    <div>
      <div className={styles.revealCount}>{count}</div>
      <div className={styles.revealLabel}>queues</div>
    </div>
  );
}

function Side({
  item,
  side,
  revealed,
  isWinner,
  isCarryover,
  pickedSide,
  onPick,
}: {
  item: GameItem;
  side: 'left' | 'right';
  revealed: boolean;
  isWinner: boolean;
  isCarryover: boolean;
  pickedSide: 'left' | 'right' | null;
  onPick: (side: 'left' | 'right') => void;
}) {
  const pickLabel =
    item.category === 'track' ? 'Pick song' : item.category === 'artist' ? 'Pick artist' : 'Pick album';

  const cls = [
    styles.side,
    isCarryover && !revealed && styles.sideKnown,
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
        <CountDisplay count={item.count} />
      ) : (
        <>
          {isCarryover && <CountDisplay count={item.count} />}
          <div className={styles.pickRow}>
            <button
              className={styles.pickBtn}
              onClick={() => onPick(side)}
              disabled={pickedSide !== null}
            >
              {pickLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function QueuedleQuestionCard({ question, revealed, pickedSide, onPick, onNext }: Props) {
  const carryover = question.carryover;
  return (
    <>
      <div className={styles.question}>
        <Side
          item={question.left}
          side="left"
          revealed={revealed}
          isWinner={question.winner === 'left'}
          isCarryover={carryover === 'left'}
          pickedSide={pickedSide}
          onPick={onPick}
        />
        <div className={styles.versus}>VS</div>
        <Side
          item={question.right}
          side="right"
          revealed={revealed}
          isWinner={question.winner === 'right'}
          isCarryover={carryover === 'right'}
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
