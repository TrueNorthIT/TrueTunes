import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useImage } from '../../hooks/useImage';
import { useArtistBrowse } from '../../hooks/useArtistBrowse';
import { useDominantColor } from '../../hooks/useDominantColor';
import { useOpenItem } from '../../hooks/useOpenItem';
import { resolveArtistParams } from '../../lib/itemHelpers';
import { TopSongRow } from './TopSongRow';
import { LatestReleaseCard } from './LatestReleaseCard';
import { ArtistAlbumCard } from './ArtistAlbumCard';
import { ArtistAlbumStack, ArtistAlbumGroup } from './ArtistAlbumStack';
import { Carousel } from '../common/Carousel';
import { useReleaseTrackCounts } from '../../hooks/useReleaseTrackCounts';
import { useReleaseYears } from '../../hooks/useReleaseYears';
import { useReleaseTracklists } from '../../hooks/useReleaseTracklists';
import { filterShelves } from '../../lib/shelfSearch';
import { groupReleases, releaseKey, sortShelvesByYear, type ReleaseGroup } from '../../lib/releaseShelves';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/ArtistPanel.module.css';

// "Man Alive (Deluxe)" -> "Man Alive"
function baseName(title = ''): string {
  return title.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').replace(/ - .*$/, '').trim() || title;
}

function domToText(node: GeniusDomNode): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(domToText).join('');
}

function extractBio(description: GeniusDomNode | null): string {
  if (!description || typeof description === 'string') return '';
  const root = description as { tag: string; children?: GeniusDomNode[] };
  const paras = (root.children ?? []).filter(
    c => typeof c !== 'string' && (c as { tag: string }).tag === 'p',
  );
  return paras
    .map(p => domToText(p as GeniusDomNode).trim())
    .filter(Boolean)
    .join('\n\n');
}

interface Props {
  onAddToQueue: (item: SonosItem) => void;
  currentTrackName: string;
  isPlaybackActive: boolean;
}

