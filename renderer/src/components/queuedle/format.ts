// Pure display helpers for Queuedle. Game ids are London calendar dates (YYYY-MM-DD).
import { ordinal } from '../../lib/profileData';

// Weekday kept apart: some ICU builds put a comma after it ("Monday, 1 January").
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function toDate(gameId: string): Date | null {
  const d = new Date(`${gameId}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thursday 22 October 2026"; falls back to the raw id. */
export function formatGameDate(gameId: string): string {
  const d = toDate(gameId);
  return d ? `${WEEKDAY.format(d)} ${LONG.format(d)}` : gameId;
}

/** "22 Oct"; falls back to the raw id. */
export function formatGameDateShort(gameId: string): string {
  const d = toDate(gameId);
  return d ? SHORT.format(d) : gameId;
}

/** Standard competition ranking (1, 1, 3): equal totals share a place, whatever order they arrive in. */
export function competitionRanks(totals: number[]): number[] {
  return totals.map((t) => 1 + totals.filter((o) => o > t).length);
}

/** "Alex, Rich and 3 others have played today". Expects at least one name. */
export function playedLine(names: string[], isPastDay = false): string {
  const when = isPastDay ? 'played this one' : 'played today';
  const verb = names.length === 1 ? (isPastDay ? 'played this one' : 'has played today') : `have ${when}`;
  if (names.length <= 3) {
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${list} ${verb}`;
  }
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} others ${verb}`;
}

/**
 * Where a score sits among the room's: "Joint 1st of 5 today".
 * `others` are everyone else's totals (not including `mine`).
 */
export function standingLine(mine: number, others: number[], isPastDay: boolean): string {
  if (others.length === 0) return isPastDay ? 'The only one to play this day' : 'First to play today';
  const place = 1 + others.filter((t) => t > mine).length;
  const joint = others.some((t) => t === mine);
  return `${joint ? 'Joint ' : ''}${ordinal(place)} of ${others.length + 1}${isPastDay ? '' : ' today'}`;
}

const KIND: Record<GameItemCategory, string> = { track: 'Track', artist: 'Artist', album: 'Album' };

/** "Track · Abbey Road": the kind, plus the artist for tracks and albums. */
export function itemSubLine(item: GameItem): string {
  return item.subtitle && item.category !== 'artist'
    ? `${KIND[item.category]} · ${item.subtitle}`
    : KIND[item.category];
}
