// A Queuedle game in progress, kept locally so leaving the page (or the app)
// and coming back resumes it instead of offering the questions again.

export type ProgressPhase = 'main' | 'bonus';
type Side = 'left' | 'right';

export interface QueuedleProgress {
  phase: ProgressPhase;
  currentIdx: number;
  pickedSide: Side | null;
  mainGuesses: Side[];
  bonusSelections: (string | null)[];
}

const PREFIX = 'queuedle-progress:';
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;

const keyFor = (gameId: string) => `${PREFIX}${gameId}`;
const isSide = (v: unknown): v is Side => v === 'left' || v === 'right';

/**
 * The saved progress for a game, or null when there is none or it doesn't fit
 * a game of `questionCount` questions. Bonus selections are always returned
 * padded or trimmed to `questionCount`.
 */
export function loadProgress(gameId: string, questionCount: number): QueuedleProgress | null {
  if (questionCount <= 0) return null;
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(keyFor(gameId));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;

  if (p.phase !== 'main' && p.phase !== 'bonus') return null;
  if (typeof p.currentIdx !== 'number' || !Number.isInteger(p.currentIdx)) return null;
  if (p.currentIdx < 0 || p.currentIdx >= questionCount) return null;
  if (p.pickedSide !== null && !isSide(p.pickedSide)) return null;
  if (!Array.isArray(p.mainGuesses) || p.mainGuesses.length > questionCount) return null;
  if (!p.mainGuesses.every(isSide)) return null;
  // Every question before the current one has been answered, and so has the
  // current one if a side is picked; the bonus round needs all of them.
  const answered = p.currentIdx + (p.pickedSide ? 1 : 0);
  if (p.mainGuesses.length < answered) return null;
  if (p.phase === 'bonus' && p.mainGuesses.length < questionCount) return null;

  const bonus = Array.isArray(p.bonusSelections) ? p.bonusSelections : [];
  const bonusSelections = Array.from({ length: questionCount }, (_, i) =>
    typeof bonus[i] === 'string' ? (bonus[i] as string) : null
  );

  return {
    phase: p.phase,
    currentIdx: p.currentIdx,
    pickedSide: p.pickedSide,
    mainGuesses: p.mainGuesses,
    bonusSelections,
  };
}

export function saveProgress(gameId: string, progress: QueuedleProgress, nowMs = Date.now()): void {
  try {
    localStorage.setItem(keyFor(gameId), JSON.stringify({ ...progress, savedAt: nowMs }));
  } catch {
    // ignore quota / disabled storage
  }
}

export function clearProgress(gameId: string): void {
  try {
    localStorage.removeItem(keyFor(gameId));
  } catch {
    // ignore disabled storage
  }
}

/** Drops progress for games left unfinished for more than a fortnight. */
export function pruneProgress(nowMs = Date.now()): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      let savedAt = 0;
      try {
        savedAt = Number(JSON.parse(localStorage.getItem(key) ?? '{}')?.savedAt) || 0;
      } catch {
        // corrupt: treat as stale
      }
      if (nowMs - savedAt > MAX_AGE_MS) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore disabled storage
  }
}
