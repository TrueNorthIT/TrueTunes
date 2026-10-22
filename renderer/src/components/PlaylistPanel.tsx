import { Fragment, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Camera, Globe, Lock, ListPlus } from 'lucide-react';
import { usePlaylist } from '../hooks/usePlaylists';
import { useImage } from '../hooks/useImage';
import { useDominantColor } from '../hooks/useDominantColor';
import { useTrackDetails, trackQueryOptions } from '../hooks/useTrackDetails';
import { useUsers } from '../hooks/useUsers';
import { fmtDuration } from '../lib/itemHelpers';
import { useTrackContextMenu } from './common/ContextMenu';
import { useToast } from './common/Toast';
import { HeroBand } from './common/HeroBand';
import { PillButton } from './common/PillButton';
import { SectionCard } from './common/SectionCard';
import { TrackRow } from './common/TrackRow';
import { UserAvatar } from './common/UserAvatar';
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

/** One playlist track: the shared TrackRow plus who added it, reorder and remove. Details (art, duration) load per row. */
function PlaylistRow({
  track, index, isOwner, canReorder, imageByUser, onAdd, onRemove, onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  track: PlaylistTrack;
  index: number;
  isOwner: boolean;
  canReorder: boolean;
  imageByUser: Map<string, string | null | undefined>;
  onAdd: () => void;
  onRemove: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const { data: details } = useTrackDetails(track.uri, track.serviceId, track.accountId);
  const navigate = useNavigate();
  const durationS = details?.durationMs ? Math.round(details.durationMs / 1000) : 0;

  return (
    <TrackRow
      lead={index + 1}
      title={details?.trackName ?? track.trackName}
      artists={details?.artist ?? track.artist}
      imageUrl={details?.artUrl ?? track.imageUrl}
      trailing={durationS > 0 ? fmtDuration(durationS) : undefined}
      attribution={track.addedBy ? {
        user: track.addedBy,
        imageUrl: imageByUser.get(track.addedBy),
        onOpen: () => navigate(`/profile/${encodeURIComponent(track.addedBy)}`),
      } : undefined}
      onAdd={onAdd}
      onRemove={isOwner ? onRemove : undefined}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      handle={canReorder}
    />
  );
}

/** One cell of the 2x2 cover mosaic, used when the playlist has no cover of its own. */
function MosaicCell({ url }: { url: string }) {
  const src = useImage(url);
  return src ? <img src={src} alt="" /> : <span />;
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
  const { data: users } = useUsers(true, true);
  const imageByUser = new Map((users ?? []).map(u => [u.userId, u.imageUrl]));
  // Cover fallback: the first four distinct track covers.
  const trackArts = [...new Set((playlist?.tracks ?? []).map(t => t.imageUrl).filter((u): u is string => !!u))].slice(0, 4);
  const mosaic = !coverArtSrc && trackArts.length >= 4;
  const firstArt = useImage(!coverArtSrc && !mosaic ? (trackArts[0] ?? null) : null);
  const dominantColor = useDominantColor(coverArtSrc ?? firstArt);
  // Total length comes from the same per-track queries the rows use, so it is free; shown once every track has reported.
  const trackInfos = useQueries({
    queries: (playlist?.tracks ?? []).map(t => ({
      ...trackQueryOptions(t.uri, t.serviceId, t.accountId),
      enabled: !!(t.uri && t.serviceId && t.accountId),
    })),
  });
  const knownMs = trackInfos.reduce((sum, q) => sum + (q.data?.durationMs ?? 0), 0);
  const allKnown = trackInfos.length > 0 && trackInfos.every(q => (q.data?.durationMs ?? 0) > 0);
  const totalMins = allKnown ? Math.max(1, Math.round(knownMs / 60000)) : 0;
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

  const collaborators = playlist ? playlist.members.filter(m => m !== playlist.owner) : [];
  const trackCount = playlist?.tracks.length ?? 0;
  const metaLine = [`${trackCount} track${trackCount !== 1 ? 's' : ''}`, totalMins > 0 ? `${totalMins} min` : null].filter(Boolean).join(' \u00b7 ');

  const cover = coverArtSrc ? (
    <img src={coverArtSrc} alt="" />
  ) : mosaic ? (
    <div className={styles.mosaic}>{trackArts.map(u => <MosaicCell key={u} url={u} />)}</div>
  ) : firstArt ? (
    <img src={firstArt} alt="" />
  ) : (
    <div className={styles.coverPh} style={{ background: playlist ? getPlaylistColor(playlist.name) : 'var(--bg-1)' }}>
      {!isLoading && playlist ? playlist.name[0].toUpperCase() : ''}
    </div>
  );

  return (
    <div className={`page-scale ${styles.panel}`}>
      <div className={styles.page}>
        <HeroBand
          wash={dominantColor}
          kind={playlist?.isFavourites ? 'Favourites' : 'Playlist'}
          art={
            <>
              {cover}
              {isOwner && (
                <button
                  type="button"
                  className={`${styles.coverEdit}${uploading ? ' ' + styles.coverUploading : ''}`}
                  aria-label="Change image"
                  title="Change image"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? '…' : <Camera size={22} aria-hidden="true" />}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
            </>
          }
          title={
            isLoading ? (
              <span className={`skeleton ${styles.skelTitle}`} />
            ) : playlist ? (
              renaming ? (
                <input
                  ref={renameInputRef}
                  className={styles.renameInput}
                  aria-label="Playlist name"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { cancelRename.current = true; setRenaming(false); } }}
                  onBlur={() => { if (cancelRename.current) { cancelRename.current = false; return; } commitRename(); }}
                  autoFocus
                />
              ) : playlist.name
            ) : 'Playlist not found'
          }
          onTitleClick={isOwner && playlist && !renaming ? startRename : undefined}
          titleHint="Click to rename"
        >
          {playlist && (
            <>
              <div className={styles.people}>
                <button
                  type="button"
                  className={styles.owner}
                  onClick={() => navigate(`/profile/${encodeURIComponent(playlist.owner)}`)}
                  aria-label={`${playlist.owner}, owner, open profile`}
                >
                  <UserAvatar name={playlist.owner} imageUrl={imageByUser.get(playlist.owner)} className={styles.avatar} />
                  {playlist.owner}
                </button>
                {collaborators.length > 0 && (
                  <ul className={styles.collabs} aria-label="Collaborators">
                    {collaborators.slice(0, 6).map(m => (
                      <li key={m}>
                        <button
                          type="button"
                          className={styles.collab}
                          title={m}
                          aria-label={`${m}, collaborator, open profile`}
                          onClick={() => navigate(`/profile/${encodeURIComponent(m)}`)}
                        >
                          <UserAvatar name={m} imageUrl={imageByUser.get(m)} className={styles.avatar} />
                        </button>
                      </li>
                    ))}
                    {collaborators.length > 6 && <li className={styles.more}>+{collaborators.length - 6}</li>}
                  </ul>
                )}
              </div>
              <div className={styles.metaLine}>
                <span className={styles.privacy}>
                  {playlist.isPublic ? <Globe size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
                  {playlist.isPublic ? 'Public' : 'Private'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{metaLine}</span>
                {playlist.createdAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Created {new Date(playlist.createdAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
              <div className={styles.actions}>
                {playlist.tracks.length > 0 && (
                  <PillButton variant="primary" onClick={handlePlayAll}>
                    <ListPlus size={16} aria-hidden="true" />
                    Play all
                  </PillButton>
                )}
                {playlist.isPublic && !isOwner && (
                  <PillButton onClick={handleJoin}>{isMember ? 'Leave' : 'Join'}</PillButton>
                )}
                {isOwner && !playlist.isFavourites && (
                  confirmDelete ? (
                    <>
                      <PillButton variant="danger" onClick={handleDelete}>Delete forever</PillButton>
                      <PillButton onClick={() => setConfirmDelete(false)}>Cancel</PillButton>
                    </>
                  ) : (
                    <PillButton variant="danger" onClick={() => setConfirmDelete(true)}>Delete</PillButton>
                  )
                )}
              </div>
            </>
          )}
        </HeroBand>

        <SectionCard className={styles.section}>
          {isLoading ? (
            <div aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.skeletonRow}>
                  <span className={`skeleton ${styles.skelNum}`} />
                  <span className={`skeleton ${styles.skelArt}`} />
                  <span className={`skeleton ${styles.skelLine}`} style={{ width: `${30 + (i % 4) * 12}%`, animationDelay: `${i * 60}ms` }} />
                </div>
              ))}
            </div>
          ) : playlist && playlist.tracks.length === 0 ? (
            <p className={styles.emptyMsg}>No tracks yet — right-click any track and choose "Add to playlist"</p>
          ) : playlist ? (
            <ul className={styles.list}>
              {playlist.tracks.map((t, i) => (
                <Fragment key={t.uri + t.addedAt}>
                  {dragOverIndex === i && <li className={styles.dropLine} aria-hidden="true" />}
                  <PlaylistRow
                    track={t}
                    index={i}
                    isOwner={isOwner}
                    canReorder={canReorder}
                    imageByUser={imageByUser}
                    onAdd={() => onAddToQueue(trackToSonosItem(t), -1)}
                    onRemove={() => handleRemoveTrack(t.uri, i)}
                    onContextMenu={e => showTrackMenu({ track: t, sonosItem: trackToSonosItem(t) }, e)}
                    onDragStart={e => handleDragStart(i, e)}
                    onDragOver={e => handleDragOver(i, e)}
                    onDrop={e => handleDrop(i, e)}
                    onDragEnd={handleDragEnd}
                  />
                </Fragment>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
