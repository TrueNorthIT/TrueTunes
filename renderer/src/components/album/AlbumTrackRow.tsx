import { useNavigate } from 'react-router-dom';
import { EqBars } from '../common/EqBars';
import { TrackRow } from '../common/TrackRow';
import { useTrackContextMenu } from '../common/ContextMenu';
import { fmtDuration, trackPayload, artistItem } from '../../lib/itemHelpers';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/AlbumPanel.module.css';

interface Props {
  track: AlbumTrack;
  isPlaylistOrProgram: boolean;
  isSelected: boolean;
  serviceId: string;
  accountId: string;
  /** The album's artist. Track artists are only shown when they differ from it (guests, features). */
  albumArtist?: string;
  /** This is the track playing now. */
  playing?: boolean;
  /** Audio is really playing, so the bars move; otherwise they sit still. */
  audioPlaying?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onAdd: () => void;
}

const norm = (s: string) => s.trim().toLowerCase();

export function AlbumTrackRow({
  track,
  isPlaylistOrProgram,
  isSelected,
  serviceId,
  accountId,
  albumArtist,
  playing,
  audioPlaying = false,
  onClick,
  onDragStart,
  onAdd,
}: Props) {
  const navigate = useNavigate();
  const { showTrackMenu } = useTrackContextMenu();

  const payload = trackPayload({
    uri: track.id.objectId ?? '',
    trackName: track.title,
    artist: track.artists.join(', '),
    albumName: track.albumName,
    imageUrl: track.artUrl,
    serviceId: track.id.serviceId ?? serviceId,
    accountId: track.id.accountId ?? accountId,
  });

  // Album: the artist is the page's artist, so only say so when someone else is on the track.
  const albumArtists = albumArtist ? albumArtist.split(/,\s*/).map(norm) : null;
  const hasGuest = !albumArtists || track.artists.some((a) => !albumArtists.includes(norm(a)));
  const albumArtistsText = track.artists.length && hasGuest ? track.artists.join(', ') : undefined;

  // Playlist or programme: every track has its own artist and album, so those are links.
  const playlistArtists = track.artistObjects?.length
    ? track.artistObjects.map((a, ai) => {
        const artist = artistItem(a.name, { objectId: a.objectId, serviceId, accountId });
        return (
          <span key={ai}>
            {ai > 0 && ', '}
            <button
              type="button"
              className={styles.link}
              aria-label={`${a.name}, open artist`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void navigate(`/artist/${encodeURIComponent(a.objectId)}`, { state: { item: artist } });
              }}
            >
              {a.name}
            </button>
          </span>
        );
      })
    : track.artists.join(', ') || undefined;

  const albumId = track.albumId;
  const albumName = track.albumName;
  const playlistAlbum =
    albumId && albumName ? (
      <button
        type="button"
        className={styles.link}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void navigate(`/album/${encodeURIComponent(albumId)}`, {
            state: {
              item: {
                type: 'ALBUM',
                name: albumName,
                resource: { type: 'ALBUM', id: { objectId: albumId, serviceId, accountId } },
              } as SonosItem,
            },
          });
        }}
      >
        {albumName}
      </button>
    ) : (
      (albumName ?? undefined)
    );

  return (
    <TrackRow
      title={track.title}
      lead={playing ? <EqBars paused={!audioPlaying} /> : track.ordinal}
      showArt={isPlaylistOrProgram}
      imageUrl={track.artUrl}
      explicit={track.explicit}
      artists={isPlaylistOrProgram ? playlistArtists : albumArtistsText}
      aside={isPlaylistOrProgram ? playlistAlbum : undefined}
      trailing={fmtDuration(track.durationSeconds)}
      selected={isSelected}
      playing={playing}
      onClick={onClick}
      onDragStart={onDragStart}
      onContextMenu={(e) => showTrackMenu({ track: payload, sonosItem: track.raw }, e)}
      onAdd={onAdd}
    />
  );
}
