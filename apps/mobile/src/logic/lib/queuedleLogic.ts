// Pure Queuedle helpers (ported from the inline logic in desktop QueuedlePanel).
import { computeQueuedleRating, getGameRankTier } from '../hooks/useDailyGame';
import type { GameRanking } from '../hooks/useDailyGame';

export type Side = 'left' | 'right';

export interface RankSnapshot {
  rating: number;
  averagePercent: number;
  gamesPlayed: number;
  tierKey: string;
  tierName: string;
  isProvisional: boolean;
}

/** Today's date (YYYY-MM-DD) in Europe/London, which is how game ids are keyed. */
export function londonDateToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string, d: string) => parts.find((p) => p.type === t)?.value ?? d;
  return `${get('year', '0000')}-${get('month', '01')}-${get('day', '01')}`;
}

/** The item the bonus (top queuer) round asks about for a question. Old games fall back to the winner. */
export function bonusTarget(q: GameQuestion): GameItem {
  const side = q.bonusItem ?? q.winner;
  return side === 'left' ? q.left : q.right;
}

export function winningItems(questions: GameQuestion[]): GameItem[] {
  return questions.map(bonusTarget);
}

export function scoreMain(questions: GameQuestion[], guesses: Side[]): number {
  return guesses.reduce((acc, g, i) => acc + (questions[i] && g === questions[i].winner ? 1 : 0), 0);
}

export function scoreBonus(questions: GameQuestion[], guesses: string[]): number {
  return guesses.reduce((acc, g, i) => acc + (questions[i] && g === bonusTarget(questions[i]).topQueuer ? 1 : 0), 0);
}

/** Which side a carry-over item sat on in the previous question (for context), or null. */
export function carryFromSide(questions: GameQuestion[], idx: number): Side | null {
  const q = questions[idx];
  if (idx === 0 || !q?.carryover) return null;
  const item = q.carryover === 'left' ? q.left : q.right;
  const prev = questions[idx - 1];
  if (prev.left.id === item.id && prev.left.category === item.category) return 'left';
  if (prev.right.id === item.id && prev.right.category === item.category) return 'right';
  return null;
}

export type PipState = 'correct' | 'wrong' | 'current' | 'pending';

export function pipStates(
  questions: GameQuestion[],
  currentIdx: number,
  revealed: boolean,
  guesses: Side[]
): PipState[] {
  return questions.map((q, i) => {
    if (i < currentIdx) return guesses[i] === q.winner ? 'correct' : 'wrong';
    if (i === currentIdx && revealed && guesses[i]) return guesses[i] === q.winner ? 'correct' : 'wrong';
    if (i === currentIdx) return 'current';
    return 'pending';
  });
}

export function snapshotFromRanking(r: GameRanking | null | undefined): RankSnapshot | null {
  if (!r) return null;
  return {
    rating: computeQueuedleRating(r.averagePercent),
    averagePercent: r.averagePercent,
    gamesPlayed: r.gamesPlayed,
    tierKey: r.tierKey,
    tierName: r.tierName,
    isProvisional: r.isProvisional,
  };
}

/** Projected ranking after today's score is added to the user's prior totals. */
export function projectRanking(
  before: GameRanking | null | undefined,
  todayScore: number,
  questionCount: number
): RankSnapshot {
  const totalScore = (before?.totalScore ?? 0) + todayScore;
  const possibleScore = (before?.possibleScore ?? 0) + questionCount * 2;
  const gamesPlayed = (before?.gamesPlayed ?? 0) + 1;
  const averagePercent = possibleScore > 0 ? (totalScore / possibleScore) * 100 : 0;
  const tier = getGameRankTier(averagePercent, gamesPlayed);
  return {
    rating: computeQueuedleRating(averagePercent),
    averagePercent,
    gamesPlayed,
    tierKey: tier.key,
    tierName: tier.name,
    isProvisional: tier.isProvisional,
  };
}

/** Bucket scores 0..max for the distribution chart, as percentages of players. */
export function distribution(scores: number[], maxScore: number): { score: number; pct: number }[] {
  const counts = Array.from({ length: maxScore + 1 }, () => 0);
  scores.forEach((s) => {
    if (s >= 0 && s <= maxScore) counts[s]++;
  });
  return counts.map((c, score) => ({ score, pct: scores.length > 0 ? (c / scores.length) * 100 : 0 }));
}
