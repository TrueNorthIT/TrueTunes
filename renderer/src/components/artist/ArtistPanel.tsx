import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useArtistBrowse } from '../../hooks/useArtistBrowse';
import { useAlbumBrowse } from '../../hooks/useAlbumBrowse';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useResolveAndOpen } from '../../hooks/useResolveAndOpen';
import { useStats } from '../../hooks/useStats';
import { useImage } from '../../hooks/useImage';
import { useDominantColor } from '../../hooks/useDominantColor';
import { withArtworkSize } from '../../lib/artworkUrl';
import { usePhotoState } from '../../lib/photoPlaceholder';
import { usePageArt } from '../../lib/pageArt';
import { heroPortrait, creditNames } from '../../lib/artistHero';
import { officeCountFor } from '../../lib/artistOffice';
import { resolveArtistParams, getItemArt } from '../../lib/itemHelpers';
import { TopSongRow } from './TopSongRow';
import { LatestReleaseCard } from './LatestReleaseCard';
import { ArtistBanner } from './ArtistBanner';
import { ArtistAbout } from './ArtistAbout';
import { ArtistAlbumCard } from './ArtistAlbumCard';
import { ArtistAlbumStack, ArtistAlbumGroup } from './ArtistAlbumStack';
import { Carousel } from '../common/Carousel';
import { SectionCard } from '../common/SectionCard';
import { PillButton } from '../common/PillButton';
import { useReleaseTrackCounts } from '../../hooks/useReleaseTrackCounts';
import { useReleaseYears } from '../../hooks/useReleaseYears';
import { useReleaseTracklists } from '../../hooks/useReleaseTracklists';
import { filterShelves } from '../../lib/shelfSearch';
import { groupReleases, latestRelease, releaseKey, sortShelvesByYear, type ReleaseGroup } from '../../lib/releaseShelves';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';
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

// Top songs page by whole columns, so a scroll never stops on a column showing only its ranks.
const SNAP_ROW = { scrollSnapType: 'x mandatory', scrollPaddingInline: '4px' } as const;

interface Props {
  onAddToQueue: (item: SonosItem) => void;
  currentTrackName: string;
  isPlaybackActive: boolean;
}

