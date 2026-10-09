import { useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaylist } from '../hooks/usePlaylists';
import { useImage } from '../hooks/useImage';
import { useTrackDetails } from '../hooks/useTrackDetails';
import { useTrackContextMenu } from './common/ContextMenu';
import { useToast } from './common/Toast';
import { getPlaylistColor } from '../lib/playlistColor';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/PlaylistPanel.module.css';

interface Props {
  displayName: string | null | undefined;
  onAddToQueue: (item: SonosItem, position?: number) => void;
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
  canReorder,
  onAdd,
  onRemove,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  track: PlaylistTrack;
  index: number;
  isOwner: boolean;
  canReorder: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { data: details } = useTrackDetails(track.uri, track.serviceId, track.accountId);
  const art = useImage(details?.artUrl ?? track.imageUrl ?? null);
  const navigate = useNavigate();

  const trackName = details?.trackName ?? track.trackName;
  const artist = details?.artist ?? track.artist;

  return (
    <div
      className={styles.trackRow}
      draggable
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.ordinalCell}>
        {canReorder && <span className={styles.dragHandle}>⠿</span>}
        <span className={styles.ordinal}>{index + 1}</span>
      </div>
      <div className={styles.trackArtWrap}>
        {art
          ? <img className={styles.trackArt} src={art} alt="" />
          : <div className={styles.trackArtPh} />
        }
      </div>
      <div className={styles.trackMain}>
        <div className={styles.trackName}>{trackName}</div>
        <div className={styles.trackArtist}>{artist}</div>
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
  const { showToast } = useToast();
  const { data: playlist, isLoading } = usePlaylist(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const coverArtSrc = useImage(playlist?.imageUrl ?? null);
  const dragSrcIndex = useRef<number>(-1);
  const cancelRename = useRef(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    dragSrcIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/playlist-track-index', String(index));
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/playlist-track-index')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragSrcIndex.current) setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(async (index: number, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/playlist-track-index');
    setDragOverIndex(null);
    if (!raw || !playlist || !id) return;
    const from = parseInt(raw, 10);
    if (from === index) return;
    const snapshot = playlist;
    const newTracks = [...playlist.tracks];
    const [moved] = newTracks.splice(from, 1);
    newTracks.splice(index, 0, moved);
    queryClient.setQueryData(['playlist', id], { ...playlist, tracks: newTracks });
    try {
      await window.sonos.reorderPlaylistTracks(id, from, index);
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast('Failed to reorder tracks');
    }
  }, [playlist, id, queryClient, displayName]);

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    dragSrcIndex.current = -1;
  }, []);

  if (!id) return null;

  const isOwner = playlist?.owner === displayName;
  const isMember = playlist?.members.includes(displayName ?? '') ?? false;
  const canReorder = isOwner || isMember;

  async function handlePlayAll() {
    if (!playlist?.tracks.length) return;
    for (const t of playlist.tracks) {
      onAddToQueue(trackToSonosItem(t), -1);
    }
  }

  async function handleJoin() {
    if (!id || !displayName) return;
    try {
      await window.sonos.joinPlaylist(id, isMember ? 'leave' : 'join');
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', displayName] });
    } catch {
      showToast(isMember ? 'Failed to leave playlist' : 'Failed to join playlist');
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return; }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await window.sonos.uploadPlaylistImage(id, buffer, file.type, displayName ?? '');
      if (result && 'imageUrl' in result) {
        queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      } else if (result && 'error' in result) {
        showToast((result as { error: string }).error);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveTrack(uri: string, index: number) {
    if (!playlist || !id) return;
    const snapshot = playlist;
    queryClient.setQueryData<PlaylistDoc>(['playlist', id], {
      ...playlist,
      tracks: playlist.tracks.filter((_, i) => i !== index),
    });
    try {
      await window.sonos.removeTrackFromPlaylist(id, uri);
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast('Failed to remove track');
    }
  }

  function startRename() {
    setRenameValue(playlist?.name ?? '');
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || !id || !playlist || trimmed === playlist.name) { setRenaming(false); return; }
    setRenaming(false);
    const snapshot = playlist;
    queryClient.setQueryData(['playlist', id], { ...playlist, name: trimmed });
    try {
      await window.sonos.updatePlaylist(id, { name: trimmed });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast('Failed to rename playlist');
    }
  }

  async function handleDelete() {
    if (!id || !playlist) return;
    const owner = playlist.owner;
    try {
      await window.sonos.deletePlaylist(id);
      queryClient.removeQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', owner] });
      navigate(`/profile/${encodeURIComponent(owner)}`);
    } catch {
      setConfirmDelete(false);
      showToast('Failed to delete playlist');
    }
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
            <span className={styles.playlistLabel}>{playlist?.isFavourites ? '❤️ Favourites' : 'Playlist'}</span>
            {isLoading ? (
              <div className={styles.skelBlock} style={{ height: 40, width: 240, marginBottom: 4 }} />
            ) : playlist ? (
              <>
                {renaming ? (
                  <input
                    ref={renameInputRef}
                    className={styles.renameInput}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { cancelRename.current = true; setRenaming(false); } }}
                    onBlur={() => { if (cancelRename.current) { cancelRename.current = false; return; } commitRename(); }}
                    autoFocus
                  />
                ) : (
                  <h1
                    className={`${styles.playlistName}${isOwner ? ' ' + styles.playlistNameEditable : ''}`}
                    onClick={isOwner ? startRename : undefined}
                    title={isOwner ? 'Click to rename' : undefined}
                  >
                    {playlist.name}
                  </h1>
                )}
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
                  {playlist.createdAt && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.badge}>Created {new Date(playlist.createdAt).toLocaleDateString()}</span>
                    </>
                  )}
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
                  {isOwner && !playlist.isFavourites && (
                    confirmDelete ? (
                      <>
                        <button className={styles.deleteConfirmBtn} onClick={handleDelete}>Delete forever</button>
                        <button className={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
                      </>
                    ) : (
                      <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>Delete</button>
                    )
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
              return (
                <div key={t.uri + t.addedAt}>
                  {dragOverIndex === i && <div className={styles.dropLine} />}
                  <TrackRow
                    track={t}
                    index={i}
                    isOwner={isOwner}
                    canReorder={canReorder}
                    onAdd={() => onAddToQueue(trackToSonosItem(t), -1)}
                    onRemove={() => handleRemoveTrack(t.uri, i)}
                    onContextMenu={e => showTrackMenu({ track: t, sonosItem: trackToSonosItem(t) }, e)}
                    onDragStart={e => handleDragStart(i, e)}
                    onDragOver={e => handleDragOver(i, e)}
                    onDrop={e => handleDrop(i, e)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
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
