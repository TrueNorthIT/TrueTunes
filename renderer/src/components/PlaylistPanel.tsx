import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaylist } from '../hooks/usePlaylists';
import { useImage } from '../hooks/useImage';
import { useTrackContextMenu } from './common/ContextMenu';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/PlaylistPanel.module.css';

interface Props {
  displayName: string | null | undefined;
  onAddToQueue: (item: SonosItem, position?: number) => void;
}

function getPlaylistColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue},45%,30%), hsl(${(hue + 50) % 360},50%,22%))`;
}

function trackToSonosItem(t: PlaylistTrack): SonosItem {
  return {
    type: 'TRACK',
    title: t.trackName,
    artist: t.artist,
    imageUrl: t.imageUrl ?? undefined,
    id: { objectId: t.uri, serviceId: t.serviceId, accountId: t.accountId },
  };
}

function TrackRow({
  track,
  index,
  isOwner,
  onAdd,
  onRemove,
  onContextMenu,
  onDragStart,
}: {
  track: PlaylistTrack;
  index: number;
  isOwner: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const art = useImage(track.imageUrl ?? null);
  const navigate = useNavigate();

  return (
    <div
      className={styles.trackRow}
      draggable
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      <span className={styles.ordinal}>{index + 1}</span>
      <div className={styles.trackArtWrap}>
        {art
          ? <img className={styles.trackArt} src={art} alt="" />
          : <div className={styles.trackArtPh} />
        }
      </div>
      <div className={styles.trackMain}>
        <div className={styles.trackName}>{track.trackName}</div>
        <div className={styles.trackArtist}>{track.artist}</div>
      </div>
      <div className={styles.trackAddedBy}>
        {track.addedBy && (
          <button
            className={styles.addedByLink}
            onClick={e => { e.stopPropagation(); navigate(`/profile/${encodeURIComponent(track.addedBy)}`); }}
          >
            {track.addedBy}
          </button>
        )}
      </div>
      <div className={styles.trackControls}>
        <button className={styles.addBtn} onClick={e => { e.stopPropagation(); onAdd(); }} title="Add to queue">+</button>
        {isOwner && (
          <button className={styles.removeBtn} onClick={e => { e.stopPropagation(); onRemove(); }} title="Remove">×</button>
        )}
      </div>
    </div>
  );
}

export function PlaylistPanel({ displayName, onAddToQueue }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showTrackMenu } = useTrackContextMenu();
  const { data: playlist, isLoading } = usePlaylist(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const coverArtSrc = useImage(playlist?.imageUrl ?? null);

  if (!id) return null;

  const isOwner = playlist?.owner === displayName;
  const isMember = playlist?.members.includes(displayName ?? '') ?? false;

  async function handlePlayAll() {
    if (!playlist?.tracks.length) return;
    for (const t of playlist.tracks) {
      onAddToQueue(trackToSonosItem(t), -1);
    }
  }

  async function handleJoin() {
    if (!id) return;
    await window.sonos.joinPlaylist(id, isMember ? 'leave' : 'join');
    queryClient.invalidateQueries({ queryKey: ['playlist', id] });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return; }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await window.sonos.uploadPlaylistImage(id, buffer, file.type);
      if (result && 'imageUrl' in result) {
        queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveTrack(index: number) {
    if (!playlist || !id) return;
    const updated: PlaylistDoc = {
      ...playlist,
      tracks: playlist.tracks.filter((_, i) => i !== index),
    };
    queryClient.setQueryData(['playlist', id], updated);
  }

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div
            className={`${styles.coverArt}${isOwner ? ' ' + styles.coverArtOwner : ''}`}
            style={!coverArtSrc ? { background: playlist ? getPlaylistColor(playlist.name) : 'var(--bg-1)' } : undefined}
            onClick={() => isOwner && fileInputRef.current?.click()}
            title={isOwner ? 'Change image' : undefined}
          >
            {coverArtSrc
              ? <img src={coverArtSrc} alt="" className={styles.coverArtImg} />
              : (!isLoading && playlist ? playlist.name[0].toUpperCase() : '')
            }
            {isOwner && (
              <div className={`${styles.coverArtOverlay}${uploading ? ' ' + styles.coverArtUploading : ''}`}>
                {uploading ? '…' : '📷'}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <div className={styles.headerInfo}>
            <span className={styles.playlistLabel}>Playlist</span>
            {isLoading ? (
              <div className={styles.skelBlock} style={{ height: 40, width: 240, marginBottom: 4 }} />
            ) : playlist ? (
              <>
                <h1 className={styles.playlistName}>{playlist.name}</h1>
                <div className={styles.metaRow}>
                  <button
                    className={styles.ownerLink}
                    onClick={() => navigate(`/profile/${encodeURIComponent(playlist.owner)}`)}
                  >
                    {playlist.owner}
                  </button>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.badge}>{playlist.isPublic ? '🌐 Public' : '🔒 Private'}</span>
                  {playlist.isPublic && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.badge}>{playlist.members.length} member{playlist.members.length !== 1 ? 's' : ''}</span>
                    </>
                  )}
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.badge}>{playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}</span>
                </div>
                <div className={styles.headerActions}>
                  {playlist.tracks.length > 0 && (
                    <button className={styles.playAllBtn} onClick={handlePlayAll}>▶ Play all</button>
                  )}
                  {playlist.isPublic && !isOwner && (
                    <button
                      className={`${styles.joinBtn}${isMember ? ' ' + styles.joined : ''}`}
                      onClick={handleJoin}
                    >
                      {isMember ? 'Leave' : 'Join'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Playlist not found</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Track table ── */}
      <div className={styles.tracks}>
        {isLoading ? (
          <>
            <div className={styles.tableHeader}>
              <span>#</span><span /><span>Title</span><span>Added by</span><span />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.trackRow} style={{ opacity: 1 - i * 0.12 }}>
                <div className={styles.skelBlock} style={{ height: 12 }} />
                <div className={styles.skelBlock} style={{ height: 40, width: 40, borderRadius: 4 }} />
                <div className={styles.skelBlock} style={{ height: 12, animationDelay: `${i * 60}ms` }} />
                <div className={styles.skelBlock} style={{ height: 12, animationDelay: `${i * 60 + 30}ms` }} />
                <div />
              </div>
            ))}
          </>
        ) : playlist && playlist.tracks.length === 0 ? (
          <p className={styles.emptyMsg}>No tracks yet — right-click any track and choose "Add to playlist"</p>
        ) : playlist ? (
          <>
            <div className={styles.tableHeader}>
              <span style={{ textAlign: 'right' }}>#</span>
              <span />
              <span>Title</span>
              <span>Added by</span>
              <span />
            </div>
            {playlist.tracks.map((t, i) => {
              const sonosItem = trackToSonosItem(t);
              return (
                <TrackRow
                  key={i}
                  track={t}
                  index={i}
                  isOwner={isOwner}
                  onAdd={() => onAddToQueue(sonosItem, -1)}
                  onRemove={() => handleRemoveTrack(i)}
                  onContextMenu={e => showTrackMenu({ track: t, sonosItem }, e)}
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify([sonosItem]));
                  }}
                />
              );
            })}
          </>
        ) : null}
      </div>

      {/* ── Members section ── */}
      {playlist?.isPublic && isOwner && playlist.members.length > 1 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Members</h2>
          <div className={styles.memberList}>
            {playlist.members.map((m) => (
              <button
                key={m}
                className={styles.memberChip}
                onClick={() => navigate(`/profile/${encodeURIComponent(m)}`)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
