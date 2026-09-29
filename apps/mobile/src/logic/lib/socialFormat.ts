// Pure helpers for the social screens (lyrics, profile, leaderboard, feedback).
import type { LyricLine } from '../hooks/useLyrics';

/** Index of the last lyric line whose timestamp has passed, or -1. Lines must be time-ordered. */
export function activeLyricIndex(lines: LyricLine[], elapsedMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= elapsedMs) idx = i;
    else break;
  }
  return idx;
}

/** Opacity falloff around the active lyric line (desktop: 1 - dist * 0.19, floor 0.18). */
export function lyricOpacity(index: number, active: number): number {
  if (active < 0) return 1;
  return Math.max(0.18, 1 - Math.abs(index - active) * 0.19);
}

/** Deterministic avatar colour from a name (desktop getAvatarStyle, minus the gradient). */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360},55%,36%)`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "since 4/2/2026" / "total" footer line from the stats response. */
export function statsFooter(totalEvents: number, periodStart: number, userName?: string | null): string {
  const base = `${plural(totalEvents, 'queue event')}${userName ? ` by ${userName}` : ''}`;
  return periodStart > 0 ? `${base} since ${new Date(periodStart).toLocaleDateString()}` : `${base} total`;
}

/** Percentage bar width (0-100) relative to the leader. */
export function barPercent(value: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

export const QUEUEDLE_TIER_INFO = [
  { key: 'skip-button-survivor', name: 'Skip Button Survivor', range: '< 40%', emoji: '⏭️' },
  { key: 'background-bopper', name: 'Background Bopper', range: '40% - 54.9%', emoji: '🎧' },
  { key: 'aux-cable-apprentice', name: 'Aux Cable Apprentice', range: '55% - 69.9%', emoji: '🔌' },
  { key: 'algorithm-whisperer', name: 'Algorithm Whisperer', range: '70% - 84.9%', emoji: '🔮' },
  { key: 'playlist-prophet', name: 'Playlist Prophet', range: '85%+', emoji: '🏆' },
] as const;

export function tierEmoji(key: string): string {
  return QUEUEDLE_TIER_INFO.find((t) => t.key === key)?.emoji ?? '🎵';
}

export const FEEDBACK_REPO = 'TrueNorthIT/TrueTunes';

/** Prefilled GitHub "new issue" URL (the desktop dialog posts with a PAT, which mobile must not ship). */
export function feedbackIssueUrl(kind: 'bug' | 'feature', title: string, description: string, who?: string | null): string {
  const body = `${description.trim()}\n\n---\nSubmitted from True Tunes Android${who ? ` by ${who}` : ''}`;
  const p = new URLSearchParams({ title: title.trim(), body, labels: kind === 'bug' ? 'bug' : 'enhancement' });
  return `https://github.com/${FEEDBACK_REPO}/issues/new?${p.toString()}`;
}
