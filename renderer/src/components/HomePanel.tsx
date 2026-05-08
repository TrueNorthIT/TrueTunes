import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { User } from 'lucide-react';
import { api } from '../lib/sonosApi';
import {
  extractItems,
  parseServiceSearch,
  resolveAlbumParams,
  resolveArtistParams,
  isAlbum,
  isArtist,
  getName,
  browseSub,
} from '../lib/itemHelpers';
import { useOpenItem } from '../hooks/useOpenItem';
import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed';
import { useMyPlaylists } from '../hooks/usePlaylists';
import { useDailyGame, useMyScore } from '../hooks/useDailyGame';
import { useImage } from '../hooks/useImage';
import { createDragGhost } from '../lib/dragHelpers';
import { PlaylistCard } from './common/PlaylistCard';
import type { ServiceSearch } from '../types/ServiceSearch';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { CardRow } from './CardRow';
import { SearchResults } from './search/SearchResults';
import { CreatePlaylistDialog } from './common/ContextMenu';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

function AlbumListItem({ item, onOpen, onAdd }: { item: SonosItem; onOpen: () => void; onAdd: () => void }) {
  const art = useImage(item.imageUrl);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify([item]));
    createDragGhost(getName(item), e.dataTransfer);
  }

  return (
    <div className={styles.albumRow} draggable onClick={onOpen} onDragStart={handleDragStart}>
      <div className={styles.albumArtWrap}>
        {art ? <img className={styles.albumArt} src={art} alt="" /> : <div className={styles.albumArtPh} />}
      </div>
      <div className={styles.albumInfo}>
        <div className={styles.albumName}>{getName(item)}</div>
        <div className={styles.albumSub}>{browseSub(item)}</div>
      </div>
      <button
        className={styles.albumAddBtn}
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        title="Add to queue"
      >+</button>
    </div>
  );
}

function ArtistGridCell({ item, onOpen }: { item: SonosItem; onOpen: () => void }) {
  const art = useImage(item.imageUrl);
  return (
    <div className={styles.artistCell} onClick={onOpen}>
      <div className={styles.artistCircle}>
        {art
          ? <img className={styles.artistImg} src={art} alt="" />
          : <div className={styles.artistPh}>♪</div>
        }
      </div>
      <div className={styles.artistCellName}>{getName(item)}</div>
    </div>
  );
}

interface Props {
  isAuthed: boolean;
  onAddToQueue: (item: SonosItem) => void;
  ytm: YtmSections | undefined;
  ytmLoading: boolean;
  displayName?: string | null;
}

export interface YtmSections {
  forYou: SonosItem[];
  newReleases: SonosItem[];
  charts: SonosItem[];
}

export async function fetchYtmSections(): Promise<YtmSections> {
  const rootR = await api.browse.container('root', { muse2: true });
  if (rootR.error) return { forYou: [], newReleases: [], charts: [] };

  const d = rootR.data as Record<string, unknown>;
  const stack = ((d['sections'] as Record<string, unknown>)?.['items'] as unknown[])?.[0] as
    | Record<string, unknown>
    | undefined;
  const rootItems = (stack?.['items'] ?? []) as SonosItem[];

  const find = (title: string) => rootItems.find((i) => (i.title ?? i.name) === title);
  const homeItem = find('Home');
  const newReleasesItem = find('New releases');
  const chartsItem = find('Charts');
  const supermixItem = find('My Supermix');

  const browseContainer = async (item: SonosItem | undefined): Promise<SonosItem[]> => {
    if (!item) return [];
    const rid = item.resource?.id as import('../types/sonos').SonosItemId | undefined;
    const id = rid?.objectId;
    if (!id) return [];
    const r = await api.browse.container(id, {
      serviceId: rid?.serviceId,
      accountId: rid?.accountId,
      defaults: item.resource?.defaults as string | undefined,
      muse2: true,
    });
    return r.error ? [] : extractItems(r.data);
  };

  const [homeItems, newItems, chartItems] = await Promise.all([
    browseContainer(homeItem),
    browseContainer(newReleasesItem),
    browseContainer(chartsItem),
  ]);

  return {
    forYou: supermixItem
      ? [{ ...supermixItem, images: [] as { url: string }[], imageUrl: '../../public/icon.png' }, ...homeItems]
      : homeItems,
    newReleases: newItems,
    charts: chartItems,
  };
}

