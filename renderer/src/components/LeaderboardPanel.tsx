import { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import type { GameRankTierKey } from '../hooks/useDailyGame';
import { useStats, StatsPeriod } from '../hooks/useStats';
import { useGameRankings } from '../hooks/useDailyGame';
import { useImage } from '../hooks/useImage';
import { useArtistImage } from '../hooks/useArtistBrowse';
import { getGameRankIcon, getGameRankInfoImage } from '../lib/gameRankAssets';
import { useResolveAndOpen } from '../hooks/useResolveAndOpen';
import styles from '../styles/LeaderboardPanel.module.css';

function CachedArt({ url, className }: { url: string | undefined; className: string }) {
  const cached = useImage(url ?? null);
  if (!cached) return <div className={className} data-placeholder />;
  return <img className={className} src={cached} alt="" loading="lazy" />;
}

// Tries to fetch the real artist image (so YT Music shows the artist's photo)
// and falls back to whatever the event sent us — typically the track's album
// art. The Sonos artist endpoint needs `defaults` we don't store in events, so
// the fetch quietly returns null on many services; the fallback keeps the row
// looking populated instead of empty.
function ArtistAvatar({
  artistId,
  serviceId,
  accountId,
  fallbackUrl,
  className,
  placeholderClassName,
}: {
  artistId: string | undefined;
  serviceId: string | undefined;
  accountId: string | undefined;
  fallbackUrl?: string;
  className: string;
  placeholderClassName: string;
}) {
  const { data: imageUrl } = useArtistImage(artistId, serviceId, accountId);
  const cached = useImage(imageUrl ?? fallbackUrl ?? null);
  if (!cached) return <div className={placeholderClassName} />;
  return <img className={className} src={cached} alt="" loading="lazy" />;
}

// Multi-artist subtitles arrive as a single joined string (e.g. "Sonny Stitt, Kenny Garrett").
// Rendering them as one button means resolveAndOpen searches for the whole string and never
// matches an individual artist; for album rows the button also swallows the row click via
// stopPropagation. Splitting on commas gives each artist its own link.
function ArtistLinks({
  artist,
  artistId,
  serviceId,
  accountId,
  onNavigateArtist,
  onResolveArtist,
}: {
  artist: string;
  artistId?: string;
  serviceId?: string;
  accountId?: string;
  onNavigateArtist: (name: string, artistId: string, serviceId: string, accountId: string) => void;
  onResolveArtist: (name: string) => void;
}) {
  const parts = artist.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const canUseDirect = parts.length === 1 && !!artistId && !!serviceId && !!accountId;
  return (
    <>
      {parts.map((name, i) => (
        <Fragment key={i}>
          {i > 0 && ', '}
          <button
            className={styles.artistLink}
            onClick={(e) => {
              e.stopPropagation();
              if (canUseDirect) onNavigateArtist(name, artistId!, serviceId!, accountId!);
              else onResolveArtist(name);
            }}
          >
            {name}
          </button>
        </Fragment>
      ))}
    </>
  );
}

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'alltime', label: 'All time' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

const QUEUEDLE_RANK_INFO: Array<{
  key: Exclude<GameRankTierKey, 'provisional'>;
  name: string;
  range: string;
}> = [
  { key: 'skip-button-survivor', name: 'Skip Button Survivor', range: '< 40%' },
  { key: 'background-bopper', name: 'Background Bopper', range: '40% - 54.9%' },
  { key: 'aux-cable-apprentice', name: 'Aux Cable Apprentice', range: '55% - 69.9%' },
  { key: 'algorithm-whisperer', name: 'Algorithm Whisperer', range: '70% - 84.9%' },
  { key: 'playlist-prophet', name: 'Playlist Prophet', range: '85%+' },
];

function makeDragItem(t: StatsTrack) {
  return JSON.stringify([
    {
      type: 'TRACK',
      name: t.trackName,
      artist: t.artist,
      imageUrl: t.imageUrl,
      id: { objectId: t.uri, serviceId: '', accountId: '' },
    },
  ]);
}

export function LeaderboardPanel() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [view, setView] = useState<'stats' | 'queuedle'>('stats');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [rankInfoOpen, setRankInfoOpen] = useState(false);
  const { data, isLoading, error, refetch } = useStats(period, selectedUser ?? undefined);
  const rankings = useGameRankings(null, view === 'queuedle');
  const { resolveAndOpen } = useResolveAndOpen();

  const maxUserCount = data?.topUsers?.[0]?.count ?? 1;
  const isQueuedleView = view === 'queuedle';
  const queuedleRows = rankings.data ?? [];
  const maxQueuedleAverage = queuedleRows[0]?.averageTotal ?? 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {selectedUser && (
            <button className={styles.backBtn} onClick={() => setSelectedUser(null)} title="Back">
              ←
            </button>
          )}
          <h1 className={styles.title}>{selectedUser ? selectedUser : 'Leaderboard'}</h1>
        </div>
        <div className={styles.periodTabs}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`${styles.periodBtn}${!isQueuedleView && period === p.value ? ' ' + styles.active : ''}`}
              onClick={() => {
                setView('stats');
                setPeriod(p.value);
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`${styles.periodBtn}${isQueuedleView ? ' ' + styles.active : ''}`}
            onClick={() => {
              setSelectedUser(null);
              setView('queuedle');
            }}
          >
            Queuedle
          </button>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => (isQueuedleView ? rankings.refetch() : refetch())}
          title="Refresh"
        >
          ↺
        </button>
        <button
          className={styles.infoBtn}
          onClick={() => setRankInfoOpen(true)}
          title="Rank info"
          aria-label="Rank info"
        >
          <Info size={16} strokeWidth={2} />
        </button>
      </div>

      {isQueuedleView && rankings.isLoading && <div className={styles.state}>Loading Queuedle rankings…</div>}
      {isQueuedleView && rankings.error && <div className={styles.state}>Failed to load Queuedle rankings</div>}
      {!isQueuedleView && isLoading && <div className={styles.state}>Loading…</div>}
      {!isQueuedleView && (error || data?.error) && (
        <div className={styles.state}>{data?.error ?? 'Failed to load stats'}</div>
      )}

      {isQueuedleView && !rankings.isLoading && !rankings.error && (
        <div key="queuedle" className={styles.body}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Queuedle all-time average</h2>
            {queuedleRows.length === 0 ? (
              <div className={styles.empty}>No Queuedle scores yet</div>
            ) : (
              queuedleRows.slice(0, 25).map((r, i) => (
                <div key={r.userName} className={styles.queuedleRow}>
                  <span className={styles.rank}>
                    {i < 3 ? MEDALS[i] : <span className={styles.rankNum}>{i + 1}</span>}
                  </span>
                  <button className={styles.userNameBtn} onClick={() => navigate(`/profile/${encodeURIComponent(r.userName)}`)}>{r.userName}</button>
                  <div className={styles.barWrap}>
                    <div
                      className={styles.bar}
                      style={{ width: `${Math.round((r.averageTotal / maxQueuedleAverage) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.queuedleGames}>
                    {r.gamesPlayed} {r.gamesPlayed === 1 ? 'game' : 'games'}
                  </span>
                  <span
                    className={`${styles.rankTier}${r.isProvisional ? ' ' + styles.rankTierProvisional : ''}`}
                    title={`${r.averagePercent.toFixed(0)}% average`}
                    data-tier={r.tierKey}
                  >
                    {getGameRankIcon(r.tierKey) && (
                      <img className={styles.rankTierIcon} src={getGameRankIcon(r.tierKey)!} alt="" loading="lazy" />
                    )}
                    {r.tierName}
                  </span>
                  <span className={styles.count}>{r.averageTotal.toFixed(1)}</span>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {!isQueuedleView && data && !data.error && !isLoading && (
        <div key={`stats-${period}-${selectedUser ?? 'all'}`} className={styles.body}>
          {/* ── Top queuers (leaderboard view only) ── */}
          {!selectedUser && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top queuers</h2>
              {data.topUsers.length === 0 ? (
                <div className={styles.empty}>No data yet for this period</div>
              ) : (
                data.topUsers.map((u, i) => (
                  <div
                    key={u.userId}
                    className={`${styles.userRow} ${styles.userRowClickable}`}
                    onClick={() => setSelectedUser(u.userId)}
                  >
                    <span className={styles.rank}>
                      {i < 3 ? MEDALS[i] : <span className={styles.rankNum}>{i + 1}</span>}
                    </span>
                    <button className={styles.userNameBtn} onClick={e => { e.stopPropagation(); navigate(`/profile/${encodeURIComponent(u.userId)}`); }}>{u.userId}</button>
                    <div className={styles.barWrap}>
                      <div className={styles.bar} style={{ width: `${Math.round((u.count / maxUserCount) * 100)}%` }} />
                    </div>
                    <span className={styles.count}>{u.count}</span>
                  </div>
                ))
              )}
            </section>
          )}

          <div className={styles.columns}>
            {/* ── Top tracks ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top tracks</h2>
              {data.topTracks.length === 0 ? (
                <div className={styles.empty}>No data yet</div>
              ) : (
                data.topTracks.map((t, i) => (
                  <div
                    key={i}
                    className={styles.trackRow}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData('application/sonos-item-list', makeDragItem(t));
                    }}
                  >
                    {t.imageUrl ? (
                      <CachedArt url={t.imageUrl} className={styles.art} />
                    ) : (
                      <div className={styles.artPlaceholder} />
                    )}
                    <div className={styles.trackInfo}>
                      <span className={styles.trackName}>{t.trackName}</span>
                      <span className={styles.trackSub}>
                        {t.artist ? (
                          <ArtistLinks
                            artist={t.artist}
                            artistId={t.artistId}
                            serviceId={t.serviceId}
                            accountId={t.accountId}
                            onNavigateArtist={(name, aid, sid, acc) =>
                              navigate(`/artist/${encodeURIComponent(aid)}`, {
                                state: {
                                  item: {
                                    type: 'ARTIST',
                                    title: name,
                                    name,
                                    resource: {
                                      type: 'ARTIST',
                                      id: { objectId: aid, serviceId: sid, accountId: acc },
                                    },
                                  },
                                },
                              })
                            }
                            onResolveArtist={(name) => resolveAndOpen(name, 'artist', { serviceId: t.serviceId, accountId: t.accountId })}
                          />
                        ) : null}
                        {t.artist && t.album ? ' · ' : null}
                        {t.album ? (
                          <button
                            className={styles.artistLink}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (t.albumId && t.serviceId && t.accountId)
                                navigate(`/album/${encodeURIComponent(t.albumId)}`, {
                                  state: {
                                    item: {
                                      type: 'ALBUM',
                                      id: { objectId: t.albumId, serviceId: t.serviceId, accountId: t.accountId },
                                    },
                                  },
                                });
                              else resolveAndOpen(t.album!, 'album', { artist: t.artist });
                            }}
                          >
                            {t.album}
                          </button>
                        ) : null}
                      </span>
                    </div>
                    <span className={styles.count}>{t.count}×</span>
                  </div>
                ))
              )}
            </section>

            {/* ── Top artists ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top artists</h2>
              {data.topArtists.length === 0 ? (
                <div className={styles.empty}>No data yet</div>
              ) : (
                data.topArtists.map((a, i) => (
                  <div key={i} className={styles.artistRow}>
                    <span className={styles.rankNum}>{i + 1}</span>
                    <ArtistAvatar
                      artistId={a.artistId}
                      serviceId={a.serviceId}
                      accountId={a.accountId}
                      fallbackUrl={a.imageUrl}
                      className={styles.artistArt}
                      placeholderClassName={styles.artistArtPh}
                    />
                    <button
                      className={styles.artistLink}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (a.artistId && a.serviceId && a.accountId)
                          navigate(`/artist/${encodeURIComponent(a.artistId)}`, {
                            state: {
                              item: {
                                type: 'ARTIST',
                                title: a.artist,
                                name: a.artist,
                                imageUrl: a.imageUrl,
                                resource: {
                                  type: 'ARTIST',
                                  id: { objectId: a.artistId, serviceId: a.serviceId, accountId: a.accountId },
                                },
                              },
                            },
                          });
                        else resolveAndOpen(a.artist, 'artist', { serviceId: a.serviceId, accountId: a.accountId });
                      }}
                    >
                      {a.artist}
                    </button>
                    <span className={styles.count}>{a.count}×</span>
                  </div>
                ))
              )}
            </section>

            {/* ── Top albums ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top albums</h2>
              {data.topAlbums.length === 0 ? (
                <div className={styles.empty}>No data yet</div>
              ) : (
                data.topAlbums.map((a, i) => (
                  <div
                    key={i}
                    className={styles.trackRow}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (a.albumId && a.serviceId && a.accountId)
                        navigate(`/album/${encodeURIComponent(a.albumId)}`, {
                          state: {
                            item: {
                              type: 'ALBUM',
                              id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId },
                            },
                          },
                        });
                      else if (a.album) resolveAndOpen(a.album, 'album', { artist: a.artist });
                    }}
                  >
                    {a.imageUrl ? (
                      <CachedArt url={a.imageUrl} className={styles.art} />
                    ) : (
                      <div className={styles.artPlaceholder} />
                    )}
                    <div className={styles.trackInfo}>
                      <span className={styles.trackName}>{a.album}</span>
                      <span className={styles.trackSub}>
                        {a.artist ? (
                          <ArtistLinks
                            artist={a.artist}
                            artistId={a.artistId}
                            serviceId={a.serviceId}
                            accountId={a.accountId}
                            onNavigateArtist={(name, aid, sid, acc) =>
                              navigate(`/artist/${encodeURIComponent(aid)}`, {
                                state: {
                                  item: {
                                    type: 'ARTIST',
                                    title: name,
                                    name,
                                    resource: {
                                      type: 'ARTIST',
                                      id: { objectId: aid, serviceId: sid, accountId: acc },
                                    },
                                  },
                                },
                              })
                            }
                            onResolveArtist={(name) => resolveAndOpen(name, 'artist', { serviceId: a.serviceId, accountId: a.accountId })}
                          />
                        ) : null}
                      </span>
                    </div>
                    <span className={styles.count}>{a.count}×</span>
                  </div>
                ))
              )}
            </section>
          </div>

          <div className={styles.footer}>
            {data.totalEvents} queue event{data.totalEvents !== 1 ? 's' : ''}
            {selectedUser ? ` by ${selectedUser}` : ''}
            {data.periodStart > 0 ? ` since ${new Date(data.periodStart).toLocaleDateString()}` : ' total'}
          </div>
        </div>
      )}

      {rankInfoOpen && (
        <div className={styles.rankInfoOverlay} onClick={() => setRankInfoOpen(false)}>
          <div
            className={styles.rankInfoDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rank-info-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.rankInfoHeader}>
              <h2 id="rank-info-title" className={styles.rankInfoTitle}>
                Queuedle Rank Tiers
              </h2>
              <button
                className={styles.rankInfoClose}
                onClick={() => setRankInfoOpen(false)}
                aria-label="Close rank info"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <p className={styles.rankInfoText}>
              Rank tiers use your all-time Queuedle percentage: total points earned divided by total possible points
              across games played. You need 3 played days before a tier unlocks.
            </p>
            <div className={styles.rankInfoList}>
              {QUEUEDLE_RANK_INFO.map((tier) => {
                const infoImage = getGameRankInfoImage(tier.key);
                return (
                  <div key={tier.key} className={styles.rankInfoRow} data-tier={tier.key}>
                    {infoImage && <img className={styles.rankInfoImage} src={infoImage} alt="" loading="lazy" />}
                    <span className={styles.rankInfoName}>{tier.name}</span>
                    <span className={styles.rankInfoRange}>{tier.range}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.rankInfoFooter}>
              Fewer than 3 played days = Provisional (no tier)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
