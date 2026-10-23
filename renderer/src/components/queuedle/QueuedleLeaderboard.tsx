import type { ReactNode } from 'react';
import type { GameRanking } from '../../hooks/useDailyGame';
import { SectionCard } from '../common/SectionCard';
import { UserAvatar } from '../common/UserAvatar';
import { competitionRanks, formatGameDateShort } from './format';
import { formatWeekRange, weekRangeOf, type WeeklyStanding } from '../../lib/queuedleWeek';
import styles from '../../styles/Queuedle.module.css';

export type LeaderboardTab = 'today' | 'week' | 'ranked';

type ScoreRow = Pick<GameScoreDoc, 'userName' | 'mainScore' | 'bonusScore' | 'total'>;

interface Props {
  tab: LeaderboardTab;
  onTab: (tab: LeaderboardTab) => void;
  /** The past game being viewed, or null for today. */
  gameId: string | null;
  /** Sorted by total, highest first. */
  scores: ScoreRow[];
  rankings: GameRanking[];
  rankingsLoading: boolean;
  /** The Monday to Sunday week of the viewed game, summed. */
  weekly?: WeeklyStanding[];
  weeklyLoading?: boolean;
  /** The game being viewed, which decides the week. */
  viewedGameId?: string;
  me: string | null;
  imageByUser: Map<string, string | null | undefined>;
  onOpenProfile: (name: string) => void;
}

const LIMIT = 10;

interface Row {
  key: string;
  rank: number;
  name: string;
  /** Second line under the name. */
  sub?: ReactNode;
  /** The middle column (Today: the two round scores). */
  detail?: ReactNode;
  value: string;
}

/** Today's scores or the all-time ranking, with faces; your own row is lit and always shown. */
export function QueuedleLeaderboard({
  tab, onTab, gameId, scores, rankings, rankingsLoading, weekly = [], weeklyLoading = false, viewedGameId, me, imageByUser, onOpenProfile,
}: Props) {
  const ranks = competitionRanks(scores.map((s) => s.total));
  const weeklyRanks = competitionRanks(weekly.map((w) => w.total));
  const rows: Row[] =
    tab === 'today'
      ? scores.map((s, i) => ({
          key: s.userName,
          rank: ranks[i],
          name: s.userName,
          detail: (
            <span title={`Higher or lower ${s.mainScore}, top queuer ${s.bonusScore}`}>
              {s.mainScore} + {s.bonusScore}
            </span>
          ),
          value: String(s.total),
        }))
      : tab === 'week'
      ? weekly.map((w, i) => ({
          key: w.userName,
          rank: weeklyRanks[i],
          name: w.userName,
          sub: <span>{`${w.gamesPlayed} ${w.gamesPlayed === 1 ? 'game' : 'games'} · best ${w.bestTotal}`}</span>,
          value: String(w.total),
        }))
      : rankings.map((r, i) => ({
          key: r.userName,
          rank: i + 1,
          name: r.userName,
          // The tier is its name in a tonal chip (sentence-cased in CSS), the same chip as the Leaderboard page.
          sub: (
            <>
              <span className={`${styles.tierChip}${r.isProvisional ? ' ' + styles.provisional : ''}`}>{r.tierName}</span>
              <span>
                {r.gamesPlayed} {r.gamesPlayed === 1 ? 'game' : 'games'}
              </span>
            </>
          ),
          value: r.averageTotal.toFixed(1),
        }));

  // Top ten, plus your own row underneath when you're further down.
  const myIndex = me ? rows.findIndex((r) => r.name === me) : -1;
  const shown = rows.slice(0, LIMIT);
  const extra = myIndex >= LIMIT ? rows[myIndex] : null;

  const todayLabel = gameId ? formatGameDateShort(gameId) : 'Today';
  const weekRange = viewedGameId ? weekRangeOf(viewedGameId) : null;
  const title =
    tab === 'today'
      ? gameId ? `Leaderboard for ${todayLabel}` : "Today's leaderboard"
      : tab === 'week'
        ? `Week leaderboard${weekRange ? ` · ${formatWeekRange(weekRange)}` : ''}`
        : 'Ranked leaderboard';
  const head: [string, string, string] =
    tab === 'today' ? ['Player', 'Rounds', 'Total'] : tab === 'week' ? ['Player', '', 'Total'] : ['Player', '', 'Avg score'];
  const loading = tab === 'ranked' ? rankingsLoading : tab === 'week' && weeklyLoading;

  const renderRow = (r: Row) => (
    <li key={r.key} className={`${styles.boardRow}${r.name === me ? ' ' + styles.boardRowMe : ''}`}>
      <span className={styles.boardRank}>{r.rank}</span>
      <span className={styles.person}>
        <UserAvatar name={r.name} imageUrl={imageByUser.get(r.name)} className={styles.personAvatar} />
        <span className={styles.personText}>
          <button type="button" className={styles.personName} onClick={() => onOpenProfile(r.name)} title={`${r.name}'s profile`}>
            {r.name}
          </button>
          {r.sub && <span className={styles.personSub}>{r.sub}</span>}
        </span>
      </span>
      <span className={styles.boardDetail}>{r.detail}</span>
      <span className={styles.boardValue}>{r.value}</span>
    </li>
  );

  return (
    <SectionCard
      title={title}
      className={styles.boardCard}
      actions={
        <div className={styles.segments} role="group" aria-label="Leaderboard view">
          {(['today', 'week', 'ranked'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              className={styles.segment}
              onClick={() => onTab(t)}
            >
              {t === 'today' ? todayLabel : t === 'week' ? 'Week' : 'Ranked'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'ranked' && (
        <p className={styles.boardNote}>Average score across every game you&apos;ve played. Three games earn a tier.</p>
      )}
      {loading ? (
        <ol className={styles.board} aria-label={tab === 'week' ? 'Loading this week' : 'Loading rankings'}>
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className={styles.boardRow}>
              <span />
              <span className={`skeleton ${styles.boardSkel}`} style={{ animationDelay: `${i * 0.1}s` }} />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <p className={styles.boardNote}>
          {tab === 'ranked' ? 'No ranked scores yet.' : tab === 'week' ? 'No scores this week yet.' : 'Nobody has played yet.'}
        </p>
      ) : (
        <>
          <div className={`${styles.boardRow} ${styles.boardHead}`}>
            <span />
            <span>{head[0]}</span>
            <span className={styles.boardDetail}>{head[1]}</span>
            <span className={styles.boardValue}>{head[2]}</span>
          </div>
          <ol className={styles.board}>
            {shown.map(renderRow)}
            {extra && (
              <>
                <li className={styles.boardGap} aria-hidden="true">…</li>
                {renderRow(extra)}
              </>
            )}
          </ol>
        </>
      )}
    </SectionCard>
  );
}
