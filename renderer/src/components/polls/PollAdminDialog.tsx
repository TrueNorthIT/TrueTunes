import { useState } from 'react';
import type { ReactElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { fitsOnBoard, POLL_QUESTION_ROWS, wrapForBoard } from '../../lib/pollBoard';
import { Dialog } from '../common/Dialog';
import { PillButton } from '../common/PillButton';
import dialog from '../common/Dialog.module.css';
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

/** The board as it will read: monospace and upper case because the Vestaboard is. */
function Preview({ question }: { question: string }) {
  const lines = wrapForBoard(question).slice(0, POLL_QUESTION_ROWS);
  return (
    <div className={styles.preview} role="region" aria-label="Vestaboard preview">
      <div className={styles.previewRow}>THIS WEEK&apos;S POLL</div>
      {Array.from({ length: POLL_QUESTION_ROWS }, (_, i) => (
        <div key={i} className={styles.previewRow}>
          {lines[i] ?? ''}
        </div>
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
  onClose: () => void;
}

function PollForm({ poll, onSaved, onCancel, onClose }: FormProps) {
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
    <Dialog
      title={poll ? 'Edit poll' : 'New poll'}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <PillButton onClick={onCancel}>Cancel</PillButton>
          <PillButton variant="primary" type="submit" disabled={!valid || saving}>
            Save poll
          </PillButton>
        </>
      }
    >
      <div className={dialog.stack}>
        <label className={dialog.field}>
          <span className={dialog.label}>Question</span>
          <input
            className={dialog.input}
            type="text"
            placeholder="e.g. Best biscuit for the tea round?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={200}
          />
        </label>

        <div className={dialog.field} role="group" aria-label="Choices">
          <span className={dialog.label} aria-hidden="true">
            Choices
          </span>
          {choices.map((choice, i) => (
            <input
              key={i}
              className={dialog.input}
              type="text"
              aria-label={`Choice ${i + 1}`}
              placeholder={`Choice ${i + 1}`}
              value={choice}
              onChange={(e) => setChoices((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
              maxLength={80}
            />
          ))}
          <PillButton
            className={styles.addChoice}
            disabled={choices.length >= MAX_CHOICES}
            onClick={() => setChoices((prev) => [...prev, ''])}
          >
            <Plus size={15} aria-hidden="true" /> Add choice
          </PillButton>
        </div>

        <div className={dialog.field}>
          <span className={dialog.label}>On the Vestaboard</span>
          <Preview question={question} />
          {!fits && (
            <p className={styles.warning} role="alert">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>
                This question doesn't fit on the Vestaboard (4 rows of 22 characters), so a generic &quot;new poll&quot;
                message will be posted instead.
              </span>
            </p>
          )}
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

  if (editing) {
    return (
      <PollForm
        poll={editing === 'new' ? undefined : editing}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
        onCancel={() => setEditing(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog
      title="Poll admin"
      onClose={onClose}
      actions={
        <PillButton variant="primary" onClick={() => setEditing('new')}>
          <Plus size={15} aria-hidden="true" /> New poll
        </PillButton>
      }
    >
      <div className={dialog.stack}>
        <p className={dialog.note}>
          One poll goes live each Monday, in this order. Live polls are locked. Results are read straight from Cosmos.
        </p>
        {isError && (
          <p className={dialog.error} role="status">
            Couldn't load the polls.
          </p>
        )}
        <ul className={styles.rows}>
          {(polls ?? []).map((poll) => {
            const upcomingIndex = upcomingIds.indexOf(poll.id);
            return (
              <li key={poll.id} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.question}>{poll.question}</span>
                  <span className={styles.date}>{formatMonday(poll.liveFrom)}</span>
                </div>
                {poll.live ? (
                  <span className={styles.liveChip}>Live</span>
                ) : (
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Move up: ${poll.question}`}
                      title="Move up"
                      disabled={upcomingIndex <= 0}
                      onClick={() => move(poll.id, -1)}
                    >
                      <ChevronUp size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Move down: ${poll.question}`}
                      title="Move down"
                      disabled={upcomingIndex >= upcomingIds.length - 1}
                      onClick={() => move(poll.id, 1)}
                    >
                      <ChevronDown size={18} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Edit poll: ${poll.question}`}
                      title="Edit"
                      onClick={() => setEditing(poll)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconDanger}`}
                      aria-label={`Delete poll: ${poll.question}`}
                      title="Delete"
                      onClick={() => remove(poll)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {error && (
          <p className={dialog.error} role="status">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
