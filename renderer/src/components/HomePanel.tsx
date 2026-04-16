import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems, parseServiceSearch, resolveAlbumParams, resolveArtistParams, isAlbum, isArtist } from '../lib/itemHelpers';
import type { ServiceSearch } from '../types/ServiceSearch';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { CardRow } from './CardRow';
import { SearchResults } from './SearchResults';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

interface Props {
  isAuthed: boolean;
  view: 'home' | 'search';
  activeSearch: string;
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
}

export function HomePanel({ isAuthed, view, activeSearch, onAddToQueue, onOpenAlbum, onOpenArtist }: Props) {
  const queryClient = useQueryClient();

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
      const r = await api.search.serviceQuery(activeSearch, { count: 50 });
      return r.error ? [] : parseServiceSearch(r.data as ServiceSearch);
    },
    enabled: view === 'search' && !!activeSearch,
    staleTime: 2 * 60 * 1000,
  });

  // Prefetch first 3 albums and top artist from search results
  useEffect(() => {
    if (view !== 'search' || !searchResults.length) return;

    searchResults.filter(isAlbum).slice(0, 3).forEach((item) => {
      const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
      if (albumId && serviceId && accountId) {
        queryClient.prefetchQuery(albumQueryOptions(albumId, serviceId, accountId, defaults));
      }
    });

    const top = searchResults[0];
    if (top && isArtist(top)) {
      const { artistId, serviceId, accountId, defaults } = resolveArtistParams(top);
      if (artistId && serviceId && accountId) {
        queryClient.prefetchQuery(artistQueryOptions(artistId, serviceId, accountId, defaults));
      }
    }
  }, [searchResults, view, queryClient]);

  if (view === 'search') {
    return (
      <div className={styles.panel}>
        {searchLoading ? (
          <div className={styles.msg}>Searching…</div>
        ) : (
          <SearchResults
            results={searchResults}
            onAddToQueue={onAddToQueue}
            onOpenAlbum={onOpenAlbum}
            onOpenArtist={onOpenArtist}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {!isAuthed ? (
        <div className={styles.msg}>Waiting for authentication…</div>
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
