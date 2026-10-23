import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { PillButton } from '../common/PillButton';
import styles from './StatsPage.module.css';

interface Props {
  title: string;
  /** Muted line under the title: "12,472 queues · 16 people". */
  facts?: ReactNode;
  /** The page this one hangs off, as the back pill's label: "Leaderboard". */
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}

/** Scrolling page frame for the stats pages: page title, facts line, back pill. Same header as Leaderboard. */
export function StatsPage({ title, facts, backLabel, onBack, children }: Props) {
  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {facts ? <p className={styles.facts}>{facts}</p> : null}
          </div>
          <PillButton onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            {backLabel}
          </PillButton>
        </header>
        {children}
      </div>
    </div>
  );
}
