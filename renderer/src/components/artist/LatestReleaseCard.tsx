import { useImage } from '../../hooks/useImage';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
}

export function LatestReleaseCard({ album, onOpen }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const art = useImage(rawUrl);
  const subtitle = (album as Record<string, unknown>)['subtitle'] as string | undefined;
  return (
    <div className={styles.latestRelease}>
      <div className={styles.sectionTitle}>Latest Release</div>
      <div className={styles.latestCard} onClick={() => onOpen(album)}>
        <div className={styles.latestArt}>
          {art ? <img src={art} alt="" /> : <div className={styles.latestArtPh}>♪</div>}
        </div>
        <div className={styles.latestMeta}>
          <div className={styles.latestTitle}>{album.title}</div>
          {subtitle && <div className={styles.latestSub}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
