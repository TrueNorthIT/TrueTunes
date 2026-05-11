import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMyPlaylists, favouritesId } from '../../hooks/usePlaylists';
import { useToast } from './Toast';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ContextMenu.module.css';

interface TrackMenuPayload {
  track: PlaylistTrack;
  sonosItem?: SonosItem;
}

interface ContextMenuCtx {
  showTrackMenu: (payload: TrackMenuPayload, e: React.MouseEvent) => void;
}

const ContextMenuContext = createContext<ContextMenuCtx>({ showTrackMenu: () => {} });

export function useTrackContextMenu() {
  return useContext(ContextMenuContext);
}

interface ProviderProps {
  children: React.ReactNode;
  displayName: string | null | undefined;
  onAddToQueue: (item: SonosItem, position?: number) => void;
}

interface MenuState {
  open: boolean;
  x: number;
  y: number;
  payload: TrackMenuPayload | null;
  submenuOpen: boolean;
  submenuAnchor: { x: number; y: number } | null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function PlaylistSubmenu({
  anchor,
  displayName,
  track,
  onClose,
  onOpenCreate,
}: {
  anchor: { x: number; y: number };
  displayName: string | null | undefined;
  track: PlaylistTrack;
  onClose: () => void;
  onOpenCreate: () => void;
}) {
  const { owned, joined, isLoading } = useMyPlaylists(displayName);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  const allPlaylists = [...owned, ...joined];

  async function handleAdd(playlist: PlaylistMeta) {
    try {
      await window.sonos.addTrackToPlaylist(playlist.id, track);
      queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', playlist.owner] });
      if (displayName && playlist.owner !== displayName) {
        queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', displayName] });
      }
    } catch {
      showToast(`Failed to add to ${playlist.name}`);
    }
    onClose();
  }

  // Position submenu to right; flip left if near edge
  const menuW = 200;
  const left = anchor.x + menuW > window.innerWidth - 8 ? anchor.x - menuW : anchor.x;
  const top = clamp(anchor.y, 8, window.innerHeight - 8);

  return createPortal(
    <div
      ref={ref}
      className={styles.submenu}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isLoading && <div className={styles.emptyHint}>Loading…</div>}
      {!isLoading && allPlaylists.length === 0 && (
        <div className={styles.emptyHint}>No playlists yet</div>
      )}
      {allPlaylists.map((pl) => (
        <div key={pl.id} className={styles.item} onClick={() => handleAdd(pl)}>
          <span className={styles.itemIcon}>♪</span>
          {pl.name}
          {!pl.isPublic && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-3)' }}>🔒</span>}
        </div>
      ))}
      {allPlaylists.length > 0 && <div className={styles.separator} />}
      <div
        className={styles.item}
        onClick={() => { onClose(); onOpenCreate(); }}
      >
        <span className={styles.itemIcon}>+</span>
        Create new playlist…
      </div>
    </div>,
    document.body,
  );
}

