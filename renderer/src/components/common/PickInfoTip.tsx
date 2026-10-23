import type { ReactNode } from 'react';
import { explainPick } from '../../lib/pickExplanation';
import { InfoTip } from './InfoTip';
import styles from './InfoTip.module.css';

type Explain = Parameters<typeof explainPick>[0];

/** The "Why this pick" info icon: who's behind a DJ pick, the room fit and why this track. */
export function PickInfoTip({ className, icon, ...pick }: Explain & { className?: string; icon?: ReactNode }) {
  const e = explainPick(pick);
  return (
    <InfoTip label="Why this pick" className={className} icon={icon}>
      <p className={styles.heading}>Why this pick</p>
      {e.reason && <p>{e.reason}</p>}
      {e.people.length > 0 && (
        <ul className={styles.people}>
          {e.people.map((p) => (
            <li key={p.name}>
              {p.count == null ? p.name : `${p.name} — ${p.count === 1 ? 'queued them once' : `queued them ${p.count} times`}`}
            </li>
          ))}
          {e.more > 0 && <li>and {e.more} more</li>}
        </ul>
      )}
      {e.fit != null && <p>Good fit for who's in: {e.fit}%</p>}
      {e.track && <p>{e.track}</p>}
    </InfoTip>
  );
}
