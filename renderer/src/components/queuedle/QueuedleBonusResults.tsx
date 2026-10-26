import { PillButton } from '../common/PillButton';
import { BonusCard, Candidate } from './bonusParts';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  bonusGuesses: string[];
  onContinue: () => void;
  imageByUser?: Map<string, string | null | undefined>;
}

/**
 * Round two marked, on the same ten cards: the top queuer carries a mint ✓, a wrong pick a red ✗,
 * and your pick keeps the ring it had while you chose.
 */
export function QueuedleBonusResults({ winningItems, bonusGuesses, onContinue, imageByUser }: Props) {
  const knew = winningItems.filter((item, i) => bonusGuesses[i] === item.topQueuer).length;
  return (
    <section className={styles.bonusStage} aria-labelledby="queuedle-bonus-results-title">
      <div className={styles.stageHead}>
        <div className={styles.stageTitles}>
          <h2 id="queuedle-bonus-results-title" className={styles.stageTitle}>
            Bonus results
          </h2>
          <p className={styles.stageSub}>
            You knew {knew} of {winningItems.length}. How well do you know your colleagues&apos; taste?
          </p>
        </div>
        <PillButton variant="primary" onClick={onContinue}>
          See my score
        </PillButton>
      </div>
      <ol className={styles.bonusGrid}>
        {winningItems.map((item, i) => {
          const guess = bonusGuesses[i] ?? '';
          // The choices as offered, plus the answer and your pick should either be missing from them.
          const names = [...new Set([...item.queuerCandidates, item.topQueuer, guess].filter(Boolean))];
          return (
            <BonusCard key={`${item.category}:${item.id}:${i}`} item={item}>
              <ul className={styles.candidates} aria-label={`Who queued ${item.name} most`}>
                {names.map((name) => {
                  const isTop = name === item.topQueuer;
                  const isPick = name === guess;
                  const mark = isTop ? '✓' : isPick ? '✗' : null;
                  const cls = [
                    styles.candidate,
                    styles.candidateResult,
                    isPick && styles.candidateActive,
                    isTop ? styles.markRight : isPick ? styles.markWrong : styles.candidateOther,
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const said = [isPick && 'your pick', isTop && 'top queuer'].filter(Boolean).join(', ');
                  return (
                    <li
                      key={name}
                      className={cls}
                      title={name}
                      data-result={isTop ? 'right' : isPick ? 'wrong' : 'other'}
                    >
                      <Candidate name={name} imageUrl={imageByUser?.get(name)} />
                      {mark && (
                        <span className={styles.candidateMark} aria-hidden="true">
                          {mark}
                        </span>
                      )}
                      {said && <span className={styles.srOnly}>, {said}</span>}
                    </li>
                  );
                })}
              </ul>
            </BonusCard>
          );
        })}
      </ol>
    </section>
  );
}
