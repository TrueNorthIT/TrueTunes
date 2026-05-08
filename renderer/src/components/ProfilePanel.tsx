import { useParams } from 'react-router-dom';
import { useRecentlyPlayed } from '../hooks/useRecentlyPlayed';
import { useUserStats } from '../hooks/useUserStats';
import { useGameRankings } from '../hooks/useDailyGame';
import { getGameRankIcon } from '../lib/gameRankAssets';
import { useOpenItem } from '../hooks/useOpenItem';
import { CardRow } from './CardRow';
import { MediaRow } from './common/MediaRow';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/ProfilePanel.module.css';

function getAvatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue},55%,38%), hsl(${(hue + 40) % 360},60%,28%))`,
  };
}

interface Props {
  onAddToQueue: (item: SonosItem) => void;
}

export function ProfilePanel({ onAddToQueue }: Props) {
  const { userName } = useParams<{ userName: string }>();
  const openItem = useOpenItem();

  const { artistItems: recentArtists, albumItems: recentAlbums, isLoading: recentLoading } =
    useRecentlyPlayed(userName);

  const { topTracks, artistItems: topArtists, albumItems: topAlbums, totalEvents, isLoading: statsLoading } =
    useUserStats(userName);

  const { data: rankings } = useGameRankings(userName, !!userName);
  const ranking = rankings?.find(r => r.userName === userName) ?? null;

  if (!userName) return null;

  const tierIcon = ranking ? getGameRankIcon(ranking.tierKey) : null;
  const hasRecent = recentLoading || recentArtists.length > 0 || recentAlbums.length > 0;

  return (
    <div className={styles.panel}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.avatar} style={getAvatarStyle(userName)}>
          {userName[0].toUpperCase()}
        </div>
        <div className={styles.headerInfo}>
          <h1 className={styles.userName}>{userName}</h1>
          <div className={styles.headerMeta}>
            {ranking && (
              <span className={styles.tierBadge}>
                {tierIcon && <img src={tierIcon} alt="" className={styles.tierIcon} />}
                {ranking.isProvisional ? 'Provisional' : ranking.tierName}
              </span>
            )}
            {totalEvents > 0 && (
              <span className={styles.statChip}>
                <span className={styles.statChipValue}>{totalEvents.toLocaleString()}</span> total plays
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Recently Played ──────────────────────────────────────────────── */}
      {hasRecent && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recently Played — Last 7 Days</h2>
          {recentLoading || recentArtists.length > 0 ? (
            <>
              <p className={styles.subSectionTitle}>Artists</p>
              <CardRow items={recentArtists} isLoading={recentLoading} onAdd={onAddToQueue} onOpen={openItem} />
            </>
          ) : null}
          {recentLoading || recentAlbums.length > 0 ? (
            <>
              <p className={styles.subSectionTitle}>Albums</p>
              <CardRow items={recentAlbums} isLoading={recentLoading} onAdd={onAddToQueue} onOpen={openItem} />
            </>
          ) : null}
          {!recentLoading && recentArtists.length === 0 && recentAlbums.length === 0 && (
            <p className={styles.emptyMsg}>Nothing queued in the last 7 days</p>
          )}
        </section>
      )}

      {/* ── Top Played All Time ──────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Top Played — All Time</h2>

        {(statsLoading || topTracks.length > 0) && (
          <>
            <p className={styles.subSectionTitle}>Tracks</p>
            <div className={styles.trackList}>
              {statsLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.skelBlock} style={{ height: 52, marginBottom: 2, animationDelay: `${i * 60}ms` }} />
                  ))
                : topTracks.slice(0, 10).map((t, i) => (
                    <MediaRow
                      key={i}
                      name={t.trackName}
                      subtitle={t.artist + (t.album ? ` · ${t.album}` : '')}
                      artUrl={t.imageUrl}
                      trailing={<span className={styles.countBadge}>{t.count}×</span>}
                    />
                  ))
              }
            </div>
          </>
        )}

        {(statsLoading || topArtists.length > 0) && (
          <>
            <p className={styles.subSectionTitle}>Artists</p>
            <CardRow items={topArtists} isLoading={statsLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </>
        )}

        {(statsLoading || topAlbums.length > 0) && (
          <>
            <p className={styles.subSectionTitle}>Albums</p>
            <CardRow items={topAlbums} isLoading={statsLoading} onAdd={onAddToQueue} onOpen={openItem} />
          </>
        )}

        {!statsLoading && topTracks.length === 0 && topArtists.length === 0 && topAlbums.length === 0 && (
          <p className={styles.emptyMsg}>No plays recorded yet</p>
        )}
      </section>

      {/* ── Queuedle Stats ───────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Queuedle</h2>
        {ranking ? (
          <>
            <div className={styles.queuedleMeta}>
              <span className={styles.tierBadge}>
                {tierIcon && <img src={tierIcon} alt="" className={styles.tierIcon} />}
                {ranking.isProvisional ? 'Provisional' : ranking.tierName}
              </span>
            </div>
            <div className={styles.queuedleStats}>
              <div className={styles.statCell}>
                <span className={styles.statCellValue}>{ranking.gamesPlayed}</span>
                <span className={styles.statCellLabel}>Games</span>
              </div>
              <div className={styles.statCell}>
                <span className={styles.statCellValue}>{ranking.averageTotal.toFixed(1)}</span>
                <span className={styles.statCellLabel}>Avg Score</span>
              </div>
              <div className={styles.statCell}>
                <span className={styles.statCellValue}>{ranking.bestTotal}</span>
                <span className={styles.statCellLabel}>Best Score</span>
              </div>
              <div className={styles.statCell}>
                <span className={styles.statCellValue}>{ranking.averagePercent.toFixed(0)}%</span>
                <span className={styles.statCellLabel}>Avg %</span>
              </div>
            </div>
          </>
        ) : (
          <p className={styles.emptyMsg}>No Queuedle data yet</p>
        )}
      </section>
    </div>
  );
}
