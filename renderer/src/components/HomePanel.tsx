import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems, getName, browseSub, getArt, resolveAlbumParams } from '../lib/itemHelpers';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import type { SonosItem } from '../types/sonos';
import { TrackCard } from './TrackCard';
import { ItemRow } from './ItemRow';
import styles from '../styles/HomePanel.module.css';

interface Props {
  isAuthed: boolean;
  view: 'home' | 'search';
  activeSearch: string;
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
}

function isAlbum(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? '') as string;
  return type.toUpperCase().includes('ALBUM');
}

function CardRow({ items, isLoading, onAdd, onOpen }: {
  items: SonosItem[];
  isLoading: boolean;
  onAdd: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  if (isLoading) {
    return (
      <div className={styles.cardRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.placeholder} />
        ))}
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className={styles.cardRow}>
      {items.map((item, i) => (
        <TrackCard
          key={i}
          name={getName(item)}
          sub={browseSub(item)}
          artUrl={getArt(item)}
          onAdd={() => onAdd(item)}
          onOpen={isAlbum(item) ? () => onOpen(item) : undefined}
        />
      ))}
    </div>
  );
}

export function HomePanel({ isAuthed, view, activeSearch, onAddToQueue, onOpenAlbum }: Props) {
  const { data: favorites = [], isLoading: favLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const r = await api.content.favorites({ count: 20 });
      return r.error ? [] : extractItems(r.data);
    },
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const r = await api.content.history({ count: 20 });
      return r.error ? [] : extractItems(r.data);
    },
    enabled: isAuthed,
    staleTime: 60 * 1000,
  });

  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ['search', activeSearch],
    queryFn: async () => {
      const r = await api.search.query(activeSearch);
      return r.error ? [] : extractItems(r.data);
    },
    enabled: view === 'search' && !!activeSearch,
    staleTime: 2 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  // Prefetch the first 3 album results as soon as they arrive
  useEffect(() => {
    if (view !== 'search' || !searchResults.length) return;
    searchResults
      .filter(isAlbum)
      .slice(0, 3)
      .forEach(item => {
        const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
        if (albumId && serviceId && accountId) {
          queryClient.prefetchQuery(albumQueryOptions(albumId, serviceId, accountId, defaults));
        }
      });
  }, [searchResults, view, queryClient]);

  const prefetchItem = (item: SonosItem) => {
    if (!isAlbum(item)) return;
    const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
    if (albumId && serviceId && accountId) {
      queryClient.prefetchQuery(albumQueryOptions(albumId, serviceId, accountId, defaults));
    }
  };

  if (view === 'search') {
    return (
      <div className={styles.panel}>
        {searchLoading ? (
          <div className={styles.msg}>Searching\u2026</div>
        ) : (
          <>
            <div className={styles.searchHeader}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{activeSearch}&rdquo;
            </div>
            <div className={styles.resultsList}>
              {searchResults.map((item, i) => (
                <ItemRow
                  key={i}
                  name={getName(item)}
                  sub={browseSub(item)}
                  artUrl={getArt(item)}
                  showAddButton
                  onAdd={() => onAddToQueue(item)}
                  onOpen={isAlbum(item) ? () => onOpenAlbum(item) : undefined}
                  onHover={() => prefetchItem(item)}
                />
              ))}
              {searchResults.length === 0 && (
                <div className={styles.msg}>No results.</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {!isAuthed ? (
        <div className={styles.msg}>Waiting for authentication\u2026</div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Favorites</h2>
            </div>
            <CardRow items={favorites} isLoading={favLoading} onAdd={onAddToQueue} onOpen={onOpenAlbum} />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recently Played</h2>
            </div>
            <CardRow items={history} isLoading={histLoading} onAdd={onAddToQueue} onOpen={onOpenAlbum} />
          </section>
        </>
      )}
    </div>
  );
}
