import { useNavigate } from 'react-router-dom';
import { useImage } from '../../hooks/useImage';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useQueueTrack } from '../../hooks/useQueueTrack';
import { getActiveProvider } from '../../providers';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { useTrackContextMenu } from '../common/ContextMenu';
import type { NormalizedQueueItem } from '../../types/provider';
import styles from '../../styles/QueueSidebar.module.css';

interface Props {
  item: NormalizedQueueItem;
  index: number;
  currentObjectId: string | null;
  currentQueueItemId: string | null;
  attribution?: AttributionEntry;
  isSelected: boolean;
  timeToPlay?: number;
  onRowClick: (index: number, e: React.MouseEvent) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function fmtClockTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

export function DraggableQueueRow({
  item, index, currentObjectId, currentQueueItemId, attribution,
  isSelected, timeToPlay, onRowClick, onDragStart, onDragOver, onDrop, onDragEnd,
}: Props) {
  const { artUrl, artist, albumName, albumItem, prefetchAlbum, artistItem, prefetchArtist, isPlaying: isPlayingByObjectId, explicit } =
    useQueueTrack(item, currentObjectId);
  const isPlaying = currentQueueItemId !== null
    ? Number(currentQueueItemId) === index + 1
    : isPlayingByObjectId;
  const cachedArt = useImage(artUrl);
  const openItem  = useOpenItem();
  const navigate  = useNavigate();
  const { showTrackMenu } = useTrackContextMenu();
  const name = item.track.title;

  const trackPayload: PlaylistTrack = {
    uri: item.track.id,
    trackName: item.track.title,
    artist: item.track.artist,
    albumName: item.track.albumName ?? undefined,
    imageUrl: item.track.imageUrl,
    serviceId: item.track.serviceId ?? '',
    accountId: item.track.accountId ?? '',
    addedBy: '',
    addedAt: 0,
  };

  return (
    <div
      className={[
        styles.row,
        isPlaying  ? styles.playing  : '',
        isSelected ? styles.selected : '',
      ].filter(Boolean).join(' ')}
      data-playing={isPlaying ? 'true' : undefined}
      draggable
      onPointerMove={e => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      onClick={e => onRowClick(index, e)}
      onDoubleClick={() => getActiveProvider().skipToTrack(index + 1)}
      onContextMenu={e => showTrackMenu({ track: trackPayload }, e)}
      onDragStart={e => onDragStart(index, e)}
      onDragOver={e => onDragOver(index, e)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.dragHandle}>⠿</div>
      <div className={styles.artWrap}>
        {cachedArt
          ? <img className={styles.art} src={cachedArt} alt="" />
          : <div className={styles.artPh}>♪</div>}
        {isPlaying && (
          <div className={styles.overlay}>
            <div className={styles.eq}><span /><span /><span /></div>
          </div>
        )}
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{name}{explicit && <ExplicitBadge />}</div>
        {artist && (
          artistItem
            ? <button
                className={styles.subAlbum}
                onClick={e => { e.stopPropagation(); openItem(artistItem); }}
                onMouseEnter={prefetchArtist}
              >{artist}</button>
            : <div className={styles.sub}>{artist}</div>
        )}
        {albumName && (
          <button
            className={styles.subAlbum}
            onClick={e => { e.stopPropagation(); if (albumItem) openItem(albumItem); }}
            onMouseEnter={prefetchAlbum}
          >
            {albumName}
          </button>
        )}
        {attribution && (
          <div className={styles.attribution}>
            by{' '}
            <button
              className={styles.attributionUser}
              onClick={e => { e.stopPropagation(); navigate(`/profile/${encodeURIComponent(attribution.user)}`); }}
            >
              {attribution.user}
            </button>
          </div>
        )}
      </div>
      {timeToPlay !== undefined && (
        <div className={styles.timeToPlay}>{fmtClockTime(timeToPlay)}</div>
      )}
    </div>
  );
}
