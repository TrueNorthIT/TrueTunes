import type { ReactNode } from 'react';
import { explainPick } from '../../lib/pickExplanation';
import { InfoTip } from './InfoTip';
import styles from './InfoTip.module.css';

type Explain = Parameters<typeof explainPick>[0];

/** The "Why this pick" info icon: who queued this artist and song, and how often. */
export function PickInfoTip({ className, icon, ...pick }: Explain & { className?: string; icon?: ReactNode }) {
  const { lines } = explainPick(pick);
  return (
    <InfoTip label="Why this pick" className={className} icon={icon}>
      <p className={styles.heading}>Why this pick</p>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </InfoTip>
  );
}
