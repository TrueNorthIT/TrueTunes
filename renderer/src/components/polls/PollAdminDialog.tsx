import { useState } from 'react';
import type { ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fitsOnBoard, POLL_QUESTION_ROWS, wrapForBoard } from '../../lib/pollBoard';
import feedback from '../../styles/FeedbackDialog.module.css';
import styles from '../../styles/PollDialog.module.css';

/**
 * Poll admin dialog (P-9, P-10, P-12). Honour system: opened by the Konami code, no auth.
 * Live polls are locked; upcoming ones can be edited, deleted and moved. Never shows results.
 */
export interface PollAdminDialogProps {
  onClose: () => void;
}

const ADMIN_KEY = ['poll-admin'] as const;
const MAX_CHOICES = 6;

function formatMonday(iso: string | null): string {
  if (!iso) return 'Not scheduled';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Preview({ question }: { question: string }) {
  const lines = wrapForBoard(question).slice(0, POLL_QUESTION_ROWS);
  return (
    <div className={styles.preview} role="region" aria-label="Vestaboard preview">
      <div className={styles.previewRow}>THIS WEEK&apos;S POLL</div>
      {Array.from({ length: POLL_QUESTION_ROWS }, (_, i) => (
        <div key={i} className={styles.previewRow}>{lines[i] ?? ''}</div>
      ))}
      <div className={styles.previewRow}>VOTE IN TRUE TUNES</div>
    </div>
  );
}

interface FormProps {
  /** Poll being edited, or undefined for a new one. */
  poll?: PollAdminItem;
  onSaved: () => void;
  onCancel: () => void;
}

function PollForm({ poll, onSaved, onCancel }: FormProps) {
  const [question, setQuestion] = useState(poll?.question ?? '');
  const [choices, setChoices] = useState<string[]>(poll?.choices ?? ['', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = choices.map((c) => c.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && filled.length >= 2;
  const fits = fitsOnBoard(question);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const input: PollInputPayload = { question: question.trim(), choices: filled };
    try {
      const res = poll ? await window.sonos.pollAdminUpdate(poll.id, input) : await window.sonos.pollAdminCreate(input);
      if ('error' in res) setError(res.error);
      else onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={feedback.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        className={feedback.input}
        type="text"
        aria-label="Question"
        placeholder="Question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={200}
        autoFocus
      />
      {choices.map((choice, i) => (
        <input
          key={i}
          className={feedback.input}
          type="text"
          aria-label={`Choice ${i + 1}`}
          placeholder={`Choice ${i + 1}`}
          value={choice}
          onChange={(e) => setChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
          maxLength={80}
        />
      ))}
      <button
        className={feedback.btn}
        type="button"
        disabled={choices.length >= MAX_CHOICES}
        onClick={() => setChoices((prev) => [...prev, ''])}
      >
        Add choice
      </button>

      <Preview question={question} />
      {!fits && (
        <p className={styles.warning} role="alert">
          This question does not fit on the Vestaboard (4 rows of 22 characters). A generic &quot;new poll&quot; message will be
          posted instead.
        </p>
      )}
      {error && <p className={feedback.error} role="status">{error}</p>}

      <div className={styles.actions}>
        <button className={feedback.btn} type="button" onClick={onCancel}>Cancel</button>
        <button className={feedback.btn} type="submit" disabled={!valid || saving}>Save poll</button>
      </div>
    </form>
  );
}

export function PollAdminDialog({ onClose }: PollAdminDialogProps): ReactElement {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PollAdminItem | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: polls, isError } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: async () => {
      const res = await window.sonos.pollAdminList();
      if ('error' in res) throw new Error(res.error);
      return res.polls;
    },
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_KEY });
  const upcomingIds = (polls ?? []).filter((p) => !p.live).map((p) => p.id);

  async function run(call: () => Promise<{ error: string } | object>) {
    setError(null);
    try {
      const res = await call();
      if ('error' in res) setError(String((res as { error: string }).error));
    } catch (err) {
      setError(String(err));
    }
    await refresh();
  }

  function move(id: string, delta: -1 | 1) {
    const ids = [...upcomingIds];
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void run(() => window.sonos.pollAdminReorder(ids));
  }

  function remove(poll: PollAdminItem) {
    if (!window.confirm(`Delete this poll?\n\n${poll.question}`)) return;
    void run(() => window.sonos.pollAdminDelete(poll.id));
  }

  return (
    <div
      className={feedback.overlay}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={`${feedback.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-label="Poll admin">
        <button className={feedback.close} onClick={onClose} aria-label="Close">✕</button>
        <h2 className={feedback.heading}>{editing ? (editing === 'new' ? 'New poll' : 'Edit poll') : 'Polls'}</h2>

        {editing ? (
          <PollForm
            poll={editing === 'new' ? undefined : editing}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <p className={feedback.sub}>
              One poll goes live each Monday, in this order. Live polls are locked. Results are read straight from Cosmos.
            </p>
            {isError && <p className={feedback.error} role="status">Could not load the polls.</p>}
            <ul className={styles.rows}>
              {(polls ?? []).map((poll) => {
                const upcomingIndex = upcomingIds.indexOf(poll.id);
                return (
                  <li key={poll.id} className={styles.row}>
                    <div className={styles.rowText}>
                      <span className={styles.question}>{poll.question}</span>
                      <span className={styles.date}>{formatMonday(poll.liveFrom)}</span>
                    </div>
                    {poll.live && <span className={styles.liveBadge}>Live</span>}
                    <div className={styles.rowActions}>
                      <button
                        className={styles.iconBtn}
                        aria-label={`Move up: ${poll.question}`}
                        disabled={poll.live || upcomingIndex <= 0}
                        onClick={() => move(poll.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className={styles.iconBtn}
                        aria-label={`Move down: ${poll.question}`}
                        disabled={poll.live || upcomingIndex >= upcomingIds.length - 1}
                        onClick={() => move(poll.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className={styles.iconBtn}
                        aria-label={`Edit poll: ${poll.question}`}
                        disabled={poll.live}
                        onClick={() => setEditing(poll)}
                      >
                        Edit
                      </button>
                      <button
                        className={styles.iconBtn}
                        aria-label={`Delete poll: ${poll.question}`}
                        disabled={poll.live}
                        onClick={() => remove(poll)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {error && <p className={feedback.error} role="status">{error}</p>}
            <button className={feedback.btn} style={{ width: '100%' }} onClick={() => setEditing('new')}>New poll</button>
          </>
        )}
      </div>
    </div>
  );
}
