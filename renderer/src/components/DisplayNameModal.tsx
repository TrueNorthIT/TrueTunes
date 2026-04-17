import { useState } from 'react';
import styles from '../styles/DisplayNameModal.module.css';

interface Props {
  onSave: (name: string) => void;
}

export function DisplayNameModal({ onSave }: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSave(trimmed);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.icon}>🎵</div>
        <h2 className={styles.heading}>What should we call you?</h2>
        <p className={styles.sub}>
          Your name shows on tracks you add to the shared queue.
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            className={styles.input}
            type="text"
            placeholder="Your name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            maxLength={32}
            spellCheck={false}
          />
          <button className={styles.btn} type="submit" disabled={!value.trim()}>
            Let's go
          </button>
        </form>
      </div>
    </div>
  );
}
