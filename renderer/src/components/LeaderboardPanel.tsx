import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { GameRankTierKey } from '../hooks/useDailyGame';
import { useStats, statsQueryOptions, type StatsPeriod } from '../hooks/useStats';
import { useGameRankings } from '../hooks/useDailyGame';
import { useUsers } from '../hooks/useUsers';
import { useArtistImage } from '../hooks/useArtistBrowse';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import { useOpenItem } from '../hooks/useOpenItem';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import { mergeArtists, queuedSummary } from '../lib/leaderboard';
import { ordinal } from '../lib/profileData';
import { primaryArtistName, statsAlbumToItem, statsArtistToItem, statsTrackToItem } from '../lib/homeData';
import { useTrackContextMenu } from './common/ContextMenu';
import { Dialog } from './common/Dialog';
import { competitionRanks } from './queuedle/format';
import { ChartHead, ChartRow } from './common/ChartRow';
import { ImageTile } from './common/ImageTile';
import { PersonCard } from './common/PersonCard';
import { SectionCard, SeeAll } from './common/SectionCard';
import { ArtistLinks } from './common/TrackLinks';
import { UserAvatar } from './common/UserAvatar';
import { trackPayload } from '../lib/itemHelpers';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/LeaderboardPanel.module.css';

// The server's "week" is a rolling seven days, not the calendar week, so the label says so.
const PERIODS: { value: StatsPeriod; label: string; phrase: string }[] = [
  { value: 'today', label: 'Today', phrase: 'today' },
  { value: 'week', label: 'Past 7 days', phrase: 'in the past 7 days' },
  { value: 'alltime', label: 'All time', phrase: 'in all' },
];

const QUEUEDLE_RANK_INFO: Array<{ key: Exclude<GameRankTierKey, 'provisional'>; name: string; range: string }> = [
  { key: 'skip-button-survivor', name: 'Skip button survivor', range: 'Under 40%' },
  { key: 'background-bopper', name: 'Background bopper', range: '40% to 54.9%' },
  { key: 'aux-cable-apprentice', name: 'Aux cable apprentice', range: '55% to 69.9%' },
  { key: 'algorithm-whisperer', name: 'Algorithm whisperer', range: '70% to 84.9%' },
  { key: 'playlist-prophet', name: 'Playlist prophet', range: '85% and up' },
];

/** People with a card of their own; the rest of the top 10 sit on one line under them. */
const CARD_PEOPLE = 6;

const queued = (n: number) => `${n.toLocaleString()} queued`;

/** What every track, album and artist on the page needs to open, prefetch, queue and right-click. */
function useStatsNav(onAddToQueue?: (item: SonosItem) => void) {
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const queryClient = useQueryClient();
  const { showTrackMenu } = useTrackContextMenu();

  const openAlbum = (a: { album?: string; title: string; albumId?: string; artist: string; serviceId?: string; accountId?: string }) => {
    if (a.albumId) openItem(statsAlbumToItem({ ...a, album: a.album ?? a.title, count: 0 }));
    else
      void resolveAndOpen(a.album || a.title, 'album', {
        artist: primaryArtistName(a.artist),
        serviceId: a.serviceId,
        accountId: a.accountId,
      });
  };
  // Only the first credited name can use the row's artist id.
  const openArtist = (name: string, a: { artistId?: string; serviceId?: string; accountId?: string }, isFirst: boolean) => {
    if (isFirst && a.artistId) openItem(statsArtistToItem({ artist: name, ...a, count: 0 }));
    else void resolveAndOpen(name, 'artist', { serviceId: a.serviceId, accountId: a.accountId });
  };
  const prefetchAlbum = (a: { albumId?: string; serviceId?: string; accountId?: string }) => {
    if (a.albumId && a.serviceId && a.accountId)
      void queryClient.prefetchQuery(albumQueryOptions(a.albumId, a.serviceId, a.accountId, undefined));
  };

  /** A chart row's title, artist links, art, open, prefetch, + and context menu. */
  const trackProps = (t: StatsTrack) => {
    const item = statsTrackToItem(t);
    return {
      title: t.trackName,
      artists: <ArtistLinks artist={t.artist} onOpenArtist={(name, isFirst) => openArtist(name, t, isFirst)} />,
      imageUrl: t.imageUrl,
      onOpen: () => openAlbum({ ...t, title: t.trackName }),
      onMouseEnter: () => prefetchAlbum(t),
      onAdd: item && onAddToQueue ? () => onAddToQueue(item) : undefined,
      onContextMenu: (e: React.MouseEvent) => {
        if (!t.uri) return;
        showTrackMenu(
          {
            track: trackPayload({ ...t, uri: t.uri, albumName: t.album }),
            sonosItem: item ?? undefined,
          },
          e,
        );
      },
    };
  };

  return { openAlbum, openArtist, prefetchAlbum, trackProps };
}

