import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { useTrackContextMenu } from '../common/ContextMenu';
import { fmtDuration } from '../../lib/itemHelpers';
import styles from './ArtistHero.module.css';

export type HeroTrack = {
  title: string;
  durationSeconds: number;
  artUrl: string | null;
  explicit: boolean;
  raw: import('../../types/sonos').SonosItem;
  id?: { objectId?: string };
};

interface Props {
  track: HeroTrack;
  index: number;
  isSelected: boolean;
  onClick: (index: number, e: React.MouseEvent) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onAdd: () => void;
}

export function HeroTrackRow({ track, index, isSelected, onClick, onDragStart, onAdd }: Props) {
  const art = useImage(track.artUrl);
  const { showTrackMenu } = useTrackContextMenu();

  const rid = track.raw.resource?.id;
  const trackPayload: PlaylistTrack = {
    uri: track.id?.objectId ?? rid?.objectId ?? '',
    trackName: track.title,
    artist: typeof track.raw.artist === 'string' ? track.raw.artist : (track.raw.artist?.name ?? ''),
    imageUrl: track.artUrl,
    serviceId: rid?.serviceId ?? '',
    accountId: rid?.accountId ?? '',
    addedBy: '',
    addedAt: 0,
  };

  return (
    <div
      className={`${styles.heroTrackRow}${isSelected ? ' ' + styles.heroTrackSelected : ''}`}
      draggable
      onClick={e => onClick(index, e)}
      onContextMenu={e => showTrackMenu({ track: trackPayload }, e)}
      onDragStart={e => onDragStart(index, e)}
    >
      <div className={styles.heroTrackArt}>
        {art ? <img src={art} alt="" /> : <div className={styles.heroTrackArtPh} />}
      </div>
      <div className={styles.heroTrackInfo}>
        <span className={styles.heroTrackName}>
          {track.title}
          {track.explicit && <span className={styles.heroTrackExplicit}><ExplicitBadge /></span>}
        </span>
      </div>
      <span className={styles.heroTrackDur}>{fmtDuration(track.durationSeconds)}</span>
      <button className={styles.heroTrackAdd} onClick={e => { e.stopPropagation(); onAdd(); }}>+</button>
    </div>
  );
}
