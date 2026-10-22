import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { TrackHitLine } from './TrackHitLine';
import { cardSubtitle } from '../../lib/artistSubtitle';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
  onAdd: (item: SonosItem) => void;
  year?: number;
  /** The page's artist, dropped from the subtitle. */
  artistName?: string;
  trackHits?: string[];
  /** A search is active: reserve the track-hit line so card heights stay equal. */
  searching?: boolean;
}

export function ArtistAlbumCard({ album, onOpen, onAdd, year, artistName, trackHits, searching }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const art = useImage(rawUrl);
  const raw = album as Record<string, unknown>;
  const fullSubtitle = raw['subtitle'] as string | undefined;
  const subtitle = cardSubtitle(year, fullSubtitle, artistName);
  const explicit = !!raw['isExplicit'];
  return (
    <div
      className={styles.albumCard}
      role="button"
      tabIndex={0}
      aria-label={`Open ${album.title}`}
      onClick={() => onOpen(album)}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(album); } }}
    >
      <div className={styles.albumArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.albumArtPh}>♪</div>}
        <div className={styles.albumOverlay}>
          <button
            className={styles.albumAddBtn}
            aria-label={`Add ${album.title} to queue`}
            onClick={e => { e.stopPropagation(); onAdd(album); }}
          >+</button>
        </div>
      </div>
      <div className={styles.albumTitle}>
        <span className={styles.albumTitleText} title={album.title}>{album.title}</span>
        {explicit && <ExplicitBadge />}
      </div>
      {subtitle && <div className={styles.albumSub} title={fullSubtitle}>{subtitle}</div>}
      <TrackHitLine hits={trackHits} searching={searching} />
    </div>
  );
}
