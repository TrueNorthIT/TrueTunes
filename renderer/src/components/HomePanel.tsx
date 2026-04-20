import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/sonosApi';
import {
  extractItems,
  parseServiceSearch,
  resolveAlbumParams,
  resolveArtistParams,
  isAlbum,
  isArtist,
} from '../lib/itemHelpers';
import { useOpenItem } from '../hooks/useOpenItem';
import type { ServiceSearch } from '../types/ServiceSearch';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { CardRow } from './CardRow';
import { SearchResults } from './search/SearchResults';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

interface Props {
  isAuthed: boolean;
  onAddToQueue: (item: SonosItem) => void;
  ytm: YtmSections | undefined;
  ytmLoading: boolean;
  history: SonosItem[];
  histLoading: boolean;
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
  const homeItem        = find('Home');
  const newReleasesItem = find('New releases');
  const chartsItem      = find('Charts');
  const supermixItem    = find('My Supermix');

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
      ? [{ ...supermixItem, images: [] as { url: string }[], imageUrl: '/icon.png' }, ...homeItems]
      : homeItems,
    newReleases: newItems,
    charts: chartItems,
  };
}

export function HomePanel({ isAuthed, onAddToQueue, ytm, ytmLoading, history, histLoading }: Props) {
  const queryClient = useQueryClient();
  const location    = useLocation();
  const [searchParams] = useSearchParams();
  const openItem    = useOpenItem();

  const view         = location.pathname === '/search' ? 'search' : 'home';
  const activeSearch = searchParams.get('q') ?? '';

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
          <SearchResults
            results={searchResults}
            onAddToQueue={onAddToQueue}
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
              <h2 className={styles.sectionTitle}>For You</h2>
            </div>
            <CardRow items={ytm?.forYou ?? []} isLoading={ytmLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recently Played</h2>
            </div>
            <CardRow items={history} isLoading={histLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </section>

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
    </div>
  );
}