export function ArtistPanel({ onAddToQueue, currentTrackName, isPlaybackActive }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();

  const { artistId, serviceId, accountId, defaults, name: fallbackName } =
    item
      ? resolveArtistParams(item)
      : { artistId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined, name: undefined };

  const { data, isLoading } = useArtistBrowse(
    artistId,
    serviceId,
    accountId,
    defaults,
    fallbackName ?? (item?.title as string | undefined) ?? (item?.name as string | undefined),
  );

  const name = data?.name ?? fallbackName ?? item?.title ?? item?.name ?? '';
  const imageUrl =
    data?.imageUrl ??
    (item?.images as Record<string, string> | undefined)?.['tile1x1'] ??
    item?.imageUrl ??
    null;

  const [showAllSongs, setShowAllSongs] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);

  const visibleSongs = showAllSongs ? (data?.topSongs ?? []) : (data?.topSongs.slice(0, 10) ?? []);

  function handleTrackClick(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, index);
      const hi = Math.max(lastSelected.current, index);
      setSelected(prev => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      lastSelected.current = index;
    } else {
      if (selected.size === 1 && selected.has(index)) {
        setSelected(new Set());
        lastSelected.current = null;
      } else {
        setSelected(new Set([index]));
        lastSelected.current = index;
      }
    }
  }

  function handleDragStart(index: number, e: React.DragEvent) {
    const toMove = selected.has(index) ? [...selected].sort((a, b) => a - b) : [index];
    if (!selected.has(index)) { setSelected(new Set([index])); lastSelected.current = index; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(toMove.map(i => visibleSongs[i].raw)));
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed', top: '-100px', left: '0',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      color: '#fff', padding: '5px 12px', borderRadius: '6px',
      fontSize: '12px', fontWeight: '600', pointerEvents: 'none', whiteSpace: 'nowrap',
    });
    ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : visibleSongs[index].title;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    setTimeout(() => ghost.remove(), 0);
  }

  const cachedArt     = useImage(imageUrl);
  const dominantColor = useDominantColor(cachedArt, { setGlobal: true });

  const latestAlbum = data?.albums[0] ?? null;

  const releases = data?.albums ?? [];
  const { counts, isLoading: countsLoading } = useReleaseTrackCounts(releases);
  const { years } = useReleaseYears(releases, name);
  const sortedShelves = sortShelvesByYear(groupReleases(releases, counts), years);
  const [query, setQuery] = useState('');
  const [tracksEnabled, setTracksEnabled] = useState(false); // on from the box's first focus, for the page's life
  const { tracksByRelease, isLoading: tracksLoading } = useReleaseTracklists(releases, tracksEnabled);
  const { shelves, trackHits } = filterShelves(sortedShelves, query, tracksByRelease);
  const searching = query.trim() !== '';
  // expanded state is keyed by the unfiltered group's primary, so filtering never collapses a group
  const groupKeyOf = new Map<string, string>();
  [...sortedShelves.albums, ...sortedShelves.singles, ...sortedShelves.other].forEach(g =>
    g.versions.forEach(v => groupKeyOf.set(releaseKey(v), releaseKey(g.primary))),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function renderGroup(group: ReleaseGroup) {
    const primaryKey = releaseKey(group.primary);
    const key = groupKeyOf.get(primaryKey) ?? primaryKey;
    if (group.versions.length === 1) {
      return (
        <ArtistAlbumCard
          key={key}
          album={group.primary}
          onOpen={openItem}
          onAdd={onAddToQueue}
          year={years.get(primaryKey)}
          trackHits={trackHits.get(primaryKey)}
          searching={searching}
        />
      );
    }
    if (!expanded.has(key)) {
      return (
        <ArtistAlbumStack
          key={key}
          group={group}
          onExpand={() => toggleGroup(key)}
          year={years.get(primaryKey)}
          trackHits={trackHits.get(primaryKey)}
          searching={searching}
        />
      );
    }
    return (
      <ArtistAlbumGroup
        key={key}
        group={group}
        title={baseName(group.primary.title)}
        onCollapse={() => toggleGroup(key)}
        onOpen={openItem}
        onAdd={onAddToQueue}
        years={years}
        trackHits={trackHits}
        searching={searching}
      />
    );
  }

  const genius          = data?.genius ?? null;
  const blurb           = genius ? extractBio(genius.description) : '';
  const altNames        = genius?.alternateNames?.filter(Boolean).slice(0, 4) ?? [];
  if (!item) return null;

  return (
    <div className={styles.panel}>
      <div
        key={artistId}
        className={styles.header}
        style={
          dominantColor
            ? { background: `linear-gradient(180deg, rgba(${dominantColor},0.55) 0%, rgba(${dominantColor},0.2) 60%, transparent 100%)`, transition: 'background 0.8s ease' }
            : undefined
        }
      >
        <div className={styles.headerRow}>
          <div className={styles.headerArtWrap}>
            {cachedArt
              ? <img className={styles.headerArt} src={cachedArt} alt="" />
              : <div className={styles.headerArtPh} />}
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.artistName}>{name}</div>
            {altNames.length > 0 && (
              <div className={styles.altNames}>{altNames.join(' · ')}</div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        {isLoading ? (
          <>
            <div className={styles.topSongsCol}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skeletonRow} />)}
            </div>
            <div className={styles.sideCol}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.topSongsCol}>
              {data && data.topSongs.length > 0 && (
                <>
                  <button
                    className={styles.sectionTitleBtn}
                    onClick={() => { setShowAllSongs(s => !s); setSelected(new Set()); }}
                  >
                    Top Songs <span className={styles.sectionChevron}>{showAllSongs ? '∨' : '›'}</span>
                  </button>
                  {visibleSongs.map((track, i) => (
                    <TopSongRow
                      key={track.id.objectId ?? i}
                      track={track}
                      index={i}
                      isSelected={selected.has(i)}
                      isCurrentTrack={track.title === currentTrackName}
                      isPlaybackActive={isPlaybackActive}
                      onAdd={onAddToQueue}
                      onClick={handleTrackClick}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </>
              )}
            </div>

            <div className={styles.sideCol}>
              {blurb && (
                <div className={styles.aboutSection}>
                  <div className={styles.sectionTitle}>About</div>
                  {blurb.split('\n\n').map((para, i) => (
                    <p key={i} className={styles.aboutText}>{para}</p>
                  ))}
                </div>
              )}
              {(genius?.instagram || genius?.twitter) && (
                <div className={styles.socialSection}>
                  <div className={styles.socialIcons}>
                    {genius.instagram && (
                      <button className={styles.socialIconBtn} title={`@${genius.instagram}`} onClick={() => window.sonos.openExternal(`https://instagram.com/${genius.instagram}`)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                          <circle cx="12" cy="12" r="4"/>
                          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                        </svg>
                      </button>
                    )}
                    {genius.twitter && (
                      <button className={styles.socialIconBtn} title={`@${genius.twitter}`} onClick={() => window.sonos.openExternal(`https://twitter.com/${genius.twitter}`)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.261 5.635 5.903-5.635zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
              {latestAlbum && <LatestReleaseCard album={latestAlbum} onOpen={openItem} />}
            </div>
          </>
        )}
      </div>

      {data && data.albums.length > 1 && (
        <div className={styles.albumsSection}>
          {countsLoading ? (
            <div className={styles.shelfSkeleton}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skeletonCard} />)}
            </div>
          ) : (
            <>
              {(() => {
                const defs = [
                  ['Albums', 'albums'],
                  ['Singles & EPs', 'singles'],
                  ['Other versions', 'other'],
                ] as const;
                // the search box lives on the first shelf that has releases before filtering, so it never disappears
                const boxShelf = defs.find(([, k]) => sortedShelves[k].length > 0)?.[1];
                return defs.map(([title, k]) => {
                  const groups = shelves[k];
                  const hasBox = k === boxShelf;
                  if (groups.length === 0 && !hasBox) return null;
                  return (
                    <Carousel
                      key={title}
                      title={title}
                      className={styles.shelf}
                      search={hasBox ? {
                        value: query,
                        onChange: setQuery,
                        placeholder: 'Search releases and tracks',
                        onFocus: () => setTracksEnabled(true),
                        status: searching && tracksLoading ? 'searching tracks…' : undefined,
                      } : undefined}
                    >
                      {groups.map(renderGroup)}
                    </Carousel>
                  );
                });
              })()}
              {searching && !shelves.albums.length && !shelves.singles.length && !shelves.other.length && (
                <div className={styles.noMatch}>No releases match “{query.trim()}”</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
