import { createPortal } from 'react-dom';
import feedback from '../../styles/FeedbackDialog.module.css';
import styles from '../../styles/PollDialog.module.css';

interface Props {
  poll: PollLive;
  /** Unanswered polls including this one. */
  remaining: number;
  submitting: boolean;
  error: string | null;
  onChoose: (choice: number) => void;
  onClose: () => void;
}

/** One poll at a time: the question and a button per choice. Anonymous; nothing but the index is sent. */
export function PollAnswerDialog({ poll, remaining, submitting, error, onChoose, onClose }: Props) {
  // Portalled out of the title bar so its drag region cannot swallow clicks.
  return createPortal(
    <div
      className={feedback.overlay}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={feedback.modal} role="dialog" aria-modal="true" aria-label="Weekly poll">
        <button className={feedback.close} onClick={onClose} aria-label="Close">✕</button>
        <h2 className={feedback.heading}>{poll.question}</h2>
        <p className={feedback.sub}>
          Anonymous: nobody can see who picked what.
          {remaining > 1 ? ` ${remaining - 1} more waiting after this one.` : ''}
        </p>
        <div className={styles.choices}>
          {poll.choices.map((choice, i) => (
            <button key={i} className={styles.choice} disabled={submitting} onClick={() => onChoose(i)}>
              {choice}
            </button>
          ))}
        </div>
        {error && <p className={feedback.error} role="status">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
