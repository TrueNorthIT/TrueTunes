import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Heart, ListMusic, ListPlus, ListStart, Lock, Plus, UserRound } from 'lucide-react';
import { useMyPlaylists, favouritesId, playlistKeys } from '../../hooks/usePlaylists';
import { useDisplayName } from '../../hooks/useDisplayName';
import { useQueueActions } from '../../hooks/useQueueActions';
import { useToast } from './Toast';
import { Dialog } from './Dialog';
import { PillButton } from './PillButton';
import type { SonosItem } from '../../types/sonos';
import dialog from './Dialog.module.css';
import styles from '../../styles/ContextMenu.module.css';

/** Up and Down move between a menu's items, wrapping at the ends. */
function onMenuKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const down = e.key === 'ArrowDown';
  const next = i < 0 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

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
}

interface SubmenuAnchor {
  x: number;
  flipX: number;
  y: number;
}

interface MenuState {
  open: boolean;
  x: number;
  y: number;
  payload: TrackMenuPayload | null;
  submenuOpen: boolean;
  /** x: right of the item (open rightwards); flipX: left of the menu (open leftwards); y: the item's top. */
  submenuAnchor: SubmenuAnchor | null;
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
  anchor: SubmenuAnchor;
  displayName: string | null | undefined;
  track: PlaylistTrack;
  onClose: () => void;
  onOpenCreate: () => void;
}) {
  const { owned, joined, isLoading } = useMyPlaylists(displayName);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  // Favourites has its own menu item, and a playlist you own can also come back as joined.
  const favId = displayName ? favouritesId(displayName) : null;
  const allPlaylists = [...owned, ...joined].filter(
    (pl, i, all) => pl.id !== favId && all.findIndex((p) => p.id === pl.id) === i
  );

  async function handleAdd(playlist: PlaylistMeta) {
    try {
      await window.sonos.addTrackToPlaylist(playlist.id, track);
      void queryClient.invalidateQueries({ queryKey: playlistKeys.detail(playlist.id) });
      void queryClient.invalidateQueries({ queryKey: playlistKeys.owned(playlist.owner) });
      if (displayName && playlist.owner !== displayName) {
        void queryClient.invalidateQueries({ queryKey: playlistKeys.joined(displayName) });
      }
    } catch {
      showToast(`Failed to add to ${playlist.name}`);
    }
    onClose();
  }

  // Placed after layout, once its real size is known (the list grows when playlists load): beside the item,
  // flipped to the left when it would run off the right, and lifted so the whole list stays on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = anchor.x + r.width > window.innerWidth - 8 ? anchor.flipX - r.width : anchor.x;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - r.height - 8))}px`;
  }, [anchor, allPlaylists.length, isLoading]);

  return createPortal(
    <div
      ref={ref}
      className={`page-scale ${styles.submenu}`}
      style={{ left: anchor.x, top: anchor.y }}
      role="menu"
      aria-label="Add to playlist"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
    >
      {isLoading && <div className={styles.emptyHint}>Loading…</div>}
      {!isLoading && allPlaylists.length === 0 && <div className={styles.emptyHint}>No playlists yet</div>}
      {allPlaylists.map((pl) => (
        <button key={pl.id} type="button" role="menuitem" className={styles.item} onClick={() => void handleAdd(pl)}>
          <ListMusic className={styles.itemIcon} size={16} aria-hidden="true" />
          <span className={styles.itemLabel}>{pl.name}</span>
          {!pl.isPublic && <Lock className={styles.itemTrail} size={13} aria-label="Private" />}
        </button>
      ))}
      {allPlaylists.length > 0 && <div className={styles.separator} role="separator" />}
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => {
          onClose();
          onOpenCreate();
        }}
      >
        <Plus className={styles.itemIcon} size={16} aria-hidden="true" />
        New playlist…
      </button>
    </div>,
    document.body
  );
}

