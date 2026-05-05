import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { fmtDuration } from '../../lib/itemHelpers';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  track: AlbumTrack;
  index: number;
  isSelected: boolean;
  onAdd: (item: SonosItem) => void;
  onClick: (index: number, e: React.MouseEvent) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
}

export function TopSongRow({ track, index, isSelected, onAdd, onClick, onDragStart }: Props) {
  const art = useImage(track.artUrl);
  const subtitle = (track.raw as Record<string, unknown>)?.['subtitle'] as string | undefined;
  return (
    <div
      className={`${styles.topSongRow}${isSelected ? ' ' + styles.topSongSelected : ''}`}
      draggable
      onClick={e => onClick(index, e)}
      onDragStart={e => onDragStart(index, e)}
    >
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
      <button className={styles.addBtn} onClick={e => { e.stopPropagation(); onAdd(track.raw); }}>+</button>
    </div>
  );
}