type StatsNav = ReturnType<typeof useStatsNav>;

/** A circular artist tile: the artist's own photo when the service has one, else the art the events carried. */
function ArtistTile({ a, nav, size }: { a: StatsArtist; nav: StatsNav; size?: 'md' | 'sm' }) {
  const { data: photo } = useArtistImage(a.artistId, a.serviceId, a.accountId);
  return (
    <ImageTile
      circular
      size={size}
      title={a.artist}
      sub={queued(a.count)}
      imageUrl={photo ?? a.imageUrl}
      onOpen={() => nav.openArtist(a.artist, a, true)}
    />
  );
}

/** Three circles at the sm tile's size while a person's artists load. */
function TileSkeleton() {
  return (
    <div className={styles.trio} aria-hidden="true">
      {[0, 1, 2].map((r) => (
        <div key={r} className={`skeleton ${styles.skelCircle}`} />
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className={styles.skelRows} aria-hidden="true">
      {[0, 1, 2].map((r) => (
        <div key={r} className={styles.skelRow}>
          <div className={`skeleton ${styles.skelThumb}`} />
          <div className={`skeleton ${styles.skelLine}`} />
        </div>
      ))}
    </div>
  );
}

function RankInfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Queuedle rank tiers" onClose={onClose} size="lg" closeLabel="Close rank info">
      <p className={styles.dialogText}>
        Rank tiers use your all-time Queuedle percentage: total points earned divided by total possible points
        across games played. You need 3 played days before a tier unlocks; until then you're provisional.
      </p>
      <ul className={styles.tiers}>
        {QUEUEDLE_RANK_INFO.map((tier) => (
          <li key={tier.key} className={styles.tierCard}>
            <span className={styles.tierName}>{tier.name}</span>
            <span className={styles.tierRange}>{tier.range}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** The page's first paint while stats load: person cards and a chart at their real size. */
function PageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`skeleton ${styles.skelTitle}`} />
      <div className={`${styles.people} ${styles.section}`}>
        {Array.from({ length: CARD_PEOPLE }, (_, i) => (
          <div key={i} className={styles.skelCard}>
            <div className={`skeleton ${styles.skelHead}`} />
            <TileSkeleton />
          </div>
        ))}
      </div>
      <div className={styles.skelCard}>
        <RowSkeleton />
      </div>
    </div>
  );
}

interface Props {
  /** Queues a track or album from the charts. Without it the + buttons are hidden. */
  onAddToQueue?: (item: SonosItem) => void;
}

export function LeaderboardPanel({ onAddToQueue }: Props) {
  const navigate = useNavigate();
  const nav = useStatsNav(onAddToQueue);
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [rankInfoOpen, setRankInfoOpen] = useState(false);
  // 50 shares Home's "Trending this week" cache; the page shows the top 10 to 12 of each list.
  const { data, isLoading, error } = useStats(period, undefined, 50);
  const { data: users = [] } = useUsers(true, true);
  const imageByUser = new Map(users.map((u) => [u.userId, u.imageUrl]));
  const rankings = useGameRankings(null, true);

  const topUsers = data?.topUsers ?? [];
  const carded = topUsers.slice(0, CARD_PEOPLE);
  const others = topUsers.slice(CARD_PEOPLE);
  // Each carded person's own top tracks for the period: what they queued, not just how much.
  const personStats = useQueries({ queries: carded.map((u) => statsQueryOptions(period, u.userId)) });

  const profile = (user: string) => navigate(`/profile/${encodeURIComponent(user)}`);
  const phrase = PERIODS.find((p) => p.value === period)?.phrase ?? '';
  const loaded = data && !data.error && !isLoading;
  const tracks = data?.topTracks.slice(0, 10) ?? [];
  const artists = mergeArtists(data?.topArtists ?? []).slice(0, 12);
  // When every album was queued once, the order is arbitrary: no chart.
  const topAlbums = data?.topAlbums ?? [];
  const albums = (topAlbums[0]?.count ?? 0) > 1 ? topAlbums.slice(0, 12) : [];
  const summary = loaded ? queuedSummary(data.topUsers, phrase) : null;
  const allRankings = rankings.data ?? [];
  // Equal averages share a place (1, 1, 3), as on the Queuedle page.
  const places = competitionRanks(allRankings.map((r) => r.averageTotal));
  const standings = allRankings.slice(0, 5);

  return (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>Leaderboard</h1>
            <p className={styles.premise}>
              {summary ?? 'Who has been queuing what'}
            </p>
          </div>
          <div className={styles.segments} role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={styles.segment}
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading && <PageSkeleton />}
        {!isLoading && (error || data?.error) && <div className={styles.msg}>{data?.error ?? 'Failed to load stats'}</div>}

        {loaded && data.totalEvents === 0 && (
          <SectionCard className={styles.section}>
            <p className={styles.empty}>Nothing queued {phrase} yet.</p>
          </SectionCard>
        )}

        {loaded && carded.length > 0 && (
          <section className={styles.section} aria-labelledby="lb-people">
            <h2 id="lb-people" className={styles.bandTitle}>Top queuers</h2>
            <div className={styles.people}>
              {carded.map((u, i) => {
                const q = personStats[i];
                // Per person a week's tracks are mostly queued once each; their artists carry the taste.
                const theirs = mergeArtists(q?.data?.topArtists ?? []).slice(0, 3);
                return (
                  <PersonCard
                    key={u.userId}
                    name={u.userId}
                    imageUrl={imageByUser.get(u.userId)}
                    caption={`${ordinal(i + 1)} · ${queued(u.count)}`}
                    onOpen={() => profile(u.userId)}
                  >
                    {q?.isPending ? (
                      <TileSkeleton />
                    ) : (
                      theirs.length > 0 && (
                        <div className={styles.trio} role="list" aria-label={`${u.userId}'s most queued artists`}>
                          {theirs.map((a, j) => (
                            <div key={`${a.artistId ?? a.artist}-${j}`} role="listitem">
                              <ArtistTile a={a} nav={nav} size="sm" />
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </PersonCard>
                );
              })}
            </div>
            {others.length > 0 && (
              <ol className={styles.others} start={CARD_PEOPLE + 1} aria-label="Also queuing">
                {others.map((u, i) => (
                  <li key={u.userId}>
                    <button type="button" className={styles.face} onClick={() => profile(u.userId)} aria-label={`${u.userId}, ${ordinal(CARD_PEOPLE + i + 1)}, ${queued(u.count)}, open profile`}>
                      <span className={styles.faceRank}>{CARD_PEOPLE + i + 1}</span>
                      <UserAvatar name={u.userId} imageUrl={imageByUser.get(u.userId)} className={styles.faceAvatar} />
                      <span className={styles.faceName}>{u.userId}</span>
                      <span className={styles.faceCount}>{u.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {loaded && artists.length > 0 && (
          <SectionCard className={styles.section} title="Top artists">
            <div className={styles.artistGrid}>
              {artists.map((a, i) => (
                <ArtistTile key={`${a.artistId ?? a.artist}-${i}`} a={a} nav={nav} />
              ))}
            </div>
          </SectionCard>
        )}

        {loaded && (tracks.length > 0 || albums.length > 0) && (
          <div className={styles.split}>
            {tracks.length > 0 && (
              <SectionCard title="Top tracks">
                <ChartHead labels={['#', 'Title', 'Artist', 'Queued']} />
                <ol className={styles.list}>
                  {tracks.map((t, i) => {
                    const item = statsTrackToItem(t);
                    return (
                      <ChartRow
                        key={`${t.uri ?? t.trackName}-${i}`}
                        rank={i + 1}
                        count={t.count}
                        countLabel={`Queued ${t.count === 1 ? 'once' : `${t.count} times`}`}
                        onDragStart={
                          item
                            ? (e) => {
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData('application/sonos-item-list', JSON.stringify([item]));
                              }
                            : undefined
                        }
                        {...nav.trackProps(t)}
                      />
                    );
                  })}
                </ol>
              </SectionCard>
            )}
            {albums.length > 0 && (
              <SectionCard title="Top albums">
                <div className={styles.albumGrid}>
                  {albums.map((a, i) => (
                    <ImageTile
                      key={`${a.albumId ?? a.album}-${i}`}
                      size="sm"
                      title={a.album}
                      sub={a.artist}
                      meta={queued(a.count)}
                      imageUrl={a.imageUrl}
                      onOpen={() => nav.openAlbum({ ...a, title: a.album })}
                      onHover={() => nav.prefetchAlbum(a)}
                      onAdd={a.albumId && onAddToQueue ? () => onAddToQueue(statsAlbumToItem(a)) : undefined}
                    />
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {(rankings.isLoading || standings.length > 0) && (
          <SectionCard
            className={styles.section}
            title="Queuedle"
            headContent={<span className={styles.headNote}>All-time average</span>}
            actions={
              <>
                <SeeAll label="How ranks work" onClick={() => setRankInfoOpen(true)} />
                <SeeAll onClick={() => navigate('/queuedle')} />
              </>
            }
          >
            {rankings.isLoading ? (
              <RowSkeleton />
            ) : (
              <>
                <div className={`${styles.standing} ${styles.standingHead}`} aria-hidden="true">
                  <span>#</span>
                  <span>Player</span>
                  <span>Tier</span>
                  <span className={styles.games}>Games</span>
                  <span className={styles.averageHead}>Avg score</span>
                </div>
                <ol className={styles.list}>
                  {standings.map((r, i) => (
                    <li key={r.userName} className={styles.standing}>
                      <span className={styles.standingRank}>{String(places[i]).padStart(2, '0')}</span>
                      <button type="button" className={styles.standingWho} onClick={() => profile(r.userName)} aria-label={`${r.userName}, open profile`}>
                        <UserAvatar name={r.userName} imageUrl={imageByUser.get(r.userName)} className={styles.standingAvatar} />
                        <span className={styles.standingName}>{r.userName}</span>
                      </button>
                      <span>
                        <span className={`${styles.tierChip}${r.isProvisional ? ' ' + styles.provisional : ''}`}>{r.tierName}</span>
                      </span>
                      <span className={styles.games}>
                        {r.gamesPlayed} {r.gamesPlayed === 1 ? 'game' : 'games'}
                      </span>
                      <span className={styles.average} title={`${r.averagePercent.toFixed(0)}% of possible points`}>
                        {r.averageTotal.toFixed(1)}
                        <span className={styles.srOnly}> average score</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </SectionCard>
        )}
      </div>

      {rankInfoOpen && <RankInfoDialog onClose={() => setRankInfoOpen(false)} />}
    </div>
  );
}
