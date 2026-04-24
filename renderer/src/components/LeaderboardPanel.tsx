import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStats, StatsPeriod } from '../hooks/useStats';
import { useGameLeaderboard } from '../hooks/useDailyGame';
import { useImage } from '../hooks/useImage';
import styles from '../styles/LeaderboardPanel.module.css';
import queuedleStyles from '../styles/Queuedle.module.css';

function CachedArt({ url, className }: { url: string | undefined; className: string }) {
  const cached = useImage(url ?? null);
  if (!cached) return <div className={className} data-placeholder />;
  return <img className={className} src={cached} alt="" loading="lazy" />;
}

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'alltime', label: 'All time' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

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
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useStats(period, selectedUser ?? undefined);
  const navigate = useNavigate();
  const queuedleLeaderboard = useGameLeaderboard();
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    window.sonos.getDisplayName().then(setMyName).catch(() => {});
  }, []);
  const queuedleScores =
    queuedleLeaderboard.data && 'scores' in queuedleLeaderboard.data
      ? queuedleLeaderboard.data.scores
      : [];
  const hasPlayedToday = !!(myName && queuedleScores.some((s) => s.userName === myName));
  const [queuedleOpen, setQueuedleOpen] = useState(true);

  const maxUserCount = data?.topUsers?.[0]?.count ?? 1;

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
              className={`${styles.periodBtn}${period === p.value ? ' ' + styles.active : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={() => refetch()} title="Refresh">
          ↺
        </button>
      </div>

      {isLoading && <div className={styles.state}>Loading…</div>}
      {(error || data?.error) && <div className={styles.state}>{data?.error ?? 'Failed to load stats'}</div>}

      {data && !data.error && !isLoading && (
        <div className={styles.body}>
          {!selectedUser && !hasPlayedToday && (
            <div className={queuedleStyles.banner}>
              <span className={queuedleStyles.bannerText}>
                Today&apos;s Queuedle is ready — test how well you know the office&apos;s taste.
              </span>
              <button className={queuedleStyles.bannerCta} onClick={() => navigate('/queuedle')}>
                Play
              </button>
            </div>
          )}

          {!selectedUser && queuedleScores.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Today&apos;s Queuedle</h2>
                <button
                  className={styles.collapseBtn}
                  onClick={() => setQueuedleOpen((o) => !o)}
                  title={queuedleOpen ? 'Collapse' : 'Expand'}
                >
                  {queuedleOpen ? '▾' : '▸'}
                </button>
              </div>
              {queuedleOpen && queuedleScores.slice(0, 10).map((s, i) => (
                <div key={s.userName} className={queuedleStyles.scoreRow}>
                  <span className={queuedleStyles.scoreRank}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </span>
                  <span className={queuedleStyles.scoreName}>{s.userName}</span>
                  <span className={queuedleStyles.scoreBreakdown}>
                    {s.mainScore}/10 · {s.bonusScore}/10
                  </span>
                  <span className={queuedleStyles.scoreTotal}>{s.total}</span>
                </div>
              ))}
            </section>
          )}

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
                    <span className={styles.userName}>{u.userId}</span>
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
                          <button
                            className={styles.artistLink}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (t.artistId && t.serviceId && t.accountId)
                                navigate(`/artist/${encodeURIComponent(t.artistId)}`, {
                                  state: {
                                    item: {
                                      type: 'ARTIST',
                                      resource: { type: 'ARTIST', id: { objectId: t.artistId, serviceId: t.serviceId, accountId: t.accountId } },
                                    },
                                  },
                                });
                              else navigate(`/search?q=${encodeURIComponent(t.artist)}`);
                            }}
                          >
                            {t.artist}
                          </button>
                        ) : null}
                        {t.artist && t.album ? ' · ' : null}
                        {t.album ? (
                          <button
                            className={styles.artistLink}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (t.albumId && t.serviceId && t.accountId)
                                navigate(`/album/${encodeURIComponent(t.albumId)}`, {
                                  state: { item: { type: 'ALBUM', id: { objectId: t.albumId, serviceId: t.serviceId, accountId: t.accountId } } },
                                });
                              else navigate(`/search?q=${encodeURIComponent(t.album!)}`);
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
                    {a.imageUrl
                      ? <CachedArt url={a.imageUrl} className={styles.artistArt} />
                      : <div className={styles.artistArtPh} />}
                    <button
                      className={styles.artistLink}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (a.artistId && a.serviceId && a.accountId)
                          navigate(`/artist/${encodeURIComponent(a.artistId)}`, {
                            state: {
                              item: { type: 'ARTIST', resource: { type: 'ARTIST', id: { objectId: a.artistId, serviceId: a.serviceId, accountId: a.accountId } } },
                            },
                          });
                        else navigate(`/search?q=${encodeURIComponent(a.artist)}`);
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
                    style={{ cursor: (a.albumId && a.serviceId && a.accountId) ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (a.albumId && a.serviceId && a.accountId)
                        navigate(`/album/${encodeURIComponent(a.albumId)}`, {
                          state: { item: { type: 'ALBUM', id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId } } },
                        });
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
                          <button
                            className={styles.artistLink}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (a.artistId && a.serviceId && a.accountId)
                                navigate(`/artist/${encodeURIComponent(a.artistId)}`, {
                                  state: {
                                    item: {
                                      type: 'ARTIST',
                                      resource: { type: 'ARTIST', id: { objectId: a.artistId, serviceId: a.serviceId, accountId: a.accountId } },
                                    },
                                  },
                                });
                              else navigate(`/search?q=${encodeURIComponent(a.artist)}`);
                            }}
                          >
                            {a.artist}
                          </button>
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
    </div>
  );
}
