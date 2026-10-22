import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ListPlus, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/sonosApi';
import {
  extractItems,
  parseServiceSearch,
  resolveAlbumParams,
  resolveArtistParams,
  isAlbum,
  isArtist,
  isContainer,
  isPlaylist,
  isProgram,
  getName,
  getItemArt,
  browseSub,
  isPodcast,
} from '../lib/itemHelpers';
import {
  capPerArtist,
  geniusFirstParagraph,
  indicesToUndo,
  neverPlayedTag,
  pickReason,
  dedupeArtists,
  jumpBackIn,
  picksByPerson,
  primaryArtistName,
  relativeDay,
  statsAlbumToItem,
  statsTrackToItem,
} from '../lib/homeData';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed';
import { useRecentTracksByUser } from '../hooks/useRecentTracksByUser';
import { useUsers } from '../hooks/useUsers';
import { useStats } from '../hooks/useStats';
import { useOfficePresence } from '../hooks/useOfficePresence';
import { useDjSet } from '../hooks/useDjSet';
import { useDjDiscoveries } from '../hooks/useDjDiscoveries';
import { useDailyGame, useMyScore } from '../hooks/useDailyGame';
import { useImage } from '../hooks/useImage';
import { useDominantColor } from '../hooks/useDominantColor';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { activeLyricIndex, lyricElapsedMs, useLyrics } from '../hooks/useLyrics';
import { useAttribution, resolveAttribution } from '../hooks/useAttribution';
import { useGeniusDescription } from '../hooks/useGeniusDescription';
import type { PlaybackState } from '../hooks/usePlayback';
import { useToast } from './common/Toast';
import { getActiveProvider } from '../providers';
import type { NormalizedQueueItem } from '../types/provider';
import { withArtworkSize } from '../lib/artworkUrl';
import { UserAvatar } from './common/UserAvatar';
import { useTrackContextMenu } from './common/ContextMenu';
import type { ServiceSearch } from '../types/ServiceSearch';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { artistImageQueryOptions, artistQueryOptions } from '../hooks/useArtistBrowse';
import { Carousel } from './common/Carousel';
import { SearchResults } from './search/SearchResults';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

/** Everything Home needs to make a track navigable: album, artist, a queueable item, a context menu. */
interface NavTrack {
  title: string;
  artist: string;
  album?: string | null;
  albumId?: string | null;
  artistId?: string | null;
  serviceId?: string | null;
  accountId?: string | null;
  imageUrl?: string | null;
  uri?: string | null;
  item: SonosItem | null;
}

interface Nav {
  openAlbum: (t: NavTrack) => void;
  openArtist: (name: string, t: NavTrack, isFirst: boolean) => void;
  openAlbumItem: (item: SonosItem) => void;
  openArtistItem: (item: SonosItem) => void;
  prefetch: (t: NavTrack) => void;
  prefetchItem: (item: SonosItem) => void;
  menu: (t: NavTrack, e: React.MouseEvent) => void;
}

const noop = () => {};
const NavContext = createContext<Nav>({
  openAlbum: noop, openArtist: noop, openAlbumItem: noop, openArtistItem: noop, prefetch: noop, prefetchItem: noop, menu: noop,
});

/** StatsTrack and RecentTrack share every field Home needs. */
function navTrackFrom(t: Omit<StatsTrack, 'count'> & { count?: number }): NavTrack {
  return {
    title: t.trackName,
    artist: t.artist,
    album: t.album,
    albumId: t.albumId,
    artistId: t.artistId,
    serviceId: t.serviceId,
    accountId: t.accountId,
    imageUrl: t.imageUrl,
    uri: t.uri,
    item: statsTrackToItem(t),
  };
}

/** Open an artist; one without an id is resolved by name rather than opening /artist/_. */
function openArtistWith(
  item: SonosItem,
  openItem: (i: SonosItem) => void,
  resolveAndOpen: ReturnType<typeof useResolveAndOpen>['resolveAndOpen'],
) {
  const { artistId, serviceId, accountId } = resolveArtistParams(item);
  if (artistId) openItem(item);
  else void resolveAndOpen(getName(item), 'artist', { serviceId, accountId });
}

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.seeAll} onClick={onClick}>
      {label}
    </button>
  );
}

/** Each credited name is its own link; only the first can use the track's artist id. */
function ArtistLinks({ t }: { t: NavTrack }) {
  const nav = useContext(NavContext);
  const names = t.artist.split(/,\s*/).filter(Boolean);
  return (
    <span className={styles.artistLinks}>
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>
          {i > 0 && ', '}
          <button
            type="button"
            className={styles.artistBtn}
            aria-label={`${name}, open artist`}
            onClick={(e) => { e.stopPropagation(); nav.openArtist(name, t, i === 0); }}
          >
            {name}
          </button>
        </span>
      ))}
    </span>
  );
}

function TitleButton({ t }: { t: NavTrack }) {
  const nav = useContext(NavContext);
  return (
    <button
      type="button"
      className={styles.titleBtn}
      aria-label={`${t.title}, open album`}
      onClick={() => nav.openAlbum(t)}
    >
      {t.title}
    </button>
  );
}

