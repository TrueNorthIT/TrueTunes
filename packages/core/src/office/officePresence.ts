// Ported from TrueTunes/src/main.ts ('presence:office' handler).

import { fetchPresences, resolveRoster } from './graphPresence';

export interface OfficePresenceDeps {
  baseUrl: string;
  /** Resolves a Graph token with the presence scope, or null when there is no consent. */
  getGraphToken: () => Promise<string | null> | null;
  /** Whether Entra auth is initialised (desktop: `entraAuth` non-null). */
  hasAuth: () => boolean;
  fetchImpl?: typeof fetch;
}

export function createOfficePresence(deps: OfficePresenceDeps) {
  const doFetch: typeof fetch = deps.fetchImpl ?? ((...a) => fetch(...a));

  async function fetchOfficePresence(): Promise<unknown> {
    try {
      if (!deps.hasAuth()) return { inOffice: [], basis: 'none', detail: [], error: 'not signed in' };

      const token = await deps.getGraphToken();
      // No consent yet — the caller falls back to inferring the room from queue activity.
      if (!token) return { inOffice: [], basis: 'none', detail: [], error: 'no presence consent' };

      const res = await doFetch(`${deps.baseUrl}/api/users`);
      const users = (await res.json()) as Array<{ userId: string; entraOid?: string | null }>;
      const oidToName: Record<string, string> = {};
      for (const u of users) if (u.entraOid) oidToName[u.entraOid] = u.userId;

      const oids = Object.keys(oidToName);
      if (oids.length === 0) return { inOffice: [], basis: 'none', detail: [] };

      const presences = await fetchPresences(token, oids, doFetch);
      return resolveRoster(presences, oidToName);
    } catch (err) {
      return { inOffice: [], basis: 'none', detail: [], error: String(err) };
    }
  }

  return { fetchOfficePresence };
}
