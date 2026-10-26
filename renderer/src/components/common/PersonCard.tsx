import type { ReactNode } from 'react';
import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { UserAvatar } from './UserAvatar';
import { PersonName } from './PersonName';
import styles from './PersonCard.module.css';

interface Props {
  name: string;
  imageUrl?: string | null;
  /** Muted line under the name, e.g. "3 albums this week". */
  caption?: string;
  /** Opens their profile. */
  onOpen: () => void;
  /** Title and accessible name of the header button. Default "Open {name}'s profile". */
  openLabel?: string;
  /** Small control at the header's right edge (an InfoTip); a sibling of the header button, not inside it. */
  action?: ReactNode;
  /** Whatever sits under the header: tiles, rows. */
  children?: ReactNode;
}

/** A person: avatar, name and a count, with their photo's dominant colour washed across the header. */
export function PersonCard({ name, imageUrl, caption, onOpen, openLabel, action, children }: Props) {
  const label = openLabel ?? `Open ${name}'s profile`;
  const art = useImage(imageUrl ?? null);
  const color = useDominantColor(art);
  const wash = color
    ? { background: `linear-gradient(100deg, rgba(${color}, 0.3), rgba(${color}, 0) 75%)` }
    : undefined;
  return (
    <div className={styles.card}>
      <button type="button" className={styles.head} style={wash} onClick={onOpen} title={label} aria-label={openLabel}>
        <UserAvatar name={name} imageUrl={imageUrl} className={styles.avatar} />
        <span className={styles.who}>
          <PersonName name={name} className={styles.name} />
          {caption && <span className={styles.caption}>{caption}</span>}
        </span>
      </button>
      {action && <div className={styles.action}>{action}</div>}
      {children}
    </div>
  );
}
