import { useImage } from '../../hooks/useImage';
import { withoutPageArtist } from '../../lib/artistSubtitle';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
  artistName?: string;
  year?: number;
  /** Omitted while loading. */
  songCount?: number;
}

export function LatestReleaseCard({ album, onOpen, artistName, year, songCount }: Props) {
  const rawUrl = (album.images as Record<string, string> | undefined)?.['tile1x1'] ?? null;
  const art = useImage(rawUrl);
  const fullSubtitle = (album as Record<string, unknown>)['subtitle'] as string | undefined;
  const songs = songCount ? `${songCount} ${songCount === 1 ? 'song' : 'songs'}` : undefined;
  const meta = [year, songs, withoutPageArtist(fullSubtitle, artistName)].filter(Boolean).join(' · ');
  return (
    <div className={styles.latestRelease}>
      <div className={styles.sectionTitle}>Latest Release</div>
      <div
        className={styles.latestCard}
        role="button"
        tabIndex={0}
        aria-label={`Open ${album.title}`}
        onClick={() => onOpen(album)}
        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(album); } }}
      >
        <div className={styles.latestArt}>
          {art ? <img src={art} alt="" /> : <div className={styles.latestArtPh}>♪</div>}
        </div>
        <div className={styles.latestTitle} title={album.title}>{album.title}</div>
        {meta && <div className={styles.latestSub} title={fullSubtitle}>{meta}</div>}
      </div>
    </div>
  );
}
