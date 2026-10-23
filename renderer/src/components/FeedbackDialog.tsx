import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog } from './common/Dialog';
import { PillButton } from './common/PillButton';
import dialog from './common/Dialog.module.css';
import styles from '../styles/FeedbackDialog.module.css';

interface Props {
  onClose: () => void;
}

type IssueType = 'bug' | 'feature';

const REPO = 'TrueNorthIT/TrueTunes';
const PAT  = import.meta.env.VITE_GITHUB_PAT as string | undefined;

async function createGitHubIssue(title: string, body: string, type: IssueType) {
  if (!PAT) throw new Error('VITE_GITHUB_PAT is not set');
  const label = type === 'bug' ? 'bug' : 'enhancement';
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ title, body, labels: [label] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `GitHub API error ${res.status}`);
  }
  return (await res.json()) as { html_url: string };
}

const TYPES: Array<{ value: IssueType; label: string }> = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
];

export function FeedbackDialog({ onClose }: Props) {
  const [type, setType]           = useState<IssueType>('bug');
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [status, setStatus]       = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [issueUrl, setIssueUrl]   = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    window.sonos.getDisplayName().then(setDisplayName).catch(() => null);
  }, []);

  const canSubmit = title.trim().length > 0;
  const busy = status === 'loading';

  async function handleSubmit() {
    if (!canSubmit || busy) return;
    setStatus('loading');
    try {
      const bodyParts = [description.trim()];
      if (displayName) bodyParts.push(`---\n**Raised by:** ${displayName}`);
      const issue = await createGitHubIssue(title.trim(), bodyParts.filter(Boolean).join('\n\n'), type);
      setIssueUrl(issue.html_url);
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
            <PillButton variant="primary" onClick={onClose}>Done</PillButton>
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
          {displayName ? <>, signed <strong className={styles.name}>{displayName}</strong>.</> : '.'}
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
          <span className={dialog.label}>Details <span className={styles.optional}>(optional)</span></span>
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