export function ArtistPanel({ onAddToQueue, currentTrackName, isPlaybackActive }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();
  const navigate = useNavigate();
  const { resolveAndOpen } = useResolveAndOpen();

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

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);

  const visibleSongs = data?.topSongs ?? [];

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

  const releases = data?.albums ?? [];
  const { counts, isLoading: countsLoading } = useReleaseTrackCounts(releases);
  const { years } = useReleaseYears(releases, name);
  const sortedShelves = sortShelvesByYear(groupReleases(releases, counts), years);
  const latestAlbum = latestRelease(sortedShelves, years) ?? releases[0] ?? null;
  const latestId = latestAlbum?.resource?.id;
  const { data: latestData } = useAlbumBrowse(latestId?.objectId, latestId?.serviceId, latestId?.accountId, latestAlbum?.resource?.defaults);

  const { data: stats } = useStats('alltime', undefined, 100);
  const officeCount = officeCountFor(stats?.topArtists, artistId, name);

  // The hero's portrait, and with it the page's colour: the photo once it is known to be real, else the latest
  // cover, else a top song's art. Checked once, here; while unknown the hero keeps its shape and shows nothing.
  const photoUrl = imageUrl ? withArtworkSize(imageUrl) : null;
  const { state: photoState, src: photoSrc } = usePhotoState(photoUrl);
  const latestArt = latestAlbum ? getItemArt(latestAlbum) : null;
  const portrait = heroPortrait(
    photoState,
    photoUrl,
    latestArt && withArtworkSize(latestArt, 600),
    visibleSongs.map(s => s.artUrl && withArtworkSize(s.artUrl, 600)),
  );
  const printSrc = useImage(portrait?.kind === 'print' ? portrait.url : null);
  const portraitSrc = portrait?.kind === 'photo' ? photoSrc : printSrc;
  const wash = useDominantColor(portraitSrc, { setGlobal: true });
  usePageArt(portraitSrc);
  // These open the playlist pages: navigation only, nothing is queued from the hero.
  const radio = data?.playlists.find(p => /radio/i.test(p.title ?? ''));
  const shuffle = data?.playlists.find(p => /shuffle/i.test(p.title ?? ''));

  function openTrackAlbum(track: AlbumTrack) {
    const { albumId, albumName, id } = track;
    if (albumId) {
      openItem({
        title: albumName ?? track.title,
        type: 'ITEM_ALBUM',
        resource: { type: 'ALBUM', id: { objectId: albumId, serviceId: id.serviceId ?? '', accountId: id.accountId ?? '' } },
      } as SonosItem);
    } else {
      void resolveAndOpen(albumName || track.title, 'album', { artist: name, serviceId: id.serviceId, accountId: id.accountId });
    }
  }
  const openArtistByName = (artist: string) => void resolveAndOpen(artist, 'artist');

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
  // Expanding unmounts the focused stack and collapsing unmounts the focused ✕, so hand focus on explicitly.
  const [stackEls] = useState(() => new Map<string, HTMLElement>());
  const [closeEls] = useState(() => new Map<string, HTMLElement>());
  const pendingFocus = useRef<{ key: string; to: 'close' | 'stack' } | null>(null);
  const refFor = (map: Map<string, HTMLElement>, key: string) => (el: HTMLElement | null) => {
    if (el) map.set(key, el);
    else map.delete(key);
  };
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    pendingFocus.current = null;
    (p.to === 'close' ? closeEls : stackEls).get(p.key)?.focus();
  }, [expanded, stackEls, closeEls]);
  const toggleGroup = (key: string) => {
    pendingFocus.current = { key, to: expanded.has(key) ? 'stack' : 'close' };
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          artistName={name}
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
          innerRef={refFor(stackEls, key)}
          artistName={name}
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
        closeRef={refFor(closeEls, key)}
        artistName={name}
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

  const isEmpty = !isLoading && visibleSongs.length === 0 && releases.length === 0;
  const credits = creditNames(name);

  return (
    <div className={`page-scale ${styles.panel}`}>
      <ArtistBanner
        name={name}
        altNames={altNames}
        portrait={portrait}
        portraitSrc={portraitSrc}
        wash={wash}
        officeCount={officeCount}
        radio={radio}
        shuffle={shuffle}
        onOpen={openItem}
      />

      {isEmpty ? (
        <div className={`${styles.band} ${styles.empty}`}>
          <p className={styles.emptyText}>
            {credits.length > 1
              ? 'A shared credit, with nothing filed under it on its own. Each artist has a page:'
              : 'Nothing is filed under this name yet.'}
          </p>
          <div className={styles.emptyActions}>
            {credits.length > 1
              ? credits.slice(0, 6).map(n => <PillButton key={n} onClick={() => openArtistByName(n)}>{n}</PillButton>)
              : (
                <PillButton onClick={() => navigate(`/search?q=${encodeURIComponent(name)}`)}>
                  <Search size={16} aria-hidden="true" />
                  Search for {name}
                </PillButton>
              )}
          </div>
        </div>
      ) : (
        <div className={`${styles.band} ${styles.topBand}`}>
          {isLoading ? (
            <>
              <div className={`skeleton ${styles.skeletonTile}`} />
              <div className={styles.songsSkeleton}>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className={`skeleton ${styles.skeletonRow}`} />)}
              </div>
            </>
          ) : (
            <>
              {latestAlbum && (
                <LatestReleaseCard
                  album={latestAlbum}
                  onOpen={openItem}
                  onAdd={onAddToQueue}
                  artistName={name}
                  year={years.get(releaseKey(latestAlbum))}
                  songCount={latestData?.totalTracks}
                  className={styles.latest}
                />
              )}
              {visibleSongs.length > 0 && (
                <SectionCard featured wash={wash} className={styles.topSongs}>
                  <Carousel title="Top songs" rowStyle={SNAP_ROW}>
                    <ol className={`${styles.songsList}${visibleSongs.length <= 5 ? ' ' + styles.songsFew : ''}`}>
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
                          onOpenAlbum={openTrackAlbum}
                          onOpenArtist={openArtistByName}
                          artistName={name}
                        />
                      ))}
                    </ol>
                  </Carousel>
                </SectionCard>
              )}
            </>
          )}
        </div>
      )}

      {/* Shelves sit on the page (Carousel rows on the 28px gutter), not in cards. */}
      {releases.length > 1 && (countsLoading ? (
        <div className={`${styles.band} ${styles.shelfSkeleton}`}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
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
                  className={`${styles.band} ${styles.shelf}`}
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
            <div className={`${styles.band} ${styles.noMatch}`}>{tracksLoading ? 'Still searching tracks…' : <>No releases match “{query.trim()}”</>}</div>
          )}
        </>
      ))}

      <ArtistAbout name={name} blurb={blurb} instagram={genius?.instagram} twitter={genius?.twitter} />
    </div>
  );
}
