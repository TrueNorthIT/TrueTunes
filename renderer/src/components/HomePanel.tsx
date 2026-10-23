import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, ListPlus, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/sonosApi';
import {
  extractItems,
  resolveAlbumParams,
  resolveArtistParams,
  isAlbum,
  isArtist,
  isContainer,
  isPlaylist,
  isProgram,
  isTrack,
  getName,
  getItemArt,
  browseSub,
  albumItem,
  artistItem,
  trackPayload,
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
import { useDailyGame, useLastWeekWinner, useMyScore } from '../hooks/useDailyGame';
import { formatWeekRange } from '../lib/queuedleWeek';
import { useImage } from '../hooks/useImage';
import { useDominantColor } from '../hooks/useDominantColor';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useFollowActiveLine, useLiveLyrics } from '../hooks/useLiveLyrics';
import { useAttribution, resolveAttribution } from '../hooks/useAttribution';
import { useGeniusDescription } from '../hooks/useGeniusDescription';
import type { PlaybackState } from '../hooks/usePlayback';
import { useToast } from './common/Toast';
import { getActiveProvider } from '../providers';
import type { NormalizedQueueItem } from '../types/provider';
import { withArtworkSize } from '../lib/artworkUrl';
import { UserAvatar } from './common/UserAvatar';
import { Artwork } from './common/Artwork';
import { PlaybackTime } from './common/SeekBar';
import { usePlaybackPosition } from '../hooks/playbackPosition';
import { QueuerChip } from './common/QueuerChip';
import { useTrackContextMenu } from './common/ContextMenu';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { artistImageQueryOptions, artistQueryOptions } from '../hooks/useArtistBrowse';
import { Carousel } from './common/Carousel';
import { PickInfoTip } from './common/PickInfoTip';
import { ArtCard } from './common/ArtCard';
import { ChartHead, ChartRow } from './common/ChartRow';
import { ImageTile } from './common/ImageTile';
import { PersonCard } from './common/PersonCard';
import { SectionCard, SeeAll } from './common/SectionCard';
import { TrackRow } from './common/TrackRow';
import { ArtistLinks as SharedArtistLinks } from './common/TrackLinks';
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
  openAlbum: noop,
  openArtist: noop,
  openAlbumItem: noop,
  openArtistItem: noop,
  prefetch: noop,
  prefetchItem: noop,
  menu: noop,
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
  resolveAndOpen: ReturnType<typeof useResolveAndOpen>['resolveAndOpen']
) {
  const { artistId, serviceId, accountId } = resolveArtistParams(item);
  if (artistId) openItem(item);
  else void resolveAndOpen(getName(item), 'artist', { serviceId, accountId });
}

/** Each credited name is its own link; only the first can use the track's artist id. */
function ArtistLinks({ t }: { t: NavTrack }) {
  const nav = useContext(NavContext);
  return <SharedArtistLinks artist={t.artist} onOpenArtist={(name, isFirst) => nav.openArtist(name, t, isFirst)} />;
}

/** Compact row: art, "title — artist", muted reason line, and a + on hover or focus. */
function PickRow({ t, reason, onAdd }: { t: NavTrack; reason?: string; onAdd?: () => void }) {
  const nav = useContext(NavContext);
  return (
    <TrackRow
      title={t.title}
      artists={<ArtistLinks t={t} />}
      imageUrl={t.imageUrl}
      reason={reason}
      onOpen={() => nav.openAlbum(t)}
      onAdd={onAdd}
      onContextMenu={(e) => nav.menu(t, e)}
      onMouseEnter={() => nav.prefetch(t)}
    />
  );
}

