import { Music } from 'lucide-react';
import { PillButton } from '../common/PillButton';
import { AddButton } from '../common/AddButton';
import { useQueueActions } from '../../hooks/useQueueActions';
import { statsTrackToItem } from '../../lib/homeData';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  question: GameQuestion;
  revealed: boolean;
  pickedSide: 'left' | 'right' | null;
  onPick: (side: 'left' | 'right') => void;
  onNext: () => void;
  carryFrom?: 'left' | 'right' | null;
}

const KIND: Record<GameItemCategory, string> = { track: 'Track', artist: 'Artist', album: 'Album' };
const PICK: Record<GameItemCategory, string> = { track: 'Pick song', artist: 'Pick artist', album: 'Pick album' };

function Side({
  item,
  side,
  revealed,
  isWinner,
  isCarryover,
  carryFrom,
  pickedSide,
  onPick,
}: {
  item: GameItem;
  side: 'left' | 'right';
  revealed: boolean;
  isWinner: boolean;
  isCarryover: boolean;
  carryFrom: 'left' | 'right' | null;
  pickedSide: 'left' | 'right' | null;
  onPick: (side: 'left' | 'right') => void;
}) {
  const { addToQueue } = useQueueActions();
  const yours = revealed && pickedSide === side;
  // A track can be queued once the round is revealed, never before the pick (it would spoil the round).
  // Games generated before #100 carry no service ids, so their tracks can't be queued.
  const queueable =
    revealed && item.category === 'track' && item.serviceId && item.accountId
      ? statsTrackToItem({ ...item, trackName: item.name, artist: item.subtitle })
      : null;
  const slideFrom = isCarryover && carryFrom !== null && carryFrom !== side ? carryFrom : null;
  const cls = [
    styles.side,
    revealed && (isWinner ? styles.sideWon : styles.sideLost),
    slideFrom === 'right' && styles.slideFromRight,
    slideFrom === 'left' && styles.slideFromLeft,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className={styles.sideArtBox}>
        <span className={`${styles.sideArt}${item.category === 'artist' ? ' ' + styles.round : ''}`}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <Music size={40} aria-hidden="true" />}
        </span>
      </span>
      <span className={styles.sideText}>
        <span className={styles.kind}>{KIND[item.category]}</span>
        <span className={styles.itemName}>{item.name}</span>
        {/* An empty sub-line still takes its height, so both prints come out the same size. */}
        <span className={styles.itemSub}>{item.subtitle && item.category !== 'artist' ? item.subtitle : ''}</span>
      </span>
      <span className={styles.sideFoot}>
        {revealed || isCarryover ? (
          <span className={`${styles.count}${revealed && !isCarryover ? ' ' + styles.countIn : ''}`}>
            <span className={styles.countNum}>{item.count.toLocaleString()}</span> queues
          </span>
        ) : (
          <span className={styles.count} aria-hidden="true">
            <span className={styles.countNum}>?</span>
          </span>
        )}
        {!revealed && <span className={styles.pickCue}>{PICK[item.category]}</span>}
        {yours && (
          <span className={`${styles.yourPick} ${isWinner ? styles.markRight : styles.markWrong}`}>
            {isWinner ? '✓' : '✗'} Your pick
          </span>
        )}
        {queueable && <AddButton label={`Add ${item.name} to queue`} onClick={() => void addToQueue(queueable)} />}
      </span>
    </>
  );

  if (revealed) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cls} onClick={() => onPick(side)} disabled={pickedSide !== null}>
      {body}
    </button>
  );
}

/** Two prints face off; the whole print is the pick. After the pick both counts show. */
export function QueuedleQuestionCard({ question, revealed, pickedSide, onPick, onNext, carryFrom }: Props) {
  const carryover = question.carryover;
  const carryFromSide = carryFrom ?? null;
  const right = pickedSide !== null && pickedSide === question.winner;
  return (
    <div className={styles.faceOff}>
      <h2 className={styles.prompt}>Which has the office queued more?</h2>
      <div className={styles.question}>
        <Side
          item={question.left}
          side="left"
          revealed={revealed}
          isWinner={question.winner === 'left'}
          isCarryover={carryover === 'left'}
          carryFrom={carryFromSide}
          pickedSide={pickedSide}
          onPick={onPick}
        />
        <span className={styles.versus} aria-hidden="true">
          or
        </span>
        <Side
          item={question.right}
          side="right"
          revealed={revealed}
          isWinner={question.winner === 'right'}
          isCarryover={carryover === 'right'}
          carryFrom={carryFromSide}
          pickedSide={pickedSide}
          onPick={onPick}
        />
      </div>
      <div className={styles.nextRow}>
        <p className={styles.verdict} role="status">
          {revealed && pickedSide ? (right ? 'Nice one.' : 'Not this time.') : ''}
        </p>
        {revealed && (
          <PillButton variant="primary" onClick={onNext}>
            Next
          </PillButton>
        )}
      </div>
    </div>
  );
}
