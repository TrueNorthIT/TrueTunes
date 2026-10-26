import type { ReactNode } from 'react';
import { UserAvatar } from '../common/UserAvatar';
import { itemSubLine } from './format';
import styles from '../../styles/Queuedle.module.css';

/** Card art for a winner: a circle for artists, a rounded square otherwise. */
export function BonusItemArt({ item }: { item: GameItem }) {
  const cls = `${styles.bonusArt}${item.category === 'artist' ? ' ' + styles.round : ''}`;
  return item.imageUrl ? <img className={cls} src={item.imageUrl} alt="" loading="lazy" /> : <span className={cls} />;
}

/**
 * One winner in the bonus grid: its art, name and sub-line, then the colleagues (children).
 * The card sizes itself from its grid cell: short cells put the art beside the name, tall ones above it.
 */
export function BonusCard({ item, children }: { item: GameItem; children: ReactNode }) {
  return (
    <li className={styles.bonusCard}>
      <div className={styles.bonusCardBody}>
        <span className={styles.bonusArtBox}>
          <BonusItemArt item={item} />
        </span>
        <span className={styles.bonusInfo}>
          <span className={styles.bonusName} title={item.name}>
            {item.name}
          </span>
          <span className={styles.bonusSub}>{itemSubLine(item)}</span>
        </span>
        {children}
      </div>
    </li>
  );
}

/** A colleague as a face and a name; long names truncate, the full name stays in the title and the text. */
export function Candidate({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return (
    <>
      <UserAvatar name={name} imageUrl={imageUrl} className={styles.candidateAvatar} />
      <span className={styles.candidateName}>{name}</span>
    </>
  );
}
