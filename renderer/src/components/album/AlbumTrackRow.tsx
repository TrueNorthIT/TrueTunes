import { useNavigate } from 'react-router-dom';
import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { fmtDuration } from '../../lib/itemHelpers';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/AlbumPanel.module.css';

function TrackArt({ url }: { url: string | null }) {
  const src = useImage(url);
  return src ? <img className={styles.trackArt} src={src} alt="" /> : <div className={styles.trackArtPh} />;
}

interface Props {
  track: AlbumTrack;
  isPlaylistOrProgram: boolean;
  isSelected: boolean;
  serviceId: string;
  accountId: string;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onAdd: () => void;
}

export function AlbumTrackRow({
  track, isPlaylistOrProgram, isSelected, serviceId, accountId,
  onClick, onDragStart, onAdd,
}: Props) {
  const navigate = useNavigate();

  return (
    <div
      className={[styles.trackRow, isSelected ? styles.selected : ''].filter(Boolean).join(' ')}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
    >
      <span className={styles.ordinal}>{track.ordinal}</span>
      {isPlaylistOrProgram && (
        <div className={styles.trackArtWrap}>
          <TrackArt url={track.artUrl} />
        </div>
      )}
      <div className={styles.trackName}>
        {track.title}
        {track.explicit && <ExplicitBadge />}
      </div>
      <div className={styles.trackArtist}>
        {isPlaylistOrProgram && track.artistObjects?.length
          ? track.artistObjects.map((a, ai) => {
              const artistItem: SonosItem = {
                type: 'ARTIST',
                name: a.name,
                resource: {
                  type: 'ARTIST',
                  id: { objectId: a.objectId, serviceId, accountId },
                },
              };
              return (
                <span key={ai}>
                  {ai > 0 && ', '}
                  <button
                    className={styles.artistBtn}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/artist/${encodeURIComponent(a.objectId)}`, { state: { item: artistItem } });
                    }}
                  >
                    {a.name}
                  </button>
                </span>
              );
            })
          : track.artists.join(', ')}
      </div>
      {isPlaylistOrProgram && (() => {
        const albumId = track.albumId;
        const albumName = track.albumName;
        return (
          <div className={styles.trackAlbum}>
            {albumId && albumName
              ? (
                <button
                  className={styles.artistBtn}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/album/${encodeURIComponent(albumId)}`, {
                      state: {
                        item: {
                          type: 'ALBUM',
                          name: albumName,
                          resource: {
                            type: 'ALBUM',
                            id: { objectId: albumId, serviceId, accountId },
                          },
                        } as SonosItem,
                      },
                    });
                  }}
                >
                  {albumName}
                </button>
              )
              : (albumName ?? '')}
          </div>
        );
      })()}
      <span className={styles.duration}>{fmtDuration(track.durationSeconds)}</span>
      <button className={styles.addBtn} onClick={e => { e.stopPropagation(); onAdd(); }}>+</button>
    </div>
  );
}
