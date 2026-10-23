import { useTrackContextMenu } from '../common/ContextMenu';
import { ChartRow } from '../common/ChartRow';
import { ArtistLinks } from '../common/TrackLinks';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { fmtDuration, trackPayload } from '../../lib/itemHelpers';
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
  /** Opens the track's album. */
  onOpenAlbum: (track: AlbumTrack) => void;
  /** Opens a collaborator's page. */
  onOpenArtist: (name: string) => void;
  /** The page's artist, left out of the artist cell: it is redundant here. */
  artistName?: string;
}

/** One ranked Top Songs row: the shared ChartRow, plus the page's selection, drag and now-playing. */
export function TopSongRow({
  track, index, isSelected, isCurrentTrack, isPlaybackActive, onAdd, onClick, onDragStart, onOpenAlbum, onOpenArtist, artistName,
}: Props) {
  const { showTrackMenu } = useTrackContextMenu();
  const page = artistName?.trim().toLowerCase();
  const others = track.artists.filter(a => a.trim().toLowerCase() !== page);

  const payload = trackPayload({
    uri: track.id.objectId ?? '',
    trackName: track.title,
    artist: track.artists.join(', '),
    albumName: track.albumName,
    imageUrl: track.artUrl,
    serviceId: track.id.serviceId,
    accountId: track.id.accountId,
  });

  const artists = (
    <>
      {others.length > 0
        ? <ArtistLinks artist={others.join(', ')} onOpenArtist={name => onOpenArtist(name)} />
        : track.albumName && <span title={track.albumName}>{track.albumName}</span>}
      {track.explicit && <ExplicitBadge />}
    </>
  );

  return (
    <ChartRow
      rank={index + 1}
      rankSlot={isCurrentTrack ? (
        <span className={`${styles.waveform}${!isPlaybackActive ? ' ' + styles.waveformPaused : ''}`} role="img" aria-label="Now playing">
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
          <span className={styles.waveformBar} />
        </span>
      ) : undefined}
      title={track.title}
      artists={artists}
      imageUrl={track.artUrl}
      meta={fmtDuration(track.durationSeconds)}
      selected={isSelected}
      playing={isCurrentTrack}
      onOpen={() => onOpenAlbum(track)}
      onClick={e => onClick(index, e)}
      onDragStart={e => onDragStart(index, e)}
      onAdd={() => onAdd(track.raw)}
      addLabel={`Add ${track.title} to queue`}
      onContextMenu={e => showTrackMenu({ track: payload, sonosItem: track.raw }, e)}
    />
  );
}
