import { useMemo, useState } from 'react';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/sonosApi';
import { parseServiceSearch, albumItem } from '../../lib/itemHelpers';
import { dedupeTracks } from '../../lib/searchResults';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../../lib/recentSearches';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useOfficePresence } from '../../hooks/useOfficePresence';
import { useDjSet } from '../../hooks/useDjSet';
import { useDjDiscoveries } from '../../hooks/useDjDiscoveries';
import { Carousel } from '../common/Carousel';
import { ImageTile } from '../common/ImageTile';
import { PillButton } from '../common/PillButton';
import { SectionCard, SeeAll } from '../common/SectionCard';
import { SearchResults } from './SearchResults';
import type { SonosItem } from '../../types/sonos';
import styles from './SearchPanel.module.css';
import { STALE } from '../../lib/queryDefaults';

/**
 * Up and down move between the top result, the recent searches and the song rows (a row's first control takes focus).
 * Up from the first one goes back to the search box, which sends Down to the first one.
 */
function arrowNav(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const stops = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[data-search-stop], [data-search-rows] > li')
  );
  const i = stops.findIndex((el) => el.contains(document.activeElement));
  if (i < 0) return;
  e.preventDefault();
  const next = stops[i + (e.key === 'ArrowDown' ? 1 : -1)];
  const target = next?.matches('li') ? next.querySelector<HTMLElement>('button:not([tabindex="-1"])') : next;
  if (target) target.focus();
  else if (!next && e.key === 'ArrowUp') document.querySelector<HTMLElement>('[data-search-input]')?.focus();
}

type AddToQueue = (item: SonosItem, position?: number, opts?: { attribute?: boolean }) => void;

export const searchKeys = {
  query: (q: string) => ['search', q] as const,
};

export const searchQueryOptions = (q: string) =>
  queryOptions({
    queryKey: searchKeys.query(q),
    queryFn: async () => {
      const r = await api.search.serviceQuery(q, { count: 50 });
      if (r.error || !r.data) throw new Error(String(r.error ?? 'No results payload'));
      return { query: q, items: dedupeTracks(parseServiceSearch(r.data)) };
    },
    enabled: !!q,
    staleTime: STALE.twoMinutes,
    retry: 1,
  });

/** Search runs from the nav's search box, which writes ?q= as you type. This page reads it. */
export function SearchPanel({ onAddToQueue }: { onAddToQueue: AddToQueue }) {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();

  // Keyed by the query; the last results stay up (dimmed) while the next ones load.
  // An error stays an error (not "no results"), so it can say so and offer Retry.
  const { data, isFetching, isPlaceholderData, isError, refetch } = useQuery({
    ...searchQueryOptions(q),
    placeholderData: keepPreviousData,
  });
  const settled = !!data && !isPlaceholderData && !isFetching;
  const count = data?.items.length ?? 0;

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`} onKeyDown={arrowNav}>
        {q && <h1 className={styles.srOnly}>Results for ‘{q}’</h1>}
        <p className={styles.srOnly} aria-live="polite">
          {q && isError
            ? 'Search failed'
            : q && settled
              ? count
                ? `${count} result${count === 1 ? '' : 's'}`
                : 'No results'
              : ''}
        </p>
        {!q ? (
          <SearchHome onAddToQueue={onAddToQueue} />
        ) : isError && !isFetching ? (
          <div className={styles.msg}>
            <p>Search didn’t go through. The music service may be busy.</p>
            <PillButton className={styles.retry} onClick={() => void refetch()}>
              Retry
            </PillButton>
          </div>
        ) : !data ? (
          <ResultsSkeleton />
        ) : (
          <div className={`${styles.body} ${isPlaceholderData ? styles.stale : ''}`} aria-busy={isFetching}>
            {data.items.length === 0 ? (
              !isFetching && (
                <>
                  <div className={styles.msg}>
                    <p className={styles.msgTitle}>No results for ‘{data.query}’</p>
                    <p>Check the spelling, or try fewer words: just the song or the artist.</p>
                  </div>
                  <RecentSearches />
                </>
              )
            ) : (
              <SearchResults
                key={data.query}
                query={data.query}
                results={data.items}
                onAddToQueue={onAddToQueue}
                onEngage={() => addRecentSearch(data.query)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Before anything is typed: this viewer's recent searches, and a few things the office has never played. */
function SearchHome({ onAddToQueue }: { onAddToQueue: AddToQueue }) {
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const [recentCount] = useState(() => getRecentSearches().length);

  // The same set as Home's picks (same query keys), so after Home this costs nothing.
  const { data: presence } = useOfficePresence();
  const roomKey = (presence?.inOffice ?? []).join(',');
  const djOpts = useMemo(() => ({ users: roomKey ? roomKey.split(',') : [], limit: 25 }), [roomKey]);
  const { data: djSet } = useDjSet(djOpts);
  const { discoveries } = useDjDiscoveries(djSet?.artists);
  const fresh = discoveries.slice(0, 12);

  return (
    <div className={styles.body}>
      <RecentSearches />

      {fresh.length > 0 && (
        <SectionCard>
          {/* One row at tile size that scrolls, like the result shelves, rather than six tiles stretched to fill a wide window. */}
          <Carousel
            title="New to the office"
            gap="1.4em"
            actions={<SeeAll label="More in Discover" onClick={() => navigate('/discover')} />}
          >
            {fresh.map((d) => {
              const t = d.track;
              return (
                <div key={t.id.objectId} className={styles.freshCell}>
                  <ImageTile
                    title={t.title}
                    sub={d.artist}
                    imageUrl={t.artUrl}
                    onOpen={() =>
                      t.albumId
                        ? openItem(albumItem(t.albumName ?? t.title, { ...t.id, objectId: t.albumId }))
                        : openItem(t.raw)
                    }
                    onAdd={() => onAddToQueue(t.raw, -1, { attribute: false })}
                  />
                </div>
              );
            })}
          </Carousel>
        </SectionCard>
      )}

      {recentCount === 0 && fresh.length === 0 && <p className={styles.msg}>Find a song, artist or album.</p>}
    </div>
  );
}

/** This viewer's recent searches as pills; nothing when there are none. */
function RecentSearches() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState(getRecentSearches);
  if (recent.length === 0) return null;
  return (
    <SectionCard
      title="Recent searches"
      actions={<SeeAll label="Clear" onClick={() => setRecent(clearRecentSearches())} />}
    >
      <ul className={styles.recents}>
        {recent.map((s) => (
          <li key={s}>
            <button
              type="button"
              className={styles.recent}
              data-search-stop=""
              onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`, { replace: true })}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** The results layout at its real size: top result beside five rows. */
function ResultsSkeleton() {
  return (
    <div className={styles.skelLead} aria-busy="true" aria-label="Searching">
      <div className={`skeleton ${styles.skelCard}`} />
      <div className={styles.skelRows}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`skeleton ${styles.skelRow}`} />
        ))}
      </div>
    </div>
  );
}
