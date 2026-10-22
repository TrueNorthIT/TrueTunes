import { Radio, Shuffle } from 'lucide-react';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  item: SonosItem;
  artUrl: string | null;
  onOpen: (item: SonosItem) => void;
}

/** Artist Shuffle / Artist Radio as a shelf card, same size as the album cards. */
export function RadioCard({ item, artUrl, onOpen }: Props) {
  const subtitle = (item as Record<string, unknown>)['subtitle'] as string | undefined;
  return (
    <div
      className={styles.albumCard}
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.title}`}
      onClick={() => onOpen(item)}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(item); } }}
    >
      <div className={`${styles.albumArt} ${styles.radioArt}`}>
        {artUrl && <img src={artUrl} alt="" className={styles.radioBg} />}
        <div className={styles.radioIcon}>
          {/shuffle/i.test(item.title ?? '') ? <Shuffle size={36} /> : <Radio size={36} />}
        </div>
      </div>
      <div className={styles.albumTitle}><span className={styles.albumTitleText} title={item.title}>{item.title}</span></div>
      {subtitle && <div className={styles.albumSub} title={subtitle}>{subtitle}</div>}
    </div>
  );
}
