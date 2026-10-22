import type { ReactNode } from 'react';
import type { GameRanking } from '../../hooks/useDailyGame';
import { SectionCard } from '../common/SectionCard';
import { UserAvatar } from '../common/UserAvatar';
import { competitionRanks, formatGameDateShort } from './format';
import styles from '../../styles/Queuedle.module.css';

export type LeaderboardTab = 'today' | 'ranked';

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
  tab, onTab, gameId, scores, rankings, rankingsLoading, me, imageByUser, onOpenProfile,
}: Props) {
  const ranks = competitionRanks(scores.map((s) => s.total));
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
  const title = tab === 'today' ? (gameId ? `Leaderboard for ${todayLabel}` : "Today's leaderboard") : 'Ranked leaderboard';
  const head: [string, string, string] = tab === 'today' ? ['Player', 'Rounds', 'Total'] : ['Player', '', 'Avg score'];

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
          {(['today', 'ranked'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              className={styles.segment}
              onClick={() => onTab(t)}
            >
              {t === 'today' ? todayLabel : 'Ranked'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'ranked' && (
        <p className={styles.boardNote}>Average score across every game you&apos;ve played. Three games earn a tier.</p>
      )}
      {tab === 'ranked' && rankingsLoading ? (
        <ol className={styles.board} aria-label="Loading rankings">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className={styles.boardRow}>
              <span />
              <span className={`skeleton ${styles.boardSkel}`} style={{ animationDelay: `${i * 0.1}s` }} />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <p className={styles.boardNote}>{tab === 'ranked' ? 'No ranked scores yet.' : 'Nobody has played yet.'}</p>
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