interface TrackRowProps {
  t: NavTrack;
  reason?: string;
  onAdd?: () => void;
}

/** Compact row: art, "title — artist", muted reason line, and a + on hover or focus. */
function TrackRow({ t, reason, onAdd }: TrackRowProps) {
  const nav = useContext(NavContext);
  const art = useImage(t.imageUrl ?? null);
  return (
    <li className={styles.trackRow} onContextMenu={(e) => nav.menu(t, e)} onMouseEnter={() => nav.prefetch(t)}>
      <button type="button" className={styles.artBtn} tabIndex={-1} aria-hidden="true" onClick={() => nav.openAlbum(t)}>
        {art ? <img className={styles.trackArt} src={art} alt="" loading="lazy" /> : <span className={styles.trackArtPh} />}
      </button>
      <div className={styles.trackText}>
        <div className={styles.trackLine}>
          <span className={styles.trackTitle}><TitleButton t={t} /></span>
          <span className={styles.trackArtist}><span className={styles.dash}> — </span><ArtistLinks t={t} /></span>
        </div>
        {reason && <div className={styles.reason}>{reason}</div>}
      </div>
      {onAdd && (
        <button type="button" className={styles.addBtn} onClick={onAdd} aria-label={`Add ${t.title} to queue`}>
          <Plus size={16} />
        </button>
      )}
    </li>
  );
}

interface ArtCardProps {
  size: 'large' | 'medium';
  label: string;
  t: NavTrack;
  photoUrl?: string | null;
  onAdd: () => void;
}

/** The artwork is the card: title and artist sit on a soft scrim over the lower part. */
function ArtCard({ size, label, t, photoUrl, onAdd }: ArtCardProps) {
  const nav = useContext(NavContext);
  // Large and medium cards are shown big, so ask the service for a bigger image.
  // The album cover is always there; the artist photo fades in over it when it arrives, so a late photo never reshuffles the card.
  const px = size === 'large' ? 1200 : 800;
  const cover = useImage(t.imageUrl ? withArtworkSize(t.imageUrl, px) : null);
  const photo = useImage(photoUrl ? withArtworkSize(photoUrl, px) : null);
  return (
    <div
      className={`${styles.artCard} ${size === 'large' ? styles.artLarge : styles.artMedium}`}
      onContextMenu={(e) => nav.menu(t, e)}
      onMouseEnter={() => nav.prefetch(t)}
    >
      {cover && <img className={styles.artFill} src={cover} alt="" />}
      {photo && <img className={`${styles.artFill} ${styles.artPhoto}`} src={photo} alt="" />}
      <button type="button" className={styles.artCover} aria-label={`Open album ${t.album ?? t.title}`} onClick={() => nav.openAlbum(t)} />
      <span className={styles.artLabel}>{label}</span>
      <div className={styles.artCaption}>
        <div className={styles.artTitle}>{t.title}</div>
        <div className={styles.artSub}><ArtistLinks t={t} /></div>
      </div>
      <button type="button" className={styles.artAdd} onClick={onAdd} aria-label={`Add ${t.title} to queue`}>
        <Plus size={18} />
      </button>
    </div>
  );
}

