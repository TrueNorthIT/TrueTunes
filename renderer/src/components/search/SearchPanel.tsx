import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/sonosApi';
import { parseServiceSearch } from '../../lib/itemHelpers';
import { dedupeTracks } from '../../lib/searchResults';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../../lib/recentSearches';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useOfficePresence } from '../../hooks/useOfficePresence';
import { useDjSet } from '../../hooks/useDjSet';
import { useDjDiscoveries } from '../../hooks/useDjDiscoveries';
import { ImageTile } from '../common/ImageTile';
import { SectionCard, SeeAll } from '../common/SectionCard';
import { SearchResults } from './SearchResults';
import type { ServiceSearch } from '../../types/ServiceSearch';
import type { SonosItem } from '../../types/sonos';
import styles from './SearchPanel.module.css';

/**
 * Up and down move between the top result, the recent searches and the song rows (a row's first control takes focus).
 * Up from the first one goes back to the search box, which sends Down to the first one.
 */
function arrowNav(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const stops = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-search-stop], [data-search-rows] > li'));
  const i = stops.findIndex((el) => el.contains(document.activeElement));
  if (i < 0) return;
  e.preventDefault();
  const next = stops[i + (e.key === 'ArrowDown' ? 1 : -1)];
  const target = next?.matches('li') ? next.querySelector<HTMLElement>('button:not([tabindex="-1"])') : next;
  if (target) target.focus();
  else if (!next && e.key === 'ArrowUp') document.querySelector<HTMLElement>('[data-search-input]')?.focus();
}

type AddToQueue = (item: SonosItem, position?: number, opts?: { attribute?: boolean }) => void;

/** Search runs from the nav's search box, which writes ?q= as you type. This page reads it. */
export function SearchPanel({ onAddToQueue }: { onAddToQueue: AddToQueue }) {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();

  // Keyed by the query; the last results stay up (dimmed) while the next ones load.
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['search', q],
    queryFn: async () => {
      const r = await api.search.serviceQuery(q, { count: 50 });
      return { query: q, items: r.error ? [] : dedupeTracks(parseServiceSearch(r.data as ServiceSearch)) };
    },
    enabled: !!q,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
  });

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`} onKeyDown={arrowNav}>
        {!q ? (
          <SearchHome onAddToQueue={onAddToQueue} />
        ) : !data ? (
          <ResultsSkeleton />
        ) : (
          <div className={`${styles.body} ${isPlaceholderData ? styles.stale : ''}`} aria-busy={isFetching}>
            {data.items.length === 0 ? (
              !isFetching && <p className={styles.msg}>No results for ‘{data.query}’</p>
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
  const [recent, setRecent] = useState(getRecentSearches);

  // The same set as Home's picks (same query keys), so after Home this costs nothing.
  const { data: presence } = useOfficePresence();
  const roomKey = (presence?.inOffice ?? []).join(',');
  const djOpts = useMemo(() => ({ users: roomKey ? roomKey.split(',') : [], limit: 25 }), [roomKey]);
  const { data: djSet } = useDjSet(djOpts);
  const { discoveries } = useDjDiscoveries(djSet?.artists);
  const fresh = discoveries.slice(0, 6);

  return (
    <div className={styles.body}>
      {recent.length > 0 && (
        <SectionCard title="Recent searches" actions={<SeeAll label="Clear" onClick={() => setRecent(clearRecentSearches())} />}>
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
      )}

      {fresh.length > 0 && (
        <SectionCard title="New to the office" actions={<SeeAll label="More in Discover" onClick={() => navigate('/discover')} />}>
          <div className={styles.freshGrid}>
            {fresh.map((d) => {
              const t = d.track;
              return (
                <ImageTile
                  key={t.id.objectId}
                  title={t.title}
                  sub={d.artist}
                  imageUrl={t.artUrl}
                  onOpen={() =>
                    t.albumId
                      ? openItem({ title: t.albumName ?? t.title, type: 'ITEM_ALBUM', resource: { type: 'ALBUM', id: { ...t.id, objectId: t.albumId } } })
                      : openItem(t.raw)
                  }
                  onAdd={() => onAddToQueue(t.raw, -1, { attribute: false })}
                />
              );
            })}
          </div>
        </SectionCard>
      )}

      {recent.length === 0 && fresh.length === 0 && <p className={styles.msg}>Find a song, artist or album.</p>}
    </div>
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
