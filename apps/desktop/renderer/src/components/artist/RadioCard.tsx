import { Radio } from 'lucide-react';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  item: SonosItem;
  artUrl: string | null;
  onOpen: (item: SonosItem) => void;
}

export function RadioCard({ item, artUrl, onOpen }: Props) {
  const subtitle = (item as Record<string, unknown>)['subtitle'] as string | undefined;
  return (
    <div className={styles.latestRelease}>
      <div className={styles.sectionTitle}>Artist Radio</div>
      <div className={styles.latestCard} onClick={() => onOpen(item)}>
        <div className={`${styles.latestArt} ${styles.latestArtRadio}`}>
          {artUrl && <img src={artUrl} alt="" className={styles.latestArtRadioBg} />}
          <div className={styles.latestArtRadioOverlay}>
            <Radio size={36} />
          </div>
        </div>
        <div className={styles.latestMeta}>
          <div className={styles.latestTitle}>{item.title}</div>
          {subtitle && <div className={styles.latestSub}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