export function ContextMenuProvider({ children, displayName, onAddToQueue }: ProviderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [menuState, setMenuState] = useState<MenuState>({
    open: false, x: 0, y: 0, payload: null, submenuOpen: false, submenuAnchor: null,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<PlaylistTrack | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setMenuState((s) => ({ ...s, open: false, submenuOpen: false, submenuAnchor: null }));
  }, []);

  const showTrackMenu = useCallback((payload: TrackMenuPayload, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuH = 120;
    const menuW = 200;
    const x = clamp(e.clientX, 8, window.innerWidth - menuW - 8);
    const y = clamp(e.clientY, 8, window.innerHeight - menuH - 8);
    setMenuState({ open: true, x, y, payload, submenuOpen: false, submenuAnchor: null });
  }, []);

  useEffect(() => {
    if (!menuState.open) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuState.open, close]);

  function handlePlayNext() {
    if (menuState.payload?.sonosItem) onAddToQueue(menuState.payload.sonosItem, 0);
    close();
  }

  function handleAddToQueue() {
    if (menuState.payload?.sonosItem) onAddToQueue(menuState.payload.sonosItem, -1);
    close();
  }

  async function handleAddToFavourites() {
    if (!menuState.payload || !displayName) return;
    const favId = favouritesId(displayName);
    const track = menuState.payload.track;
    const snapshot = queryClient.getQueryData<PlaylistDoc>(['playlist', favId]);
    if (snapshot) {
      queryClient.setQueryData(['playlist', favId], {
        ...snapshot,
        tracks: [...snapshot.tracks, track],
      });
    }
    try {
      await window.sonos.addTrackToPlaylist(favId, track);
      queryClient.invalidateQueries({ queryKey: ['playlist', favId] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
    } catch {
      if (snapshot) queryClient.setQueryData(['playlist', favId], snapshot);
      showToast('Failed to add to Favourites');
    }
    close();
  }

  function handleOpenPlaylistSubmenu(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuState((s) => ({
      ...s,
      submenuOpen: !s.submenuOpen,
      submenuAnchor: { x: rect.right + 4, y: rect.top },
    }));
  }

  function handleOpenProfile() {
    if (menuState.payload?.track.addedBy) {
      navigate(`/profile/${encodeURIComponent(menuState.payload.track.addedBy)}`);
    }
    close();
  }

  return (
    <ContextMenuContext.Provider value={{ showTrackMenu }}>
      {children}
      {menuState.open && menuState.payload && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          style={{ left: menuState.x, top: menuState.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuState.payload.sonosItem && (
            <>
              <div className={styles.item} onClick={handlePlayNext}>
                <span className={styles.itemIcon}>▶</span>
                Play next
              </div>
              <div className={styles.item} onClick={handleAddToQueue}>
                <span className={styles.itemIcon}>+</span>
                Add to queue
              </div>
              <div className={styles.separator} />
            </>
          )}
          {displayName && (
            <div className={styles.item} onClick={handleAddToFavourites}>
              <span className={styles.itemIcon}>❤️</span>
              Add to Favourites
            </div>
          )}
          <div className={styles.item} onMouseEnter={handleOpenPlaylistSubmenu} onClick={handleOpenPlaylistSubmenu}>
            <span className={styles.itemIcon}>♪</span>
            Add to playlist
            <span className={styles.itemArrow}>▶</span>
          </div>
          {menuState.payload.track.addedBy && (
            <>
              <div className={styles.separator} />
              <div className={styles.item} onClick={handleOpenProfile}>
                <span className={styles.itemIcon}>👤</span>
                View {menuState.payload.track.addedBy}'s profile
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
      {menuState.open && menuState.submenuOpen && menuState.submenuAnchor && menuState.payload && (
        <PlaylistSubmenu
          anchor={menuState.submenuAnchor}
          displayName={displayName}
          track={menuState.payload.track}
          onClose={close}
          onOpenCreate={() => {
            setPendingTrack(menuState.payload!.track);
            setCreateOpen(true);
          }}
        />
      )}
      {createOpen && (
        <CreatePlaylistDialog
          displayName={displayName}
          pendingTrack={pendingTrack}
          onClose={() => { setCreateOpen(false); setPendingTrack(null); }}
        />
      )}
    </ContextMenuContext.Provider>
  );
}

// ── CreatePlaylistDialog ──────────────────────────────────────────────────────

export function CreatePlaylistDialog({
  displayName,
  pendingTrack,
  onClose,
}: {
  displayName: string | null | undefined;
  pendingTrack: PlaylistTrack | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleCreate() {
    if (!name.trim() || !displayName) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const playlist = await window.sonos.createPlaylist(name.trim(), isPublic);
      if (pendingTrack && playlist.id) {
        await window.sonos.addTrackToPlaylist(playlist.id, pendingTrack);
      }
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '24px 28px', minWidth: 300, display: 'flex',
          flexDirection: 'column', gap: 16,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>New playlist</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
          placeholder="Playlist name"
          style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            style={{ accentColor: 'var(--text)', width: 14, height: 14 }}
          />
          Public — anyone can join and add tracks
        </label>
        {errorMsg && (
          <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', borderRadius: 6, padding: '6px 10px' }}>
            {errorMsg}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '7px 16px', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || busy}
            style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid var(--border-2)',
              borderRadius: 8, padding: '7px 16px', color: 'var(--text)', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (!name.trim() || busy) ? 0.4 : 1,
            }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
