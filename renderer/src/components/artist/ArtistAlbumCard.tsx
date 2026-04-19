import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
}

export function ArtistAlbumCard({ album, onOpen }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const art = useImage(rawUrl);
  const raw = album as Record<string, unknown>;
  const subtitle = raw['subtitle'] as string | undefined;
  const explicit = !!raw['isExplicit'];
  return (
    <div className={styles.albumCard} onClick={() => onOpen(album)}>
      <div className={styles.albumArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.albumArtPh}>♪</div>}
      </div>
      <div className={styles.albumTitle}>
        <span className={styles.albumTitleText}>{album.title}</span>
        {explicit && <ExplicitBadge />}
      </div>
      {subtitle && <div className={styles.albumSub}>{subtitle}</div>}
    </div>
  );
}
