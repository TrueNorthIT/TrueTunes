import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useDisplayName } from '../hooks/useDisplayName';
import { Dialog } from './common/Dialog';
import { PillButton } from './common/PillButton';
import dialog from './common/Dialog.module.css';
import styles from '../styles/FeedbackDialog.module.css';

interface Props {
  onClose: () => void;
}

type IssueType = 'bug' | 'feature';

const TYPES: Array<{ value: IssueType; label: string }> = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
];

export function FeedbackDialog({ onClose }: Props) {
  const [type, setType] = useState<IssueType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [issueUrl, setIssueUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const displayName = useDisplayName() ?? null;

  const canSubmit = title.trim().length > 0;
  const busy = status === 'loading';

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setStatus('loading');
    try {
      // The main process posts it to the feedback function, which signs it with the caller's name.
      const result = await window.sonos.submitFeedback(type, title.trim(), description.trim());
      if ('error' in result) throw new Error(result.error);
      setIssueUrl(result.url);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  const noun = type === 'bug' ? 'bug report' : 'feature request';

  if (status === 'success') {
    return (
      <Dialog
        title="Thanks, it's on GitHub"
        onClose={onClose}
        size="sm"
        actions={
          <>
            <PillButton onClick={() => window.sonos.openExternal(issueUrl)}>
              View on GitHub <ExternalLink size={14} aria-hidden="true" />
            </PillButton>
            <PillButton variant="primary" onClick={onClose}>
              Done
            </PillButton>
          </>
        }
      >
        <p className={dialog.note}>Your {noun} has been created. You can follow it, or add more detail, on GitHub.</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Send feedback"
      onClose={onClose}
      onSubmit={() => void handleSubmit()}
      actions={
        <>
          <PillButton onClick={onClose}>Cancel</PillButton>
          <PillButton variant="primary" type="submit" disabled={!canSubmit || busy}>
            {busy ? 'Sending…' : 'Send'}
          </PillButton>
        </>
      }
    >
      <div className={dialog.stack}>
        <p className={dialog.note}>
          Report a bug or ask for a feature. It goes to the True Tunes repo on GitHub
          {displayName ? (
            <>
              , signed <strong className={styles.name}>{displayName}</strong>.
            </>
          ) : (
            '.'
          )}
        </p>

        <div className={styles.segmented} role="group" aria-label="Type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`${styles.segment}${type === t.value ? ' ' + styles.segmentOn : ''}`}
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
              disabled={busy}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className={dialog.field}>
          <span className={dialog.label}>Title</span>
          <input
            className={dialog.input}
            type="text"
            placeholder={type === 'bug' ? 'What went wrong?' : 'What would you like?'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={128}
            spellCheck
            disabled={busy}
          />
        </label>
        <label className={dialog.field}>
          <span className={dialog.label}>
            Details <span className={styles.optional}>(optional)</span>
          </span>
          <textarea
            className={dialog.input}
            placeholder={
              type === 'bug'
                ? 'Steps to reproduce, what you expected, what happened…'
                : 'Describe the feature and why it would be useful…'
            }
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            rows={5}
            disabled={busy}
          />
        </label>
        {status === 'error' && (
          <p className={dialog.error} role="alert">
            Couldn't send it: {errorMsg}. Your text is still here, so you can try again.
          </p>
        )}
      </div>
    </Dialog>
  );
}
