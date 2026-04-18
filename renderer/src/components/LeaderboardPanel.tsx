import { useState } from 'react';
import { useStats, StatsPeriod } from '../hooks/useStats';
import styles from '../styles/LeaderboardPanel.module.css';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This week' },
  { value: 'alltime', label: 'All time' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPanel() {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const { data, isLoading, error, refetch } = useStats(period);

  const maxUserCount = data?.topUsers[0]?.count ?? 1;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Leaderboard</h1>
        <div className={styles.periodTabs}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              className={`${styles.periodBtn}${period === p.value ? ' ' + styles.active : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={() => refetch()} title="Refresh">↺</button>
      </div>

      {isLoading && <div className={styles.state}>Loading…</div>}
      {(error || data?.error) && (
        <div className={styles.state}>
          {data?.error ?? 'Failed to load stats'}
        </div>
      )}

      {data && !data.error && !isLoading && (
        <div className={styles.body}>
          {/* ── Top queuers ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top queuers</h2>
            {data.topUsers.length === 0
              ? <div className={styles.empty}>No data yet for this period</div>
              : data.topUsers.map((u, i) => (
                <div key={u.userId} className={styles.userRow}>
                  <span className={styles.rank}>
                    {i < 3 ? MEDALS[i] : <span className={styles.rankNum}>{i + 1}</span>}
                  </span>
                  <span className={styles.userName}>{u.userId}</span>
                  <div className={styles.barWrap}>
                    <div
                      className={styles.bar}
                      style={{ width: `${Math.round((u.count / maxUserCount) * 100)}%` }}
                    />
                  </div>
                  <span className={styles.count}>{u.count}</span>
                </div>
              ))
            }
          </section>

          <div className={styles.columns}>
            {/* ── Top tracks ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top tracks</h2>
              {data.topTracks.length === 0
                ? <div className={styles.empty}>No data yet</div>
                : data.topTracks.map((t, i) => (
                  <div key={i} className={styles.trackRow}>
                    {t.imageUrl
                      ? <img className={styles.art} src={t.imageUrl} alt="" loading="lazy" />
                      : <div className={styles.artPlaceholder} />
                    }
                    <div className={styles.trackInfo}>
                      <span className={styles.trackName}>{t.trackName}</span>
                      <span className={styles.trackSub}>
                        {t.artist}{t.album ? ` · ${t.album}` : ''}
                      </span>
                    </div>
                    <span className={styles.count}>{t.count}×</span>
                  </div>
                ))
              }
            </section>

            {/* ── Top artists ── */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top artists</h2>
              {data.topArtists.length === 0
                ? <div className={styles.empty}>No data yet</div>
                : data.topArtists.map((a, i) => (
                  <div key={i} className={styles.artistRow}>
                    <span className={styles.rankNum}>{i + 1}</span>
                    <span className={styles.artistName}>{a.artist}</span>
                    <span className={styles.count}>{a.count}×</span>
                  </div>
                ))
              }
            </section>
          </div>

          <div className={styles.footer}>
            {data.totalEvents} queue events{data.periodStart > 0 ? ` since ${new Date(data.periodStart).toLocaleDateString()}` : ' total'}
          </div>
        </div>
      )}
    </div>
  );
}
