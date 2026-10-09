// Pure helpers for the identity picker (no React / RN imports so they are unit-testable).

export interface IdentityUser {
  userId: string;
  lastQueued?: number;
  imageUrl?: string | null;
}

/** Trim, drop blanks, and upgrade protocol-relative / http URLs to https. */
export function normaliseAvatarUrl(url: string | null | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return null;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('http://')) return `https://${u.slice(7)}`;
  return u;
}

/** Dedupe by case-insensitive id, drop blanks, sort by name (case-insensitive). */
export function sortUsers<T extends IdentityUser>(users: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const u of users) {
    const id = (u?.userId ?? '').trim();
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out.sort((a, b) => a.userId.localeCompare(b.userId, undefined, { sensitivity: 'base' }));
}

/** Case-insensitive substring filter; empty query returns everything. */
export function filterUsers<T extends IdentityUser>(users: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...users];
  return users.filter((u) => u.userId.toLowerCase().includes(q));
}

export function isCurrentIdentity(userId: string, current: string | null | undefined): boolean {
  return !!current && userId.trim().toLowerCase() === current.trim().toLowerCase();
}

/** Show the filter box only when the list is long enough to need it. */
export const FILTER_THRESHOLD = 8;
