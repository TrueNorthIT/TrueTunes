import { useState } from 'react';
import styles from '../styles/DisplayNameModal.module.css';

interface Props {
  onSave: (name: string) => Promise<{ error: string } | null>;
  defaultName?: string;
}

export function DisplayNameModal({ onSave, defaultName }: Props) {
  const [value, setValue] = useState(defaultName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const result = await onSave(trimmed);
    setSaving(false);
    if (result?.error === 'taken') {
      setError('That name is already taken — try another.');
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>🎵</div>
        <h2 className={styles.heading}>What should we call you?</h2>
        <p className={styles.sub}>
          Your name shows on tracks you add to the shared queue. Defaults to your organisation account name.
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="text"
            placeholder="Your name"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            autoFocus
            maxLength={32}
            spellCheck={false}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.btn} type="submit" disabled={!value.trim() || saving}>
            {saving ? 'Saving…' : "Let's go"}
          </button>
        </form>
      </div>
    </div>
  );
}
