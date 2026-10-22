import { useNavigate } from 'react-router-dom';
import { useImage } from '../../hooks/useImage';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useQueueTrack } from '../../hooks/useQueueTrack';
import { getActiveProvider } from '../../providers';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { useTrackContextMenu } from '../common/ContextMenu';
import { UserAvatar } from '../common/UserAvatar';
import type { NormalizedQueueItem } from '../../types/provider';
import styles from '../../styles/QueueSidebar.module.css';

interface Props {
  item: NormalizedQueueItem;
  index: number;
  currentObjectId: string | null;
  currentQueueItemId: string | null;
  attribution?: AttributionEntry;
  /** The queuer's photo, if they have one; otherwise their initial. */
  attributionImageUrl?: string | null;
  isSelected: boolean;
  /** Already played: shown dimmed. */
  played?: boolean;
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
  item, index, currentObjectId, currentQueueItemId, attribution, attributionImageUrl,
  isSelected, played, timeToPlay, onRowClick, onDragStart, onDragOver, onDrop, onDragEnd,
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

  const art = cachedArt
    ? <img className={styles.art} src={cachedArt} alt="" />
    : <div className={styles.artPh}>♪</div>;

  return (
    <div
      className={[
        styles.row,
        isPlaying  ? styles.playing  : '',
        isSelected ? styles.selected : '',
        played && !isPlaying ? styles.played : '',
      ].filter(Boolean).join(' ')}
      data-playing={isPlaying ? 'true' : undefined}
      draggable
      onClick={e => onRowClick(index, e)}
      onDoubleClick={() => getActiveProvider().skipToTrack(index + 1)}
      onContextMenu={e => showTrackMenu({ track: trackPayload }, e)}
      onDragStart={e => onDragStart(index, e)}
      onDragOver={e => onDragOver(index, e)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.dragHandle} aria-hidden="true">⠿</div>
      <div className={styles.artWrap}>
        {albumItem ? (
          <button
            type="button"
            className={styles.artBtn}
            aria-label={`Open album ${albumName ?? name}`}
            onClick={e => { e.stopPropagation(); openItem(albumItem); }}
            onMouseEnter={prefetchAlbum}
          >
            {art}
          </button>
        ) : art}
        {isPlaying && (
          <div className={styles.overlay}>
            <div className={styles.eq}><span /><span /><span /></div>
          </div>
        )}
      </div>
      {/* The album is dropped from the row (it is the art's link and the tooltip) to keep two calm lines. */}
      <div className={styles.text} title={[albumName ? `${name} · ${albumName}` : '', timeToPlay !== undefined ? `Plays at ${fmtClockTime(timeToPlay)}` : ''].filter(Boolean).join(' — ') || undefined}>
        <div className={styles.name}>{name}{explicit && <ExplicitBadge />}</div>
        <div className={styles.subLine}>
          {artist && (
            artistItem
              ? <button
                  type="button"
                  className={styles.subLink}
                  onClick={e => { e.stopPropagation(); openItem(artistItem); }}
                  onMouseEnter={prefetchArtist}
                >{artist}</button>
              : <span className={styles.sub}>{artist}</span>
          )}
          {timeToPlay !== undefined && (
            <span className={styles.timeToPlay}>{fmtClockTime(timeToPlay)}</span>
          )}
        </div>
      </div>
      {attribution && (
        <button
          type="button"
          className={styles.queuer}
          aria-label={`Queued by ${attribution.user}`}
          title={`Queued by ${attribution.user}`}
          onClick={e => { e.stopPropagation(); navigate(`/profile/${encodeURIComponent(attribution.user)}`); }}
        >
          <UserAvatar name={attribution.user} imageUrl={attributionImageUrl} className={styles.queuerAvatar} />
        </button>
      )}
    </div>
  );
}
