import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { fmtDuration } from '../../lib/itemHelpers';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  track: AlbumTrack;
  index: number;
  onAdd: (item: SonosItem) => void;
}

export function TopSongRow({ track, index, onAdd }: Props) {
  const art = useImage(track.artUrl);
  const subtitle = (track.raw as Record<string, unknown>)?.['subtitle'] as string | undefined;
  return (
    <div className={styles.topSongRow}>
      <span className={styles.topSongNum}>{index + 1}</span>
      <div className={styles.topSongArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.topSongArtPh} />}
      </div>
      <div className={styles.topSongInfo}>
        <span className={styles.topSongName}>
          {track.title}
          {track.explicit && <ExplicitBadge />}
        </span>
        {subtitle && <span className={styles.topSongSub}>{subtitle}</span>}
      </div>
      <span className={styles.topSongDur}>{fmtDuration(track.durationSeconds)}</span>
      <button className={styles.addBtn} onClick={() => onAdd(track.raw)}>+</button>
    </div>
  );
}
