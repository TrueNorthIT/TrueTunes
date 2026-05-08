import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { useTrackContextMenu } from '../common/ContextMenu';
import { fmtDuration } from '../../lib/itemHelpers';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

interface Props {
  track: AlbumTrack;
  index: number;
  isSelected: boolean;
  isCurrentTrack?: boolean;
  isPlaybackActive?: boolean;
  onAdd: (item: SonosItem) => void;
  onClick: (index: number, e: React.MouseEvent) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
}

export function TopSongRow({ track, index, isSelected, isCurrentTrack, isPlaybackActive, onAdd, onClick, onDragStart }: Props) {
  const art = useImage(track.artUrl);
  const { showTrackMenu } = useTrackContextMenu();
  const subtitle = (track.raw as Record<string, unknown>)?.['subtitle'] as string | undefined;

  const trackPayload: PlaylistTrack = {
    uri: track.id.objectId ?? '',
    trackName: track.title,
    artist: track.artists.join(', '),
    albumName: track.albumName ?? undefined,
    imageUrl: track.artUrl,
    serviceId: track.id.serviceId ?? '',
    accountId: track.id.accountId ?? '',
    addedBy: '',
    addedAt: 0,
  };

  return (
    <div
      className={`${styles.topSongRow}${isSelected ? ' ' + styles.topSongSelected : ''}`}
      draggable
      onClick={e => onClick(index, e)}
      onContextMenu={e => showTrackMenu({ track: trackPayload }, e)}
      onDragStart={e => onDragStart(index, e)}
    >
      {isCurrentTrack ? (
        <div className={`${styles.waveform}${!isPlaybackActive ? ' ' + styles.waveformPaused : ''}`}>
          <div className={styles.waveformBar} />
          <div className={styles.waveformBar} />
          <div className={styles.waveformBar} />
        </div>
      ) : (
        <span className={styles.topSongNum}>{index + 1}</span>
      )}
      <div className={styles.topSongArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.topSongArtPh} />}
      </div>
      <div className={styles.topSongInfo}>
        <span className={`${styles.topSongName}${isCurrentTrack ? ' ' + styles.topSongNameActive : ''}`}>
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
