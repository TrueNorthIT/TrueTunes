import { PillButton } from '../common/PillButton';
import { SectionCard } from '../common/SectionCard';
import { UserAvatar } from '../common/UserAvatar';
import { BonusItemArt } from './bonusParts';
import { itemSubLine } from './format';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  selections: (string | null)[];
  onSelect: (index: number, name: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  imageByUser?: Map<string, string | null | undefined>;
}

/** Round two: for each winner, pick the colleague who queued it most. The faces are the choices. */
export function QueuedleBonusScreen({ winningItems, selections, onSelect, onSubmit, submitting, imageByUser }: Props) {
  const answered = selections.filter((s) => s !== null).length;
  const allAnswered = answered === selections.length;
  return (
    <SectionCard title="Who queued it most?">
      <p className={styles.cardSub}>For each winner, pick the colleague who has queued it the most.</p>
      <ol className={styles.bonusList}>
        {winningItems.map((item, i) => (
          <li key={`${item.category}:${item.id}:${i}`} className={styles.bonusRow}>
            <BonusItemArt item={item} />
            <span className={styles.bonusInfo}>
              <span className={styles.bonusName}>{item.name}</span>
              <span className={styles.bonusSub}>{itemSubLine(item)}</span>
            </span>
            <span className={styles.bonusOptions} role="group" aria-label={`Who queued ${item.name} most`}>
              {item.queuerCandidates.map((name) => {
                const active = selections[i] === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`${styles.option}${active ? ' ' + styles.optionActive : ''}`}
                    aria-pressed={active}
                    onClick={() => onSelect(i, name)}
                    disabled={submitting}
                  >
                    <UserAvatar name={name} imageUrl={imageByUser?.get(name)} className={styles.optionAvatar} />
                    {name}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.submitRow}>
        <span className={styles.submitCount}>
          {answered} of {selections.length} answered
        </span>
        <PillButton variant="primary" onClick={onSubmit} disabled={!allAnswered || submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </PillButton>
      </div>
    </SectionCard>
  );
}
