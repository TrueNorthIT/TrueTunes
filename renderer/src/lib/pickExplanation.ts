/** The content of the "Why this pick" tooltip, from a DJ pick's server data. */

export interface PickExplanation {
  /** The tooltip body, one line each, after the heading. */
  lines: string[];
}

type Person = { name: string; count?: number };

const MAX_PEOPLE = 6;

/** Old servers: "Rich, Alex and others queue HAIM — never played here" gives Rich and Alex, with no counts. */
export function namesFromBecause(because: string): string[] {
  const m = because.split(' — ')[0].match(/^(.*?)\s(?:queues?)\s/);
  if (!m) return [];
  return m[1].split(/,\s*|\s+and\s+/).filter((n) => n && n !== 'others');
}

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

/** "Alex queued them 12 times, Rich 4 times" (the first person carries the verb), or names only without counts. */
function describe(all: Person[], pronoun: 'them' | 'it', viewer?: string | null): string {
  const shown = all.slice(0, MAX_PEOPLE).map((p) => (viewer && p.name === viewer ? { ...p, name: 'You' } : p));
  const more = all.length - shown.length;
  if (shown.some((p) => p.count == null)) {
    const names = shown.map((p) => p.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `${list} ${names.length > 1 ? 'queue' : 'queues'} ${pronoun}`;
  }
  const parts = shown.map((p, i) =>
    i === 0 ? `${p.name} queued ${pronoun} ${times(p.count!)}` : `${p.name} ${times(p.count!)}`
  );
  if (more > 0) parts.push(`and ${more} more`);
  return parts.join(', ');
}

export function explainPick({
  because,
  fans,
  trackFans,
  artist,
  viewer,
  trackName,
  kind,
}: {
  because: string;
  fans?: { user: string; count: number }[];
  /** Room members who have queued this very track, with counts. */
  trackFans?: { user: string; count: number }[];
  /** The artist's name, to lead the artist line. */
  artist?: string;
  viewer?: string | null;
  trackName?: string;
  kind: 'unheard' | 'played';
}): PickExplanation {
  const all: Person[] = fans
    ? fans.map((f) => ({ name: f.user, count: f.count }))
    : namesFromBecause(because).map((name) => ({ name }));
  const lines: string[] = [];
  if (kind === 'played' && trackFans?.length) {
    lines.push(
      `This song: ${describe(
        trackFans.map((f) => ({ name: f.user, count: f.count })),
        'it',
        viewer
      )}`
    );
  }
  if (all.length) lines.push(`${artist ? `${artist}: ` : ''}${describe(all, 'them', viewer)}`);
  else lines.push(because.split(' — ')[0]);
  if (kind === 'unheard' && trackName) lines.push(`"${trackName}" has never been played here`);
  return { lines };
}
