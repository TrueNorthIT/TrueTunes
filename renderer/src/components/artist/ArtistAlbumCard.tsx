import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { TrackHitLine } from './TrackHitLine';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
  onAdd: (item: SonosItem) => void;
  year?: number;
  trackHits?: string[];
  /** A search is active: reserve the track-hit line so card heights stay equal. */
  searching?: boolean;
}

export function ArtistAlbumCard({ album, onOpen, onAdd, year, trackHits, searching }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const art = useImage(rawUrl);
  const raw = album as Record<string, unknown>;
  const subtitle = [year, raw['subtitle'] as string | undefined].filter(Boolean).join(' · ');
  const explicit = !!raw['isExplicit'];
  return (
    <div className={styles.albumCard} onClick={() => onOpen(album)}>
      <div className={styles.albumArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.albumArtPh}>♪</div>}
        <div className={styles.albumOverlay}>
          <button className={styles.albumAddBtn} onClick={e => { e.stopPropagation(); onAdd(album); }}>+</button>
        </div>
      </div>
      <div className={styles.albumTitle}>
        <span className={styles.albumTitleText} title={album.title}>{album.title}</span>
        {explicit && <ExplicitBadge />}
      </div>
      {subtitle && <div className={styles.albumSub} title={subtitle}>{subtitle}</div>}
      <TrackHitLine hits={trackHits} searching={searching} />
    </div>
  );
}