/** Square collection tile with its name over the artwork. */
function ArtTile({ name, imageUrl, onOpen, onAdd }: {
  name: string; imageUrl?: string | null; onOpen?: () => void; onAdd?: () => void;
}) {
  const art = useImage(imageUrl ?? null);
  const inner = (
    <>
      {art ? <img className={styles.artFill} src={art} alt="" loading="lazy" /> : <span className={styles.artPh}>♪</span>}
      <span className={styles.tileName}>{name}</span>
    </>
  );
  return (
    <div className={styles.artTile}>
      {onOpen ? (
        <button type="button" className={styles.tileMain} onClick={onOpen} aria-label={name}>{inner}</button>
      ) : (
        <div className={styles.tileMain}>{inner}</div>
      )}
      {onAdd && (
        <button type="button" className={styles.tileAdd} onClick={onAdd} aria-label={`Add ${name} to queue`}>
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

function JumpTile({ label, sub, imageUrl, circular, onOpen, onHover }: {
  label: string; sub?: string | null; imageUrl?: string | null; circular?: boolean; onOpen: () => void; onHover?: () => void;
}) {
  const art = useImage(imageUrl ?? null);
  return (
    <button type="button" className={styles.jumpTile} onClick={onOpen} onMouseEnter={onHover}>
      <span className={circular ? styles.jumpArtRound : styles.jumpArt} aria-hidden="true">
        {art ? <img src={art} alt="" /> : <span className={styles.jumpArtPh}>♪</span>}
      </span>
      <span className={styles.jumpName}>{label}</span>
      {sub && <span className={styles.jumpSub}>{sub}</span>}
    </button>
  );
}

interface AlbumTileData {
  key: string;
  title: string;
  sub: string;
  when?: string;
  imageUrl?: string | null;
  open: () => void;
  hover: () => void;
  add?: () => void;
}

/** Square album art with title, artist and when it was played. Lifts on hover like Jump back in. */
function AlbumTile({ d }: { d: AlbumTileData }) {
  const art = useImage(d.imageUrl ?? null);
  return (
    <div className={styles.albumTile} onMouseEnter={d.hover}>
      <button type="button" className={styles.albumMain} onClick={d.open}>
        <span className={styles.albumArt} aria-hidden="true">
          {art ? <img src={art} alt="" loading="lazy" /> : <span className={styles.jumpArtPh}>♪</span>}
        </span>
        <span className={styles.albumTitle}>{d.title}</span>
        <span className={styles.albumSub}>{d.sub}</span>
        {d.when && <span className={styles.albumSub}>{d.when}</span>}
      </button>
      {d.add && (
        <button type="button" className={styles.albumAdd} onClick={d.add} aria-label={`Add ${d.title} to queue`}>
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}

/** Compact person header (tinted from their photo) over their most recent albums. */
function PersonCard({ user, imageUrl, count, noun, tiles, onOpen }: {
  user: string;
  imageUrl?: string | null;
  count: number;
  noun: string;
  tiles: AlbumTileData[];
  onOpen: () => void;
}) {
  const art = useImage(imageUrl ?? null);
  const color = useDominantColor(art);
  const wash = color ? { background: `linear-gradient(100deg, rgba(${color}, 0.32), rgba(${color}, 0) 75%)` } : undefined;
  return (
    <div className={styles.person}>
      <button type="button" className={styles.personHead} style={wash} onClick={onOpen} title={`Open ${user}'s profile`}>
        <UserAvatar name={user} imageUrl={imageUrl} className={styles.personAvatar} />
        <span className={styles.personWho}>
          <span className={styles.personName}>{user}</span>
          <span className={styles.personCount}>{count} {noun}{count === 1 ? '' : 's'} this week</span>
        </span>
      </button>
      <div className={styles.albumRow}>
        {tiles.map((d) => <AlbumTile key={d.key} d={d} />)}
      </div>
    </div>
  );
}

function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}` : `Good ${part}`;
}

function ChartRow({ rank, t, count, onAdd }: {
  rank: number; t: NavTrack; count: number; onAdd?: () => void;
}) {
  const nav = useContext(NavContext);
  const art = useImage(t.imageUrl ?? null);
  return (
    <li className={styles.chartRow} onContextMenu={(e) => nav.menu(t, e)} onMouseEnter={() => nav.prefetch(t)}>
      <span className={styles.rank}>{String(rank).padStart(2, '0')}</span>
      <span className={styles.chartTitleCell}>
        <button type="button" className={styles.artBtn} tabIndex={-1} aria-hidden="true" onClick={() => nav.openAlbum(t)}>
          {art ? <img className={styles.chartArt} src={art} alt="" loading="lazy" /> : <span className={styles.chartArtPh} />}
        </button>
        <span className={styles.chartTitle}><TitleButton t={t} /></span>
      </span>
      <span className={styles.chartArtist}><ArtistLinks t={t} /></span>
      <span className={styles.plays} title={`${count} times queued`}>{count}</span>
      {onAdd ? (
        <button type="button" className={styles.addBtn} onClick={onAdd} aria-label={`Add ${t.title} to queue`}>
          <Plus size={16} />
        </button>
      ) : (
        <span className={styles.addSpacer} />
      )}
    </li>
  );
}

/** Queuer avatar + name; opens their profile. */
function QueuerChip({ user, imageUrl, onOpen, prefix }: { user: string; imageUrl?: string | null; onOpen: () => void; prefix?: string }) {
  return (
    <button type="button" className={styles.queuerChip} onClick={onOpen} aria-label={`${prefix ?? ''}${user}, open profile`}>
      <UserAvatar name={user} imageUrl={imageUrl} className={styles.queuerAvatar} />
      <span>{prefix}{user}</span>
    </button>
  );
}

/** Now playing card and live synced lyrics. No transport controls: the player bar has them. */
function NowPlayingBand({ playback, imageByUser }: {
  playback: PlaybackState;
  imageByUser: Map<string, string | null | undefined>;
}) {
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const np = useNowPlaying(playback);
  const attribution = useAttribution();
  const sharp = useImage(np.artUrlRaw ? withArtworkSize(np.artUrlRaw, 600) : null);
  const art = sharp ?? np.cachedArt;
  const queuer = resolveAttribution(attribution, {
    id: np.currentObjectId,
    title: np.displayTrack,
    artist: np.displayArtist,
  });
  const profile = (user: string) => navigate(`/profile/${encodeURIComponent(user)}`);

  // First paragraph of the Genius description; hidden (no skeleton) until there is one.
  const { description, isLoading: aboutLoading } = useGeniusDescription(np.displayTrack, np.displayArtist);
  const blurb = geniusFirstParagraph(description);

  const lyr = useLyrics(np.displayTrack, np.displayArtist, np.albumName, np.durationMs);
  const activeLine = activeLyricIndex(lyr.lines, lyricElapsedMs(np.progressPct, np.durationMs));
  const plain = lyr.lines.length
    ? []
    : (lyr.plainLyrics ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
  const hasLyrics = lyr.lines.length > 0 || plain.length > 0;
  // Keep the box while the current track's lyrics resolve; hide only once settled with nothing.
  const lyricsPending = lyr.isLoading && !hasLyrics;
  const showLyrics = lyricsPending || hasLyrics;

  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrolledRef = useRef(false);
  useEffect(() => {
    const box = boxRef.current;
    const line = lineRefs.current[activeLine];
    if (!box || !line || activeLine < 0 || typeof box.scrollTo !== 'function') return;
    // Keep the active line about 40% of the way down the box.
    const target = line.offsetTop + line.offsetHeight / 2 - box.clientHeight * 0.4;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: Math.max(0, target), behavior: scrolledRef.current && !calm ? 'smooth' : 'auto' });
    scrolledRef.current = true;
  }, [activeLine]);

  const openAlbum = () =>
    np.albumItem
      ? openItem(np.albumItem)
      : void resolveAndOpen(np.albumName || np.displayTrack, 'album', { artist: np.displayArtist });
  const openArtist = () =>
    np.artistItem ? openItem(np.artistItem) : void resolveAndOpen(primaryArtistName(np.displayArtist), 'artist');
  const openLyrics = () => navigate('/lyrics');

  return (
    <section
      className={`${styles.band}${showLyrics ? '' : ' ' + styles.bandSolo}`}
      aria-label="Now playing"
    >
      <div
        className={styles.nowCard}
        style={np.dominantColor ? ({ '--wash': np.dominantColor } as React.CSSProperties) : undefined}
      >
        <button
          type="button"
          className={styles.nowArt}
          onClick={openAlbum}
          onMouseEnter={np.prefetchAlbum}
          aria-label={`Open album ${np.albumName ?? np.displayTrack}`}
        >
          {art ? <img src={art} alt="" /> : <span className={styles.jumpArtPh}>♪</span>}
        </button>
        <div className={styles.nowInfo}>
          <span className={styles.nowLabel}>Now playing</span>
          <h2 className={styles.nowTitle}>
            <button type="button" className={styles.titleBtn} onClick={openAlbum} onMouseEnter={np.prefetchAlbum} aria-label={`${np.displayTrack}, open album`}>
              {np.displayTrack}
            </button>
          </h2>
          <div className={styles.nowMeta}>
            <button type="button" className={`${styles.artistBtn} ${styles.metaArtist}`} onClick={openArtist} aria-label={`${np.displayArtist}, open artist`}>
              {np.displayArtist}
            </button>
            {np.albumName && (
              <>
                <span className={styles.metaDot} aria-hidden="true">·</span>
                <button type="button" className={`${styles.artistBtn} ${styles.metaAlbum}`} onClick={openAlbum} aria-label={`${np.albumName}, open album`}>{np.albumName}</button>
              </>
            )}
          </div>
          {queuer && (
            <QueuerChip user={queuer.user} imageUrl={imageByUser.get(queuer.user)} onOpen={() => profile(queuer.user)} prefix="Queued by " />
          )}
          <div className={styles.nowProgress}>
            <span className={styles.nowTime}>{np.elapsedLabel}</span>
            <div className={styles.nowBar} role="progressbar" aria-label="Track progress" aria-valuenow={Math.round(np.progressPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.nowFill} style={{ transform: `scaleX(${Math.min(1, Math.max(0, np.progressPct / 100))})` }} />
            </div>
            <span className={styles.nowTime}>{np.durationLabel}</span>
          </div>
          {aboutLoading && !blurb && (
            <div className={styles.about} aria-label="About this track" aria-busy="true">
              {['100%', '92%', '58%'].map((w) => <span key={w} className={styles.aboutSkel} style={{ width: w }} />)}
            </div>
          )}
          {blurb && (
            <div className={styles.about} aria-label="About this track">
              <p className={styles.aboutText}>{blurb}</p>
            </div>
          )}
        </div>
      </div>

      {showLyrics && (
        <div
          className={styles.lyricsBox}
          role="button"
          tabIndex={0}
          aria-label="Lyrics, open full lyrics"
          aria-busy={lyricsPending}
          onClick={openLyrics}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openLyrics();
            }
          }}
        >
          <span className={styles.nowLabel}>Lyrics</span>
          <span className={styles.lyricsOpen} aria-hidden="true">
            <ArrowUpRight size={18} />
          </span>
          <div ref={boxRef} className={styles.lyricsScroll}>
            {lyricsPending ? (
              <div className={styles.lyricsSkel}>
                {['70%', '55%', '80%', '45%', '65%'].map((w) => <span key={w} className={styles.lyricSkel} style={{ width: w }} />)}
              </div>
            ) : lyr.lines.length > 0 ? (
              <div className={styles.lyricsPad}>
                {lyr.lines.map((line, i) => (
                  <div
                    key={i}
                    ref={(el) => { lineRefs.current[i] = el; }}
                    className={`${styles.lyricLine}${i === activeLine ? ' ' + styles.lyricActive : ''}`}
                    style={activeLine >= 0 ? { opacity: Math.max(0.18, 1 - Math.abs(i - activeLine) * 0.24) } : undefined}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.lyricsPad}>
                {plain.map((l, i) => <div key={i} className={`${styles.lyricLine} ${styles.lyricPlain}`}>{l}</div>)}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface Props {
  isAuthed: boolean;
  onAddToQueue: (item: SonosItem, position?: number, opts?: { attribute?: boolean }) => void;
  ytm: YtmSections | undefined;
  ytmLoading: boolean;
  displayName?: string | null;
  /** Live playback and queue, for the Now playing band. Without a current track the band is hidden. */
  playback?: PlaybackState;
  /** The live queue, so Queue all can be undone. */
  queueItems?: NormalizedQueueItem[];
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

  // Podcasts are filtered from the Home, New releases and Charts shelves only
  // (search, artist pages and the queue still show them).
  const withoutPodcasts = (items: SonosItem[]) => items.filter((i) => !isPodcast(i));

  const homeItems = withoutPodcasts(await browseContainer(homeItem)).filter(
    (i) => !/podcast/i.test(String(i.title ?? i.name ?? '')),
  );
  const findShelf = (...titles: string[]) => {
    for (const t of titles) {
      const hit = homeItems.find((i) => (i.title ?? i.name) === t);
      if (hit) return hit;
    }
    return undefined;
  };

  // Some accounts only expose Home / Library / My Supermix at the root, with the
  // New releases and Charts shelves inside Home instead, so fall back to those.
  // A shelf is only recognisable as podcasts by what is in it, so look inside each one and drop a
  // shelf whose children are all podcasts. (A title regex missed "Popular shows".)
  const [newItems, chartItems, mixKids, shelfKids] = await Promise.all([
    browseContainer(find('New releases') ?? findShelf('New releases', 'Fresh new music')).then(withoutPodcasts),
    browseContainer(find('Charts') ?? findShelf('Top songs', 'Trending songs for you')).then(withoutPodcasts),
    browseContainer(supermixItem).catch(() => [] as SonosItem[]),
    Promise.all(homeItems.map((i) => (isContainer(i) ? browseContainer(i).catch(() => [] as SonosItem[]) : Promise.resolve(null)))),
  ]);
  const shelves = homeItems.filter((_, i) => {
    const kids = shelfKids[i];
    return !(kids && kids.length > 0 && kids.every(isPodcast));
  });
  // The supermix has no artwork of its own that suits a tile: borrow its first track's.
  const mixArt = mixKids.map(getItemArt).find(Boolean) ?? undefined;

  return {
    forYou: supermixItem
      ? [{ ...supermixItem, images: [] as { url: string }[], imageUrl: mixArt }, ...shelves]
      : shelves,
    newReleases: newItems,
    charts: chartItems,
  };
}


export function HomePanel({ isAuthed, onAddToQueue, ytm, ytmLoading, displayName, playback, queueItems = [] }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const { showTrackMenu } = useTrackContextMenu();

  const view = location.pathname === '/search' ? 'search' : 'home';
  const activeSearch = searchParams.get('q') ?? '';

  // Navigation shared by every track on Home: album on the title or art, artist on the name,
  // the app's track context menu on right-click, and a prefetch on hover so the click is instant.
  const albumItemFor = (t: NavTrack): SonosItem | null =>
    t.albumId
      ? ({
          title: t.album ?? t.title,
          type: 'ITEM_ALBUM',
          resource: { type: 'ALBUM', id: { objectId: t.albumId, serviceId: t.serviceId ?? '', accountId: t.accountId ?? '' } },
        } as SonosItem)
      : null;
  const prefetchAlbumItem = (item: SonosItem) => {
    const p = resolveAlbumParams(item);
    if (p.albumId && p.serviceId && p.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(p.albumId, p.serviceId, p.accountId, p.defaults));
  };
  const prefetchArtistItem = (item: SonosItem) => {
    const p = resolveArtistParams(item);
    if (p.artistId && p.serviceId && p.accountId)
      void queryClient.prefetchQuery(artistQueryOptions(p.artistId, p.serviceId, p.accountId, undefined));
  };
  const nav: Nav = {
    openAlbum: (t) => {
      const item = albumItemFor(t);
      if (item) openItem(item);
      else
        void resolveAndOpen(t.album || t.title, 'album', {
          artist: primaryArtistName(t.artist),
          serviceId: t.serviceId ?? undefined,
          accountId: t.accountId ?? undefined,
        });
    },
    openArtist: (name, t, isFirst) =>
      openArtistWith(
        {
          type: 'ARTIST',
          title: name,
          name,
          resource: {
            type: 'ARTIST',
            id: {
              objectId: isFirst ? (t.artistId ?? undefined) : undefined,
              serviceId: t.serviceId ?? undefined,
              accountId: t.accountId ?? undefined,
            },
          },
        } as SonosItem,
        openItem,
        resolveAndOpen,
      ),
    openAlbumItem: (item) => {
      if (resolveAlbumParams(item).albumId) openItem(item);
      else void resolveAndOpen(getName(item), 'album', { artist: String(item.artist ?? '') || undefined });
    },
    openArtistItem: (item) => openArtistWith(item, openItem, resolveAndOpen),
    prefetch: (t) => {
      const item = albumItemFor(t);
      if (item) prefetchAlbumItem(item);
      if (t.artistId && t.serviceId && t.accountId)
        void queryClient.prefetchQuery(artistQueryOptions(t.artistId, t.serviceId, t.accountId, undefined));
    },
    prefetchItem: (item) => (isArtist(item) ? prefetchArtistItem(item) : prefetchAlbumItem(item)),
    menu: (t, e) => {
      if (!t.uri) return;
      showTrackMenu(
        {
          track: {
            uri: t.uri,
            trackName: t.title,
            artist: t.artist,
            albumName: t.album ?? undefined,
            imageUrl: t.imageUrl,
            serviceId: t.serviceId ?? '',
            accountId: t.accountId ?? '',
            addedBy: '',
            addedAt: 0,
          },
          sonosItem: t.item ?? undefined,
        },
        e,
      );
    },
  };

  const { artistItems, albumItems, currentUserId } = useRecentlyPlayed();
  const { data: users = [] } = useUsers(isAuthed, true);
  const imageByUser = new Map(users.map((u) => [u.userId, u.imageUrl]));

  // Queuedle
  const { data: todayGame } = useDailyGame();
  const todayGameId = todayGame && 'id' in todayGame ? todayGame.id : null;
  const { data: myScore } = useMyScore(todayGameId, currentUserId);
  const score = myScore?.score;
  const maxScore = todayGame && 'questions' in todayGame ? todayGame.questions.length * 2 : null;

  // Who's in. Stable primitive key: the array identity changes on every presence poll.
  const { data: presence } = useOfficePresence(isAuthed);
  const roomKey = (presence?.inOffice ?? []).join(',');
  const inOffice = useMemo(() => (roomKey ? roomKey.split(',') : []), [roomKey]);

  // Picks: the same engine as Discover
  const djOpts = useMemo(() => ({ users: inOffice, limit: 25 }), [inOffice]);
  const { data: djSet, isLoading: djLoading } = useDjSet(djOpts, isAuthed && view === 'home');
  const { discoveries, isLoading: discoveriesLoading } = useDjDiscoveries(djSet?.artists, isAuthed);
  const actByName = new Map((djSet?.artists ?? []).map((a) => [a.artist, a]));
  const discoveryPicks = discoveries.slice(0, 8).map((d) => {
    const act = actByName.get(d.artist);
    return {
      key: d.track.id.objectId,
      because: d.because,
      item: d.track.raw,
      act,
      t: {
        title: d.track.title,
        artist: d.artist,
        album: d.track.albumName,
        albumId: d.track.albumId,
        artistId: act?.artistId,
        serviceId: d.track.id.serviceId,
        accountId: d.track.id.accountId,
        imageUrl: d.track.artUrl,
        uri: d.track.id.objectId,
        item: d.track.raw,
      } as NavTrack,
    };
  });
  // Nothing new to suggest: fall back to what the office already plays.
  const picks = discoveryPicks.length
    ? discoveryPicks
    : (djSet?.tracks ?? []).slice(0, 8).flatMap((t) => {
        const item = statsTrackToItem(t);
        if (!item) return [];
        const act = actByName.get(t.artist);
        return [{
          key: t.uri,
          because: t.because,
          item,
          act,
          t: {
            title: t.trackName,
            artist: t.artist,
            albumId: t.albumId,
            artistId: act?.artistId,
            serviceId: t.serviceId,
            accountId: t.accountId,
            imageUrl: t.imageUrl,
            uri: t.uri,
            item,
          } as NavTrack,
        }];
      });
  const picksBusy = djLoading || discoveriesLoading;
  // The artist's photo carries the featured cards. The hero is chosen once, when the picks have
  // settled (or after 1.5s), and is kept until it leaves the picks. A photo that arrives later
  // fades in on its card; nothing is reordered under the viewer.
  const photoQueries = useQueries({
    queries: picks.slice(0, 8).map((p) => artistImageQueryOptions(p.act?.artistId, p.act?.serviceId, p.act?.accountId)),
  });
  const withPhoto = picks.map((p, i) => ({ ...p, photo: photoQueries[i]?.data ?? null }));
  const picksSig = picks.map((p) => p.key).join('|');
  // Settled = every pick that can have a photo has finished looking (a query that has not started yet is still pending).
  const photosSettled = picks.every((p, i) => !(p.act?.artistId && p.act.serviceId && p.act.accountId) || !photoQueries[i]?.isPending);
  const [capped, setCapped] = useState('');
  useEffect(() => {
    if (!picksSig) return;
    const id = setTimeout(() => setCapped(picksSig), 1500);
    return () => clearTimeout(id);
  }, [picksSig]);
  const [heroKey, setHeroKey] = useState<string | null>(null);
  const heroPresent = heroKey !== null && picks.some((p) => p.key === heroKey);
  if (picks.length && !heroPresent && (photosSettled || capped === picksSig)) {
    setHeroKey((withPhoto.find((p) => p.photo) ?? withPhoto[0]).key ?? '');
  }
  const heroIdx = heroPresent ? withPhoto.findIndex((p) => p.key === heroKey) : -1;
  const ordered = heroIdx >= 0 ? [withPhoto[heroIdx], ...withPhoto.filter((_, i) => i !== heroIdx)] : [];
  const lead = ordered[0];
  const featured = ordered.slice(1, 3);
  const listed = ordered.slice(3);
  const listA = listed.slice(0, Math.ceil(listed.length / 2));
  const listB = listed.slice(listA.length);
  // A soft wash of the hero's dominant colour behind the Picks card.
  const heroSrc = lead?.photo ?? lead?.t.imageUrl;
  const heroArt = useImage(heroSrc ? withArtworkSize(heroSrc, 1200) : null);
  const wash = useDominantColor(heroArt);
  const addPick = (p: (typeof picks)[number]) => () => onAddToQueue(p.item, -1, { attribute: false });
  const pickRow = (p: (typeof picks)[number]) => (
    <TrackRow key={p.key} t={p.t} reason={neverPlayedTag(p.because) ?? undefined} onAdd={addPick(p)} />
  );
  const queueRef = useRef(queueItems);
  useEffect(() => {
    queueRef.current = queueItems;
  }, [queueItems]);
  const solo = inOffice.length === 1 && !!displayName && inOffice[0] === displayName;

  // Trending: a chart, at most two tracks per artist
  const { data: weekStats } = useStats('week', undefined, 50);
  const trending = capPerArtist(weekStats?.topTracks ?? [], 2).slice(0, 10);

  // What people are queuing: each person's recent albums, or their latest tracks if they have no albums
  const { tracksByUser, albumsByUser } = useRecentTracksByUser(inOffice.slice(0, 10), isAuthed && view === 'home');
  const trackPicks = new Map(picksByPerson(inOffice, tracksByUser, { perPerson: 3, maxPeople: 10 }).map((p) => [p.user, p.tracks]));
  const people = inOffice
    .flatMap((user) => {
      const albums = [...(albumsByUser.get(user) ?? [])].sort((a, b) => b.lastPlayed - a.lastPlayed);
      if (albums.length) {
        const tiles: AlbumTileData[] = albums.slice(0, 3).map((a) => {
          const item = statsAlbumToItem({ ...a, count: 0 });
          return {
            key: a.albumId ?? a.album,
            title: a.album,
            sub: a.artist,
            when: relativeDay(a.lastPlayed),
            imageUrl: a.imageUrl,
            open: () => nav.openAlbumItem(item),
            hover: () => nav.prefetchItem(item),
            add: a.albumId ? () => onAddToQueue(item) : undefined,
          };
        });
        return [{ user, noun: 'album', count: albums.length, tiles }];
      }
      const tracks = trackPicks.get(user) ?? [];
      if (!tracks.length) return [];
      const tiles: AlbumTileData[] = tracks.map((t) => {
        const nt = navTrackFrom(t);
        return {
          key: t.uri ?? `${t.trackName}|${t.artist}`,
          title: t.trackName,
          sub: t.artist,
          when: relativeDay(t.lastPlayed),
          imageUrl: t.imageUrl,
          open: () => nav.openAlbum(nt),
          hover: () => nav.prefetch(nt),
          add: nt.item ? () => onAddToQueue(nt.item as SonosItem) : undefined,
        };
      });
      return [{ user, noun: 'track', count: tracks.length, tiles }];
    })
    .slice(0, 6);

  // Jump back in
  const jump = jumpBackIn(
    albumItems.map((item) => ({ label: getName(item), sub: browseSub(item) as string | null, item })),
    dedupeArtists(artistItems.map((item) => ({ artist: getName(item), item }))).map(({ artist, item }) => ({
      label: artist,
      sub: null as string | null,
      item,
    })),
  );

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

  const queueAll = () => {
    const added = picks.map((p) => ({ id: p.t.uri ?? p.key ?? '', title: p.t.title, artist: p.t.artist }));
    picks.forEach((p) => onAddToQueue(p.item, -1, { attribute: false }));
    showToast(`Queued ${picks.length} pick${picks.length === 1 ? '' : 's'}`, 'info', {
      durationMs: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          // Only what is still in the queue from this batch; anything else is left alone.
          const indices = indicesToUndo(queueRef.current, added);
          if (indices.length) void getActiveProvider().removeFromQueue(indices).catch(() => showToast('Could not undo'));
        },
      },
    });
  };
  const forYou = ytm?.forYou ?? [];

  return (
    <div className={styles.panel}>
      {!isAuthed ? (
        <div className={styles.msg}>Waiting for authentication…</div>
      ) : (
        <NavContext.Provider value={nav}>
          <div className={styles.page}>
            <header className={styles.hero}>
              <h1 className={styles.greeting}>{greeting(displayName)}</h1>
              {todayGameId && (
                <div className={styles.queuedle}>
                  <span className={styles.queuedleText}>
                    <span className={styles.queuedleLabel}>Queuedle today</span>
                    <span className={styles.queuedleState}>
                      {score
                        ? `Your score ${score.mainScore + score.bonusScore}${maxScore ? ` / ${maxScore}` : ''}`
                        : 'Not played yet'}
                    </span>
                  </span>
                  <button type="button" className={styles.pillBtn} onClick={() => navigate('/queuedle')}>
                    {score ? 'View results' : 'Play'}
                  </button>
                </div>
              )}
            </header>

            {playback?.isVisible && playback.trackName && (
              <NowPlayingBand playback={playback} imageByUser={imageByUser} />
            )}

            {(picksBusy || picks.length > 0) && (
              <section
                className={`${styles.section} ${styles.featured}`}
                style={wash ? ({ '--wash': wash } as React.CSSProperties) : undefined}
                aria-labelledby="home-picks"
              >
                <div className={styles.sectionHead}>
                  <h2 id="home-picks" className={styles.sectionTitle}>
                    {inOffice.length ? (solo ? 'Picks for you' : "Picks for who's in") : 'Picks for the whole office'}
                  </h2>
                  {inOffice.length > 0 && !solo && (
                    <ul className={styles.faces} aria-label="In the office">
                      {inOffice.slice(0, 8).map((u) => (
                        <li key={u}>
                          <button
                            type="button"
                            className={styles.face}
                            title={`${u}'s profile`}
                            onClick={() => navigate(`/profile/${encodeURIComponent(u)}`)}
                          >
                            <UserAvatar name={u} imageUrl={imageByUser.get(u)} className={styles.faceAvatar} />
                            <span className={styles.faceName}>{u}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {picks.length > 0 && (
                    <button type="button" className={`${styles.ghostBtn} ${styles.headAction}`} onClick={queueAll} title="Add every pick to the queue">
                      <ListPlus size={14} /> Queue all
                    </button>
                  )}
                </div>
                {!lead ? (
                  <div className={styles.msg}>Digging for something new…</div>
                ) : (
                  <div className={styles.picksLayout}>
                    <ArtCard size="large" label={pickReason(lead.because, displayName)} t={lead.t} photoUrl={lead.photo} onAdd={addPick(lead)} />
                    {[featured[0], featured[1]].map((p, i) =>
                      p ? (
                        <div key={p.key} className={styles.picksCol}>
                          <ArtCard size="medium" label={pickReason(p.because, displayName)} t={p.t} photoUrl={p.photo} onAdd={addPick(p)} />
                          <ul className={styles.list}>{(i === 0 ? listA : listB).map(pickRow)}</ul>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
              </section>
            )}

            {(trending.length > 0 || jump.length > 0) && (
              <div className={styles.split}>
                {trending.length > 0 && (
                  <section className={`${styles.section} ${styles.card}`} aria-labelledby="home-trending">
                    <div className={styles.sectionHead}>
                      <h2 id="home-trending" className={styles.sectionTitle}>Trending in the office · this week</h2>
                      <span className={styles.headAction}><SeeAll label="See all" onClick={() => navigate('/leaderboard')} /></span>
                    </div>
                    <div className={styles.chartHead} aria-hidden="true">
                      <span>#</span><span>Title</span><span>Artist</span><span className={styles.plays}>Plays</span>
                    </div>
                    <ol className={styles.chart}>
                      {trending.map((t, i) => {
                        const nt = navTrackFrom(t);
                        return (
                          <ChartRow
                            key={`${t.uri ?? t.trackName}-${i}`}
                            rank={i + 1}
                            t={nt}
                            count={t.count}
                            onAdd={nt.item ? () => onAddToQueue(nt.item as SonosItem) : undefined}
                          />
                        );
                      })}
                    </ol>
                  </section>
                )}

                {jump.length > 0 && (
                  <section className={`${styles.section} ${styles.card}`} aria-labelledby="home-jump">
                    <div className={styles.sectionHead}>
                      <h2 id="home-jump" className={styles.sectionTitle}>Jump back in</h2>
                    </div>
                    <div className={styles.jumpGrid}>
                      {jump.map((j) => (
                        <JumpTile
                          key={`${j.kind}-${j.item.label}`}
                          label={j.item.label}
                          sub={j.item.sub}
                          imageUrl={j.item.item.imageUrl}
                          circular={j.kind === 'artist'}
                          onHover={() => nav.prefetchItem(j.item.item)}
                          onOpen={() =>
                            j.kind === 'artist' ? nav.openArtistItem(j.item.item) : nav.openAlbumItem(j.item.item)
                          }
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {people.length > 0 && (
              <section className={`${styles.section} ${styles.card}`} aria-labelledby="home-people">
                <div className={styles.sectionHead}>
                  <h2 id="home-people" className={styles.sectionTitle}>What people are queuing</h2>
                </div>
                <div className={styles.peopleGrid}>
                  {people.map((p) => (
                    <PersonCard
                      key={p.user}
                      user={p.user}
                      imageUrl={imageByUser.get(p.user)}
                      count={p.count}
                      noun={p.noun}
                      tiles={p.tiles}
                      onOpen={() => navigate(`/profile/${encodeURIComponent(p.user)}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className={`${styles.section} ${styles.card} ${styles.carouselSec}`}>
              <Carousel title="For you" gap="16px">
                {ytmLoading
                  ? Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.tileSkel} />)
                  : forYou.map((item, i) => (
                      <ArtTile
                        key={i}
                        name={getName(item)}
                        imageUrl={getItemArt(item)}
                        onAdd={isContainer(item) ? undefined : () => onAddToQueue(item)}
                        onOpen={
                          isAlbum(item) || isPlaylist(item) || isContainer(item) || isProgram(item)
                            ? () => openItem(item)
                            : undefined
                        }
                      />
                    ))}
              </Carousel>
            </section>
          </div>
        </NavContext.Provider>
      )}
    </div>
  );
}
