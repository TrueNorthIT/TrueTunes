import { useState } from 'react';
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

export function FeedbackDialog({ onClose }: Props) {
  const [type, setType]         = useState<IssueType>('bug');
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [status, setStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [issueUrl, setIssueUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = title.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || status !== 'idle') return;
    setStatus('loading');
    try {
      const issue = await createGitHubIssue(title.trim(), description.trim(), type);
      setIssueUrl(issue.html_url);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className={styles.overlay} onKeyDown={handleKeyDown}>
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>

        {status === 'success' ? (
          <div className={styles.success}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.heading}>Submitted!</h2>
            <p className={styles.sub}>
              Your {type === 'bug' ? 'bug report' : 'feature request'} has been created.
            </p>
            <a className={styles.link} href={issueUrl} target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
            <button className={styles.btn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <h2 className={styles.heading}>Send Feedback</h2>
            <p className={styles.sub}>Report a bug or request a feature on GitHub.</p>

            <div className={styles.toggle}>
              <button
                className={`${styles.toggleBtn} ${type === 'bug' ? styles.active : ''}`}
                onClick={() => setType('bug')}
                type="button"
              >
                Bug report
              </button>
              <button
                className={`${styles.toggleBtn} ${type === 'feature' ? styles.active : ''}`}
                onClick={() => setType('feature')}
                type="button"
              >
                Feature request
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <input
                className={styles.input}
                type="text"
                placeholder={type === 'bug' ? 'What went wrong?' : 'What would you like?'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                maxLength={128}
                spellCheck
                disabled={status === 'loading'}
              />
              <textarea
                className={styles.textarea}
                placeholder={
                  type === 'bug'
                    ? 'Steps to reproduce, expected vs actual behaviour…'
                    : 'Describe the feature and why it would be useful…'
                }
                value={description}
                onChange={(e) => setDesc(e.target.value)}
                rows={5}
                disabled={status === 'loading'}
              />
              {status === 'error' && (
                <p className={styles.error}>{errorMsg}</p>
              )}
              <button
                className={styles.btn}
                type="submit"
                disabled={!canSubmit || status !== 'idle'}
              >
                {status === 'loading' ? 'Submitting…' : 'Submit'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