/** The artwork is the card: title and artist sit on a soft scrim over the lower part. */
function PickCard({
  size,
  label,
  t,
  photoUrl,
  onAdd,
  className,
  why,
}: {
  size: 'large' | 'medium';
  label: string;
  t: NavTrack;
  photoUrl?: string | null;
  onAdd: () => void;
  className?: string;
  why: Parameters<typeof PickInfoTip>[0];
}) {
  const nav = useContext(NavContext);
  return (
    <ArtCard
      size={size}
      className={className}
      label={label}
      title={t.title}
      sub={<ArtistLinks t={t} />}
      imageUrl={t.imageUrl}
      photoUrl={photoUrl}
      openLabel={`Open album ${t.album ?? t.title}`}
      onOpen={() => nav.openAlbum(t)}
      info={<PickInfoTip {...why} />}
      onAdd={onAdd}
      onContextMenu={(e) => nav.menu(t, e)}
      onMouseEnter={() => nav.prefetch(t)}
    />
  );
}

/** Square collection tile with its name over the artwork. */
function ArtTile({
  name,
  imageUrl,
  onOpen,
  onAdd,
}: {
  name: string;
  imageUrl?: string | null;
  onOpen?: () => void;
  onAdd?: () => void;
}) {
  const art = useImage(imageUrl ?? null);
  const inner = (
    <>
      <Artwork src={art} className={styles.artFill} placeholderClassName={styles.artPh} lazy />
      <span className={styles.tileName}>{name}</span>
    </>
  );
  return (
    <div className={styles.artTile}>
      {onOpen ? (
        <button type="button" className={styles.tileMain} onClick={onOpen} aria-label={name}>
          {inner}
        </button>
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

function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}` : `Good ${part}`;
}

function TrendRow({ rank, t, count, onAdd }: { rank: number; t: NavTrack; count: number; onAdd?: () => void }) {
  const nav = useContext(NavContext);
  return (
    <ChartRow
      rank={rank}
      title={t.title}
      artists={<ArtistLinks t={t} />}
      imageUrl={t.imageUrl}
      count={count}
      onOpen={() => nav.openAlbum(t)}
      onAdd={onAdd}
      onContextMenu={(e) => nav.menu(t, e)}
      onMouseEnter={() => nav.prefetch(t)}
    />
  );
}

/** The Now playing band's progress line: the one part of the band that moves every second. */
function NowProgress() {
  const pct = usePlaybackPosition((p) => p.progressPct);
  return (
    <div className={styles.nowProgress}>
      <PlaybackTime part="elapsed" className={styles.nowTime} />
      <div
        className={styles.nowBar}
        role="progressbar"
        aria-label="Track progress"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.nowFill} style={{ transform: `scaleX(${Math.min(1, Math.max(0, pct / 100))})` }} />
      </div>
      <PlaybackTime part="duration" className={styles.nowTime} />
    </div>
  );
}

/** Now playing card and live synced lyrics. No transport controls: the player bar has them. */
function NowPlayingBand({
  playback,
  imageByUser,
}: {
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

  const lyr = useLiveLyrics(np);
  const { activeLine } = lyr;
  const plain = lyr.plain.slice(0, 5);
  const lyricsPending = lyr.pending;
  // Keep the box while the current track's lyrics resolve; hide only once settled with nothing.
  const showLyrics = lyricsPending || lyr.hasLyrics;

  // Keep the active line about 40% of the way down the box.
  const { boxRef, lineRefs } = useFollowActiveLine(activeLine, 0.4);

  const openAlbum = () =>
    np.albumItem
      ? openItem(np.albumItem)
      : void resolveAndOpen(np.albumName || np.displayTrack, 'album', { artist: np.displayArtist });
  const openArtist = () =>
    np.artistItem ? openItem(np.artistItem) : void resolveAndOpen(primaryArtistName(np.displayArtist), 'artist');
  const openLyrics = () => navigate('/lyrics');

  return (
    <section className={`${styles.band}${showLyrics ? '' : ' ' + styles.bandSolo}`} aria-label="Now playing">
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
          <Artwork src={art} placeholderClassName={styles.jumpArtPh} />
        </button>
        <div className={styles.nowInfo}>
          <span className={styles.nowLabel}>Now playing</span>
          <h2 className={styles.nowTitle}>
            <button
              type="button"
              className={styles.titleBtn}
              onClick={openAlbum}
              onMouseEnter={np.prefetchAlbum}
              aria-label={`${np.displayTrack}, open album`}
            >
              {np.displayTrack}
            </button>
          </h2>
          <div className={styles.nowMeta}>
            <button
              type="button"
              className={`${styles.artistBtn} ${styles.metaArtist}`}
              onClick={openArtist}
              aria-label={`${np.displayArtist}, open artist`}
            >
              {np.displayArtist}
            </button>
            {np.albumName && (
              <>
                <span className={styles.metaDot} aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  className={`${styles.artistBtn} ${styles.metaAlbum}`}
                  onClick={openAlbum}
                  aria-label={`${np.albumName}, open album`}
                >
                  {np.albumName}
                </button>
              </>
            )}
          </div>
          {queuer && (
            <QueuerChip
              className={styles.queuerChip}
              user={queuer.user}
              imageUrl={imageByUser.get(queuer.user)}
              onOpen={() => profile(queuer.user)}
            />
          )}
          <NowProgress />
          {aboutLoading && !blurb && (
            <div className={styles.about} aria-label="About this track" aria-busy="true">
              {['100%', '92%', '58%'].map((w) => (
                <span key={w} className={`skeleton ${styles.aboutSkel}`} style={{ width: w }} />
              ))}
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
                {['70%', '55%', '80%', '45%', '65%'].map((w) => (
                  <span key={w} className={`skeleton ${styles.lyricSkel}`} style={{ width: w }} />
                ))}
              </div>
            ) : lyr.lines.length > 0 ? (
              <div className={styles.lyricsPad}>
                {lyr.lines.map((line, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    className={`${styles.lyricLine}${i === activeLine ? ' ' + styles.lyricActive : ''}`}
                    style={
                      activeLine >= 0 ? { opacity: Math.max(0.18, 1 - Math.abs(i - activeLine) * 0.24) } : undefined
                    }
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.lyricsPad}>
                {plain.map((l, i) => (
                  <div key={i} className={`${styles.lyricLine} ${styles.lyricPlain}`}>
                    {l}
                  </div>
                ))}
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

  const d = rootR.data ?? {};
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
    (i) => !/podcast/i.test(String(i.title ?? i.name ?? ''))
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
    Promise.all(
      homeItems.map((i) => (isContainer(i) ? browseContainer(i).catch(() => [] as SonosItem[]) : Promise.resolve(null)))
    ),
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
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const { showTrackMenu } = useTrackContextMenu();

  // Navigation shared by every track on Home: album on the title or art, artist on the name,
  // the app's track context menu on right-click, and a prefetch on hover so the click is instant.
  const albumItemFor = (t: NavTrack): SonosItem | null =>
    t.albumId
      ? albumItem(t.album ?? t.title, {
          objectId: t.albumId,
          serviceId: t.serviceId ?? '',
          accountId: t.accountId ?? '',
        })
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
        artistItem(
          name,
          {
            objectId: isFirst ? (t.artistId ?? undefined) : undefined,
            serviceId: t.serviceId ?? undefined,
            accountId: t.accountId ?? undefined,
          },
          { title: name }
        ),
        openItem,
        resolveAndOpen
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
          track: trackPayload({
            uri: t.uri,
            trackName: t.title,
            artist: t.artist,
            albumName: t.album,
            imageUrl: t.imageUrl,
            serviceId: t.serviceId,
            accountId: t.accountId,
          }),
          sonosItem: t.item ?? undefined,
        },
        e
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
  // Last week's Queuedle winner is crowned all this week: on the Queuedle card, and on their face when they're in.
  const lastWeekWinner = useLastWeekWinner(displayName).data ?? null;
  const champion = lastWeekWinner?.userName ?? null;
  const score = myScore?.score;
  const maxScore = todayGame && 'questions' in todayGame ? todayGame.questions.length * 2 : null;

  // Who's in. Stable primitive key: the array identity changes on every presence poll.
  const { data: presence } = useOfficePresence(isAuthed);
  const roomKey = (presence?.inOffice ?? []).join(',');
  const inOffice = useMemo(() => (roomKey ? roomKey.split(',') : []), [roomKey]);

  // Picks: the same engine as Discover
  const djOpts = useMemo(() => ({ users: inOffice, limit: 25 }), [inOffice]);
  const { data: djSet, isLoading: djLoading } = useDjSet(djOpts, isAuthed);
  // Don't pick what's already queued (unattributed DJ picks never reach the heard list).
  const queued = useMemo(() => queueItems.map((q) => ({ title: q.track.title, artist: q.track.artist })), [queueItems]);
  const { discoveries, isLoading: discoveriesLoading } = useDjDiscoveries(djSet?.artists, isAuthed, { queued });
  const actByName = new Map((djSet?.artists ?? []).map((a) => [a.artist, a]));
  const discoveryPicks = discoveries.slice(0, 8).map((d) => {
    const act = actByName.get(d.artist);
    return {
      key: d.track.id.objectId,
      because: d.because,
      why: {
        because: d.because,
        fans: d.fans,
        artist: d.artist,
        viewer: displayName,
        trackName: d.track.title,
        kind: 'unheard' as const,
      },
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
        return [
          {
            key: t.uri,
            because: t.because,
            why: {
              because: t.because,
              fans: t.fans,
              trackFans: t.trackFans,
              artist: t.artist,
              viewer: displayName,
              trackName: t.trackName,
              kind: 'played' as const,
            },
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
          },
        ];
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
  const photosSettled = picks.every(
    (p, i) => !(p.act?.artistId && p.act.serviceId && p.act.accountId) || !photoQueries[i]?.isPending
  );
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
    <PickRow key={p.key} t={p.t} reason={neverPlayedTag(p.because) ?? undefined} onAdd={addPick(p)} />
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
  const { tracksByUser, albumsByUser } = useRecentTracksByUser(inOffice.slice(0, 10), isAuthed);
  const trackPicks = new Map(
    picksByPerson(inOffice, tracksByUser, { perPerson: 3, maxPeople: 10 }).map((p) => [p.user, p.tracks])
  );
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
    }))
  );

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
          if (indices.length)
            void getActiveProvider()
              .removeFromQueue(indices)
              .catch(() => showToast('Could not undo'));
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
          <div className={`page-scale ${styles.page}`}>
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
                    {lastWeekWinner && (
                      <span
                        className={styles.queuedleChamp}
                        title={`Queuedle champion, week of ${formatWeekRange(lastWeekWinner.range)}`}
                      >
                        <span aria-hidden="true">👑 </span>Last week: {lastWeekWinner.userName} · {lastWeekWinner.total}{' '}
                        pts
                      </span>
                    )}
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
              <SectionCard
                featured
                wash={wash}
                className={styles.section}
                title={inOffice.length ? (solo ? 'Picks for you' : "Picks for who's in") : 'Picks for the whole office'}
                headContent={
                  inOffice.length > 0 && !solo ? (
                    <ul className={styles.faces} aria-label="In the office">
                      {inOffice.slice(0, 8).map((u) => (
                        <li key={u}>
                          <button
                            type="button"
                            className={styles.face}
                            title={u === champion ? `${u}'s profile · last week's Queuedle champion` : `${u}'s profile`}
                            onClick={() => navigate(`/profile/${encodeURIComponent(u)}`)}
                          >
                            <UserAvatar name={u} imageUrl={imageByUser.get(u)} className={styles.faceAvatar} />
                            <span className={styles.faceName}>
                              {u === champion && <span aria-label="Last week's Queuedle champion">👑 </span>}
                              {u}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
                actions={
                  <>
                    {picks.length > 0 && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={queueAll}
                        title="Add every pick to the queue"
                      >
                        <ListPlus size={14} /> Queue all
                      </button>
                    )}
                    <SeeAll onClick={() => navigate('/discover')} />
                  </>
                }
              >
                {!lead ? (
                  <div className={styles.msg}>Digging for something new…</div>
                ) : (
                  <div className={styles.picksLayout}>
                    <PickCard
                      size="large"
                      className={styles.picksLead}
                      label={pickReason(lead.because, displayName, lead.why.fans)}
                      t={lead.t}
                      photoUrl={lead.photo}
                      onAdd={addPick(lead)}
                      why={lead.why}
                    />
                    {[featured[0], featured[1]].map((p, i) =>
                      p ? (
                        <div key={p.key} className={styles.picksCol}>
                          <PickCard
                            size="medium"
                            label={pickReason(p.because, displayName, p.why.fans)}
                            t={p.t}
                            photoUrl={p.photo}
                            onAdd={addPick(p)}
                            why={p.why}
                          />
                          <ul className={styles.list}>{(i === 0 ? listA : listB).map(pickRow)}</ul>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            {(trending.length > 0 || jump.length > 0) && (
              <div className={styles.split}>
                {trending.length > 0 && (
                  <SectionCard
                    className={styles.section}
                    title="Trending in the office · this week"
                    actions={<SeeAll onClick={() => navigate('/leaderboard')} />}
                  >
                    <ChartHead />
                    <ol className={styles.list}>
                      {trending.map((t, i) => {
                        const nt = navTrackFrom(t);
                        return (
                          <TrendRow
                            key={`${t.uri ?? t.trackName}-${i}`}
                            rank={i + 1}
                            t={nt}
                            count={t.count}
                            onAdd={nt.item ? () => onAddToQueue(nt.item as SonosItem) : undefined}
                          />
                        );
                      })}
                    </ol>
                  </SectionCard>
                )}

                {jump.length > 0 && (
                  <SectionCard className={styles.section} title="Jump back in">
                    <div className={styles.jumpGrid}>
                      {jump.map((j) => (
                        <ImageTile
                          key={`${j.kind}-${j.item.label}`}
                          title={j.item.label}
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
                  </SectionCard>
                )}
              </div>
            )}

            {people.length > 0 && (
              <SectionCard className={styles.section} title="What people are queuing">
                <div className={styles.peopleGrid}>
                  {people.map((p) => (
                    <PersonCard
                      key={p.user}
                      name={p.user}
                      imageUrl={imageByUser.get(p.user)}
                      caption={`${p.count} ${p.noun}${p.count === 1 ? '' : 's'} this week`}
                      onOpen={() => navigate(`/profile/${encodeURIComponent(p.user)}`)}
                    >
                      <div className={styles.albumRow}>
                        {p.tiles.map((d) => (
                          <ImageTile
                            key={d.key}
                            size="sm"
                            title={d.title}
                            sub={d.sub}
                            meta={d.when}
                            imageUrl={d.imageUrl}
                            onOpen={d.open}
                            onHover={d.hover}
                            onAdd={d.add}
                          />
                        ))}
                      </div>
                    </PersonCard>
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard className={styles.section}>
              <Carousel title="For you" gap="16px">
                {ytmLoading
                  ? Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.tileSkel} />)
                  : forYou.map((item, i) => (
                      <ArtTile
                        key={i}
                        name={getName(item)}
                        imageUrl={getItemArt(item)}
                        // Only a single song gets a +. My Supermix is a dynamic mix (a PLAYLIST resource, like artist
                        // radio), stations would replace the shared queue, and shelves are lists: all of them open.
                        onAdd={isTrack(item) ? () => onAddToQueue(item) : undefined}
                        onOpen={
                          isAlbum(item) || isPlaylist(item) || isContainer(item) || isProgram(item)
                            ? () => openItem(item)
                            : undefined
                        }
                      />
                    ))}
              </Carousel>
            </SectionCard>
          </div>
        </NavContext.Provider>
      )}
    </div>
  );
}