export function ContextMenuProvider({ children }: ProviderProps) {
  const displayName = useDisplayName();
  const { addToQueue: onAddToQueue, queueNext: onQueueNext } = useQueueActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [menuState, setMenuState] = useState<MenuState>({
    open: false,
    x: 0,
    y: 0,
    payload: null,
    submenuOpen: false,
    submenuAnchor: null,
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
    // Keep the whole menu on screen (it was clamped by a guessed height), then focus the menu itself, so
    // the arrow keys work but nothing is pre-selected: Enter straight after a right-click can't queue a track.
    const menu = menuRef.current;
    if (menu) {
      const r = menu.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
      menu.focus();
    }
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuState.open, close]);

  function handleQueueNext() {
    if (menuState.payload?.sonosItem) void onQueueNext(menuState.payload.sonosItem);
    close();
  }

  function handleAddToQueue() {
    if (menuState.payload?.sonosItem) void onAddToQueue(menuState.payload.sonosItem, -1);
    close();
  }

  async function handleAddToFavourites() {
    if (!menuState.payload || !displayName) return;
    const favId = favouritesId(displayName);
    const track = menuState.payload.track;
    const snapshot = queryClient.getQueryData<PlaylistDoc>(playlistKeys.detail(favId));
    if (snapshot) {
      queryClient.setQueryData(playlistKeys.detail(favId), {
        ...snapshot,
        tracks: [...snapshot.tracks, track],
      });
    }
    try {
      await window.sonos.addTrackToPlaylist(favId, track);
      void queryClient.invalidateQueries({ queryKey: playlistKeys.detail(favId) });
      void queryClient.invalidateQueries({ queryKey: playlistKeys.owned(displayName) });
    } catch {
      if (snapshot) queryClient.setQueryData(playlistKeys.detail(favId), snapshot);
      showToast('Failed to add to Favourites');
    }
    close();
  }

  // Hover opens the submenu; a click toggles it. (Hover used to toggle too, so hover-then-click closed it.)
  function handleOpenPlaylistSubmenu(e: React.MouseEvent, open?: boolean) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuState((s) => ({
      ...s,
      submenuOpen: open ?? !s.submenuOpen,
      submenuAnchor: {
        x: rect.right + 4,
        flipX: (menuRef.current?.getBoundingClientRect().left ?? rect.left) - 4,
        y: rect.top - 4,
      },
    }));
  }

  function handleOpenProfile() {
    if (menuState.payload?.track.addedBy) {
      void navigate(`/profile/${encodeURIComponent(menuState.payload.track.addedBy)}`);
    }
    close();
  }

  return (
    <ContextMenuContext.Provider value={{ showTrackMenu }}>
      {children}
      {menuState.open &&
        menuState.payload &&
        createPortal(
          <div
            ref={menuRef}
            className={`page-scale ${styles.menu}`}
            style={{ left: menuState.x, top: menuState.y }}
            role="menu"
            tabIndex={-1}
            aria-label={menuState.payload.track.trackName}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKeyDown}
          >
            {menuState.payload.sonosItem && (
              <>
                <button type="button" role="menuitem" className={styles.item} onClick={handleQueueNext}>
                  <ListStart className={styles.itemIcon} size={16} aria-hidden="true" />
                  Queue next
                </button>
                <button type="button" role="menuitem" className={styles.item} onClick={handleAddToQueue}>
                  <ListPlus className={styles.itemIcon} size={16} aria-hidden="true" />
                  Add to queue
                </button>
                <div className={styles.separator} role="separator" />
              </>
            )}
            {displayName && (
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => void handleAddToFavourites()}
              >
                <Heart className={styles.itemIcon} size={16} aria-hidden="true" />
                Add to Favourites
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={menuState.submenuOpen}
              className={`${styles.item}${menuState.submenuOpen ? ' ' + styles.itemOpen : ''}`}
              onMouseEnter={(e) => handleOpenPlaylistSubmenu(e, true)}
              onClick={(e) => handleOpenPlaylistSubmenu(e)}
            >
              <ListMusic className={styles.itemIcon} size={16} aria-hidden="true" />
              Add to playlist
              <ChevronRight className={styles.itemTrail} size={15} aria-hidden="true" />
            </button>
            {menuState.payload.track.addedBy && (
              <>
                <div className={styles.separator} role="separator" />
                <button type="button" role="menuitem" className={styles.item} onClick={handleOpenProfile}>
                  <UserRound className={styles.itemIcon} size={16} aria-hidden="true" />
                  View {menuState.payload.track.addedBy}'s profile
                </button>
              </>
            )}
          </div>,
          document.body
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
          onClose={() => {
            setCreateOpen(false);
            setPendingTrack(null);
          }}
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

  async function handleCreate() {
    if (!name.trim() || !displayName || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const playlist = await window.sonos.createPlaylist(name.trim(), isPublic);
      if (pendingTrack && playlist.id) {
        await window.sonos.addTrackToPlaylist(playlist.id, pendingTrack);
      }
      void queryClient.invalidateQueries({ queryKey: playlistKeys.owned(displayName) });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="New playlist"
      onClose={onClose}
      size="sm"
      onSubmit={() => void handleCreate()}
      actions={
        <>
          <PillButton onClick={onClose}>Cancel</PillButton>
          <PillButton variant="primary" type="submit" disabled={!name.trim() || !displayName || busy}>
            {busy ? 'Creating…' : 'Create'}
          </PillButton>
        </>
      }
    >
      <div className={dialog.stack}>
        {pendingTrack && <p className={dialog.note}>“{pendingTrack.trackName}” goes in it straight away.</p>}
        <label className={dialog.field}>
          <span className={dialog.label}>Name</span>
          <input
            className={dialog.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
          />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          <span>
            <span className={styles.checkTitle}>Public</span>
            <span className={styles.checkSub}>Anyone in the office can join it and add tracks.</span>
          </span>
        </label>
        {errorMsg && (
          <p className={dialog.error} role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    </Dialog>
  );
}
