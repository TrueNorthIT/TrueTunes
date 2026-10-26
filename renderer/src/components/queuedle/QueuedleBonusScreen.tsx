import { PillButton } from '../common/PillButton';
import { BonusCard, Candidate } from './bonusParts';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  selections: (string | null)[];
  onSelect: (index: number, name: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  imageByUser?: Map<string, string | null | undefined>;
}

/** Round two: for each winner, pick the colleague who queued it most. Ten cards on one screen, no scrolling. */
export function QueuedleBonusScreen({ winningItems, selections, onSelect, onSubmit, submitting, imageByUser }: Props) {
  const answered = selections.filter((s) => s !== null).length;
  const allAnswered = answered === selections.length;
  return (
    <section className={styles.bonusStage} aria-labelledby="queuedle-bonus-title">
      <div className={styles.stageHead}>
        <div className={styles.stageTitles}>
          <h2 id="queuedle-bonus-title" className={styles.stageTitle}>
            Who queued it most?
          </h2>
          <p className={styles.stageSub}>For each winner, pick the colleague who has queued it the most.</p>
        </div>
        <span className={styles.submitCount} role="status">
          {answered} of {selections.length} answered
        </span>
        <PillButton variant="primary" onClick={onSubmit} disabled={!allAnswered || submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </PillButton>
      </div>
      <ol className={styles.bonusGrid}>
        {winningItems.map((item, i) => (
          <BonusCard key={`${item.category}:${item.id}:${i}`} item={item}>
            <span className={styles.candidates} role="group" aria-label={`Who queued ${item.name} most`}>
              {item.queuerCandidates.map((name) => {
                const active = selections[i] === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    className={`${styles.candidate}${active ? ' ' + styles.candidateActive : ''}`}
                    aria-pressed={active}
                    onClick={() => onSelect(i, name)}
                    disabled={submitting}
                  >
                    <Candidate name={name} imageUrl={imageByUser?.get(name)} />
                  </button>
                );
              })}
            </span>
          </BonusCard>
        ))}
      </ol>
    </section>
  );
}
