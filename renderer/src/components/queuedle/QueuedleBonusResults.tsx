import { PillButton } from '../common/PillButton';
import { SectionCard } from '../common/SectionCard';
import { UserAvatar } from '../common/UserAvatar';
import { BonusItemArt } from './bonusParts';
import { itemSubLine } from './format';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  winningItems: GameItem[];
  bonusGuesses: string[];
  onContinue: () => void;
  imageByUser?: Map<string, string | null | undefined>;
}

/** Round two marked: your pick against the colleague who really queued it most. */
export function QueuedleBonusResults({ winningItems, bonusGuesses, onContinue, imageByUser }: Props) {
  const knew = winningItems.filter((item, i) => bonusGuesses[i] === item.topQueuer).length;
  return (
    <SectionCard title="Bonus results">
      <p className={styles.cardSub}>
        You knew {knew} of {winningItems.length}. How well do you know your colleagues&apos; taste?
      </p>
      <ol className={styles.bonusList}>
        {winningItems.map((item, i) => {
          const guess = bonusGuesses[i] ?? '';
          const isCorrect = guess === item.topQueuer;
          return (
            <li key={`${item.category}:${item.id}:${i}`} className={styles.bonusRow}>
              <BonusItemArt item={item} />
              <span className={styles.bonusInfo}>
                <span className={styles.bonusName}>{item.name}</span>
                <span className={styles.bonusSub}>{itemSubLine(item)}</span>
              </span>
              <span className={styles.bonusAnswer}>
                <span className={isCorrect ? styles.metaRight : styles.metaWrong}>
                  {isCorrect ? '✓' : '✗'} {guess || '—'}
                </span>
                {!isCorrect && (
                  <span className={styles.bonusActual}>
                    <UserAvatar name={item.topQueuer} imageUrl={imageByUser?.get(item.topQueuer)} className={styles.optionAvatar} />
                    <span>It was {item.topQueuer}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.submitRow}>
        <PillButton variant="primary" onClick={onContinue}>
          See my score
        </PillButton>
      </div>
    </SectionCard>
  );
}
