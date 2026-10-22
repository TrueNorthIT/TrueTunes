import type { ReactNode } from 'react';
import type { GameRanking } from '../../hooks/useDailyGame';
import { getGameRankIcon } from '../../lib/gameRankAssets';
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
  maxPerRound: number;
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
  detail: ReactNode;
  value: string;
}

/** Today's scores or the all-time ranking, with faces; your own row is lit and always shown. */
export function QueuedleLeaderboard({
  tab, onTab, gameId, scores, maxPerRound, rankings, rankingsLoading, me, imageByUser, onOpenProfile,
}: Props) {
  const ranks = competitionRanks(scores.map((s) => s.total));
  const rows: Row[] =
    tab === 'today'
      ? scores.map((s, i) => ({
          key: s.userName,
          rank: ranks[i],
          name: s.userName,
          detail: (
            <span title="Higher or lower · Top queuer">
              {s.mainScore}/{maxPerRound} · {s.bonusScore}/{maxPerRound}
            </span>
          ),
          value: String(s.total),
        }))
      : rankings.map((r, i) => {
          const icon = getGameRankIcon(r.tierKey);
          return {
            key: r.userName,
            rank: i + 1,
            name: r.userName,
            detail: (
              <>
                <span className={styles.tier}>
                  {icon && <img className={styles.tierIcon} src={icon} alt="" loading="lazy" />}
                  {r.tierName}
                </span>
                <span className={styles.games}>
                  {r.gamesPlayed} {r.gamesPlayed === 1 ? 'game' : 'games'}
                </span>
              </>
            ),
            value: r.averageTotal.toFixed(1),
          };
        });

  // Top ten, plus your own row underneath when you're further down.
  const myIndex = me ? rows.findIndex((r) => r.name === me) : -1;
  const shown = rows.slice(0, LIMIT);
  const extra = myIndex >= LIMIT ? rows[myIndex] : null;

  const todayLabel = gameId ? formatGameDateShort(gameId) : 'Today';
  const title = tab === 'today' ? (gameId ? `Leaderboard for ${todayLabel}` : "Today's leaderboard") : 'Ranked leaderboard';

  const renderRow = (r: Row) => (
    <li key={r.key} className={`${styles.boardRow}${r.name === me ? ' ' + styles.boardRowMe : ''}`}>
      <span className={styles.boardRank}>{r.rank}</span>
      <button type="button" className={styles.person} onClick={() => onOpenProfile(r.name)} title={`${r.name}'s profile`}>
        <UserAvatar name={r.name} imageUrl={imageByUser.get(r.name)} className={styles.personAvatar} />
        <span className={styles.personName}>{r.name}</span>
      </button>
      <span className={styles.boardDetail}>{r.detail}</span>
      <span className={styles.boardValue}>{r.value}</span>
    </li>
  );

  return (
    <SectionCard
      title={title}
      actions={
        <div className={styles.tabs} role="tablist" aria-label="Queuedle leaderboard views">
          {(['today', 'ranked'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`${styles.tab}${tab === t ? ' ' + styles.tabActive : ''}`}
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
        <p className={styles.boardNote}>Loading rankings…</p>
      ) : rows.length === 0 ? (
        <p className={styles.boardNote}>{tab === 'ranked' ? 'No ranked scores yet.' : 'Nobody has played yet.'}</p>
      ) : (
        <ol className={styles.board}>
          {shown.map(renderRow)}
          {extra && (
            <>
              <li className={styles.boardGap} aria-hidden="true">…</li>
              {renderRow(extra)}
            </>
          )}
        </ol>
      )}
    </SectionCard>
  );
}
