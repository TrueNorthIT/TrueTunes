/** The content of the "Why this pick" tooltip, from a DJ pick's server data. */

export interface PickExplanation {
  /** Everyone credited, heaviest first. `count` is how often they've queued the artist; absent on older servers. */
  people: { name: string; count?: number }[];
  /** Credited people beyond the first six. */
  more: number;
  /** Room fit as a whole percent, or null when the server sent no score. */
  fit: number | null;
  /** Why this track, or null without a track name. */
  track: string | null;
  /** The server's reason, only when nobody is credited ("Like Muse, which the room plays"). */
  reason: string | null;
}

const MAX_PEOPLE = 6;

/** Old servers: "Rich, Alex and others queue HAIM — never played here" gives Rich and Alex, with no counts. */
function namesFromBecause(because: string): string[] {
  const m = because.split(' — ')[0].match(/^(.*?)\s(?:queues?)\s/);
  if (!m) return [];
  return m[1].split(/,\s*|\s+and\s+/).filter((n) => n && n !== 'others');
}

export function explainPick({ because, fans, score, viewer, trackName, kind }: {
  because: string;
  fans?: { user: string; count: number }[];
  score?: number;
  viewer?: string | null;
  trackName?: string;
  kind: 'unheard' | 'played';
}): PickExplanation {
  const all = fans ? fans.map((f) => ({ name: f.user, count: f.count })) : namesFromBecause(because).map((name) => ({ name }));
  const people = all.slice(0, MAX_PEOPLE).map((p) => (viewer && p.name === viewer ? { ...p, name: 'You' } : p));
  return {
    people,
    more: all.length - people.length,
    fit: score == null ? null : Math.round(score * 100),
    track: trackName
      ? `"${trackName}": ${kind === 'unheard' ? 'one of their top songs, never played here' : "one of the office's most-played songs by them"}.`
      : null,
    reason: all.length ? null : because.split(' — ')[0],
  };
}