export function HomePanel({ isAuthed, onAddToQueue, ytm, ytmLoading, displayName }: Props) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openItem = useOpenItem();

  const view = location.pathname === '/search' ? 'search' : 'home';
  const activeSearch = searchParams.get('q') ?? '';

  const { owned: ownedPlaylists, joined: joinedPlaylists } = useMyPlaylists(displayName);

  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLSpanElement>(null);
  const { artistItems, albumItems, availableUsers, currentUserId, isLoading: recentLoading } = useRecentlyPlayed(selectedUser);

  // Default to current user once we know who they are
  useEffect(() => {
    if (currentUserId && !selectedUser) setSelectedUser(currentUserId);
  }, [currentUserId, selectedUser]);

  const { data: todayGame } = useDailyGame();
  const todayGameId = todayGame && 'id' in todayGame ? todayGame.id : null;
  const { data: myScore } = useMyScore(todayGameId, currentUserId);
  const hasCompletedToday = !!myScore?.score;

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ['search', activeSearch],
    queryFn: async () => {
      const r = await api.search.serviceQuery(activeSearch, { count: 50 });
      return r.error ? [] : parseServiceSearch(r.data as ServiceSearch);
    },
    enabled: view === 'search' && !!activeSearch,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (view !== 'search' || !searchResults.length) return;
    searchResults
      .filter(isAlbum)
      .slice(0, 3)
      .forEach((item) => {
        const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
        if (albumId && serviceId && accountId)
          queryClient.prefetchQuery(albumQueryOptions(albumId, serviceId, accountId, defaults));
      });
    const top = searchResults[0];
    if (top && isArtist(top)) {
      const { artistId, serviceId, accountId, defaults } = resolveArtistParams(top);
      if (artistId && serviceId && accountId)
        queryClient.prefetchQuery(artistQueryOptions(artistId, serviceId, accountId, defaults));
    }
  }, [searchResults, view, queryClient]);

  if (view === 'search') {
    return (
      <div className={styles.panel}>
        {searchLoading ? (
          <div className={styles.msg}>Searching…</div>
        ) : (
          <SearchResults results={searchResults} onAddToQueue={onAddToQueue} />
        )}
      </div>
    );
  }

  const hasRecent = !!selectedUser || recentLoading || artistItems.length > 0 || albumItems.length > 0;
  const recentEmpty = !!selectedUser && !recentLoading && artistItems.length === 0 && albumItems.length === 0;
  const users = availableUsers.length > 0 ? availableUsers : (currentUserId ? [currentUserId] : []);
  const isPickerLocked = users.length > 1 && !hasCompletedToday;

  return (
    <div className={styles.panel}>
      {!isAuthed ? (
        <div className={styles.msg}>Waiting for authentication…</div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>For You</h2>
            </div>
            <CardRow items={ytm?.forYou ?? []} isLoading={ytmLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </section>

          {displayName && (ownedPlaylists.length > 0 || joinedPlaylists.length > 0) && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Playlists</h2>
                <button className={styles.sectionAction} onClick={() => setCreatePlaylistOpen(true)}>+ New</button>
              </div>
              <div className={styles.playlistRow}>
                {[...ownedPlaylists, ...joinedPlaylists].map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    pl={pl}
                    displayName={displayName}
                    onClick={() => navigate(`/playlist/${pl.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {hasRecent && (
            <>
              <div className={styles.recentHeader}>
                <h2 className={styles.sectionTitle}>
                  Recently Played — Last 7 Days
                  {selectedUser && (
                    <span className={styles.userSep}> — </span>
                  )}
                  {selectedUser && (
                    <span
                      className={styles.userDropdown}
                      ref={pickerRef}
                      data-tooltip={isPickerLocked ? "Complete Today's Quedle to see your colleagues' recently played" : undefined}
                    >
                      <button
                        className={styles.userDropdownTrigger}
                        onClick={() => !isPickerLocked && setPickerOpen((o) => !o)}
                        disabled={users.length <= 1}
                      >
                        {selectedUser}
                        {users.length > 1 && (
                          <span className={isPickerLocked ? styles.chevronLocked : styles.chevron}>
                            {isPickerLocked ? '🔒' : '▾'}
                          </span>
                        )}
                      </button>
                      {pickerOpen && !isPickerLocked && users.length > 1 && (
                        <ul className={styles.userDropdownList}>
                          {users.map((u) => (
                            <li key={u} className={styles.userDropdownLi}>
                              <button
                                className={u === selectedUser ? styles.userDropdownItemActive : styles.userDropdownItem}
                                onClick={() => { setSelectedUser(u); setPickerOpen(false); }}
                              >
                                {u}
                              </button>
                              <button
                                className={styles.profileLinkBtn}
                                onClick={() => { setPickerOpen(false); navigate(`/profile/${encodeURIComponent(u)}`); }}
                                title={`View ${u}'s profile`}
                              >
                                <User size={12} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                  )}
                </h2>
              </div>

              {recentEmpty && (
                <div className={styles.recentEmpty}>Nothing queued in the last 7 days</div>
              )}

              {recentLoading && (
                <div className={styles.recentGrid}>
                  <div className={styles.albumList}>
                    <div className={styles.skelTitle} />
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className={styles.albumRow} style={{ animationDelay: `${i * 80}ms` }}>
                        <div className={styles.skelAlbumArt} />
                        <div className={styles.albumInfo}>
                          <div className={styles.skelLine} />
                          <div className={styles.skelLineShort} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.artistGrid}>
                    <div className={styles.skelTitle} />
                    <div className={styles.artistGridInner} style={{ height: `${6 * 62 - 2}px` }}>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className={styles.artistCell}>
                          <div className={styles.skelCircle} style={{ animationDelay: `${i * 60}ms` }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!recentEmpty && !recentLoading && (
                <div className={styles.recentGrid}>
                  {albumItems.length > 0 && (
                    <div className={styles.albumList}>
                      <h2 className={styles.subSectionTitle}>Albums</h2>
                      {albumItems.map((item, i) => (
                        <AlbumListItem key={i} item={item} onOpen={() => openItem(item)} onAdd={() => onAddToQueue(item)} />
                      ))}
                    </div>
                  )}
                  {artistItems.length > 0 && (() => {
                    const noAlbums = albumItems.length === 0;
                    const numCols = Math.min(noAlbums ? 5 : 3, artistItems.length);
                    const numRows = Math.ceil(artistItems.length / numCols);
                    const gridHeight = noAlbums
                      ? numRows === 1 ? 200 : numRows * 80
                      : albumItems.length * 62 - 2;
                    return (
                      <div
                        className={styles.artistGrid}
                        style={noAlbums ? { gridColumn: '1 / -1' } : undefined}
                      >
                        <h2 className={styles.subSectionTitle}>Artists</h2>
                        <div
                          className={styles.artistGridInner}
                          style={{
                            height: `${gridHeight}px`,
                            '--grid-cols': numCols,
                            '--grid-rows': numRows,
                          } as React.CSSProperties}
                        >
                          {artistItems.map((item, i) => (
                            <ArtistGridCell key={i} item={item} onOpen={() => openItem(item)} />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>New Releases</h2>
            </div>
            <CardRow items={ytm?.newReleases ?? []} isLoading={ytmLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Charts</h2>
            </div>
            <CardRow items={ytm?.charts ?? []} isLoading={ytmLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </section>
        </>
      )}
      {createPlaylistOpen && (
        <CreatePlaylistDialog
          displayName={displayName}
          pendingTrack={null}
          onClose={() => setCreatePlaylistOpen(false)}
        />
      )}
    </div>
  );
}
