import { Dialog } from '../common/Dialog';
import dialog from '../common/Dialog.module.css';
import { PillButton } from '../common/PillButton';
import styles from '../../styles/PollDialog.module.css';

interface Props {
  poll: PollLive;
  /** Unanswered polls including this one. */
  remaining: number;
  submitting: boolean;
  error: string | null;
  onChoose: (choice: number) => void;
  /** Hide this poll without voting (nothing is sent). */
  onSkip: () => void;
  onClose: () => void;
}

/** One poll at a time: the question and a button per choice. Anonymous; nothing but the index is sent. */
export function PollAnswerDialog({ poll, remaining, submitting, error, onChoose, onSkip, onClose }: Props) {
  // Dialog portals to <body>, out of the title bar, so its drag region can't swallow clicks.
  return (
    <Dialog
      title={poll.question}
      onClose={onClose}
      size="sm"
      closeLabel="Close"
      actions={
        <PillButton disabled={submitting} onClick={onSkip}>
          Skip this poll
        </PillButton>
      }
    >
      <div className={dialog.stack}>
        <p className={dialog.note}>
          Anonymous: nobody can see who picked what.
          {remaining > 1 ? ` ${remaining - 1} more waiting after this one.` : ''}
        </p>
        <div className={styles.choices}>
          {poll.choices.map((choice, i) => (
            <button key={i} type="button" className={styles.choice} disabled={submitting} onClick={() => onChoose(i)}>
              {choice}
            </button>
          ))}
        </div>
        {error && (
          <p className={dialog.error} role="status">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
