import type { ReactNode } from 'react';
import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { UserAvatar } from './UserAvatar';
import styles from './PersonCard.module.css';

interface Props {
  name: string;
  imageUrl?: string | null;
  /** Muted line under the name, e.g. "3 albums this week". */
  caption?: string;
  /** Opens their profile. */
  onOpen: () => void;
  /** Whatever sits under the header: tiles, rows. */
  children?: ReactNode;
}

/** A person: avatar, name and a count, with their photo's dominant colour washed across the header. */
export function PersonCard({ name, imageUrl, caption, onOpen, children }: Props) {
  const art = useImage(imageUrl ?? null);
  const color = useDominantColor(art);
  const wash = color
    ? { background: `linear-gradient(100deg, rgba(${color}, 0.32), rgba(${color}, 0) 75%)` }
    : undefined;
  return (
    <div className={styles.card}>
      <button type="button" className={styles.head} style={wash} onClick={onOpen} title={`Open ${name}'s profile`}>
        <UserAvatar name={name} imageUrl={imageUrl} className={styles.avatar} />
        <span className={styles.who}>
          <span className={styles.name}>{name}</span>
          {caption && <span className={styles.caption}>{caption}</span>}
        </span>
      </button>
      {children}
    </div>
  );
}
