import styles from '../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  selections: (string | null)[];
  onSelect: (index: number, name: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function catLabel(c: GameItemCategory): string {
  return c === 'track' ? 'Track' : c === 'artist' ? 'Artist' : 'Album';
}

export function QueuedleBonusScreen({
  winningItems,
  selections,
  onSelect,
  onSubmit,
  submitting,
}: Props) {
  const allAnswered = selections.every((s) => s !== null);
  return (
    <>
      <div className={styles.bonusIntro}>
        <h2 className={styles.bonusIntroTitle}>Bonus round — top queuer</h2>
        <p className={styles.bonusIntroSub}>
          For each winning entry, pick who&apos;s queued it the most.
        </p>
      </div>
      <div className={styles.bonusList}>
        {winningItems.map((item, i) => (
          <div key={`${item.category}:${item.id}:${i}`} className={styles.bonusRow}>
            {item.imageUrl ? (
              <img className={styles.bonusArt} src={item.imageUrl} alt="" loading="lazy" />
            ) : (
              <div className={styles.bonusArtPlaceholder} />
            )}
            <div className={styles.bonusInfo}>
              <span className={styles.bonusName}>{item.name}</span>
              <span className={styles.bonusSub}>
                {catLabel(item.category)}
                {item.subtitle && item.category !== 'artist' ? ` · ${item.subtitle}` : ''}
              </span>
            </div>
            <div className={styles.bonusOptions}>
              {item.queuerCandidates.map((name) => {
                const active = selections[i] === name;
                const cls = active
                  ? `${styles.bonusOption} ${styles.bonusOptionActive}`
                  : styles.bonusOption;
                return (
                  <button
                    key={name}
                    className={cls}
                    onClick={() => onSelect(i, name)}
                    disabled={submitting}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.submitRow}>
        <button
          className={styles.submitBtn}
          onClick={onSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </>
  );
}
