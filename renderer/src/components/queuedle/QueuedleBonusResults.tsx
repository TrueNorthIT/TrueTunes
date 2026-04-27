import styles from '../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  bonusGuesses: string[];
  onContinue: () => void;
}

function catLabel(c: GameItemCategory): string {
  return c === 'track' ? 'Track' : c === 'artist' ? 'Artist' : 'Album';
}

export function QueuedleBonusResults({ winningItems, bonusGuesses, onContinue }: Props) {
  return (
    <>
      <div className={styles.bonusIntro}>
        <h2 className={styles.bonusIntroTitle}>Bonus results</h2>
        <p className={styles.bonusIntroSub}>How well do you know your colleagues&apos; taste?</p>
      </div>
      <div className={styles.bonusList}>
        {winningItems.map((item, i) => {
          const guess = bonusGuesses[i] ?? '';
          const correct = item.topQueuer;
          const isCorrect = guess === correct;
          return (
            <div key={`${item.category}:${item.id}:${i}`} className={styles.bonusResultRow}>
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
              <div className={styles.bonusResultAnswer}>
                <span className={isCorrect ? styles.resultCorrect : styles.resultWrong}>
                  {isCorrect ? '✓' : '✗'} {guess || '—'}
                </span>
                {!isCorrect && (
                  <span className={styles.bonusCorrectLabel}>{correct}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.submitRow}>
        <button className={styles.nextBtn} onClick={onContinue}>
          See my score
        </button>
      </div>
    </>
  );
}
