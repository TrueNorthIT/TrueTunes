// Ported from TrueTunes/src/main.ts (Azure-Function-backed IPC handlers).
// Return shapes, status mapping and error handling mirror desktop exactly.

export interface AzureApiDeps {
  baseUrl: string;
  /** Mutable, shared with the app config; read at call time. */
  config: { displayName?: string; entraOid?: string };
  fetchImpl?: typeof fetch;
  /** Desktop: telemetry.setContext + saveConfig + reconnect pubsub. */
  onDisplayNameChanged?: (name: string) => void | Promise<void>;
}

/** URLSearchParams is incomplete in RN, so build query strings by hand (order preserved). */
function qs(entries: Array<[string, string]>): string {
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface DjFetchOptions {
  users?: string[];
  limit?: number;
  excludeUris?: string[];
}

export interface GameSubmitInput {
  gameId: string;
  userName: string;
  guesses: { main: Array<'left' | 'right'>; bonus: string[] };
}

export function createAzureApi(deps: AzureApiDeps) {
  const { config } = deps;
  const base = deps.baseUrl;
  const doFetch: typeof fetch = deps.fetchImpl ?? ((...a) => fetch(...a));

  /** GET + parse JSON; any failure becomes { error }. */
  async function getJson(url: string): Promise<unknown> {
    try {
      const res = await doFetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  }

  /** Throws on non-2xx (message from body.error) — used by the playlist mutation handlers. */
  async function playlistFetch(url: string, init: RequestInit): Promise<unknown> {
    const res = await doFetch(url, init);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
    return body;
  }

  const playlistUrl = (id: string) => `${base}/api/playlist/${encodeURIComponent(id)}`;
  const gameDate = (date?: string) => (date && date.length ? date : 'today');

  /** Returns true if the name is already owned by a different Entra OID. */
  async function claimDisplayName(oid: string, displayName: string): Promise<boolean> {
    try {
      const res = await doFetch(`${base}/api/profile/claim`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ oid, displayName }),
      });
      return res.status === 409;
    } catch {
      return false; // network failure → allow gracefully
    }
  }

  /** Returns the display name linked to this OID in Cosmos, or null if none. */
  async function lookupProfileByOid(oid: string): Promise<string | null> {
    try {
      const res = await doFetch(`${base}/api/profile/lookup?oid=${encodeURIComponent(oid)}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const data = (await res.json()) as { displayName?: string };
      return data.displayName ?? null;
    } catch {
      return null;
    }
  }

  /** Port of config:setDisplayName. */
  async function setDisplayName(name: string): Promise<{ error: 'taken' } | null> {
    // Guard empty name (sign-out path) — skip claim check.
    if (name && config.entraOid) {
      const taken = await claimDisplayName(config.entraOid, name);
      if (taken) return { error: 'taken' };
    }
    config.displayName = name;
    await deps.onDisplayNameChanged?.(name);
    return null;
  }

  return {
    claimDisplayName,
    lookupProfileByOid,
    setDisplayName,

    fetchPlaylists(filter: { owner?: string; member?: string }): Promise<unknown> {
      const entries: Array<[string, string]> = [];
      if (filter.owner) entries.push(['owner', filter.owner]);
      if (filter.member) entries.push(['member', filter.member]);
      return getJson(`${base}/api/playlists?${qs(entries)}`);
    },

    fetchPlaylist(id: string): Promise<unknown> {
      return getJson(playlistUrl(id));
    },

    createPlaylist(name: string, isPublic: boolean): Promise<unknown> {
      return playlistFetch(`${base}/api/playlists`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, isPublic, owner: config.displayName }),
      });
    },

    updatePlaylist(playlistId: string, patch: { name?: string; isPublic?: boolean }): Promise<unknown> {
      return playlistFetch(playlistUrl(playlistId), {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userName: config.displayName, ...patch }),
      });
    },

    deletePlaylist(playlistId: string): Promise<unknown> {
      return playlistFetch(playlistUrl(playlistId), {
        method: 'DELETE',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userName: config.displayName ?? '' }),
      });
    },

    addTrackToPlaylist(playlistId: string, track: unknown): Promise<unknown> {
      return playlistFetch(`${playlistUrl(playlistId)}/tracks`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ track, userName: config.displayName }),
      });
    },

    removeTrackFromPlaylist(playlistId: string, uri: string): Promise<unknown> {
      return playlistFetch(`${playlistUrl(playlistId)}/tracks`, {
        method: 'DELETE',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userName: config.displayName, uri }),
      });
    },

    reorderPlaylistTracks(playlistId: string, fromIndex: number, toIndex: number): Promise<unknown> {
      return playlistFetch(`${playlistUrl(playlistId)}/tracks`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userName: config.displayName, fromIndex, toIndex }),
      });
    },

    joinPlaylist(playlistId: string, action: 'join' | 'leave'): Promise<unknown> {
      return playlistFetch(`${playlistUrl(playlistId)}/members`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userName: config.displayName, action }),
      });
    },

    async uploadPlaylistImage(
      playlistId: string,
      data: ArrayBuffer,
      mimeType: string,
      userName: string
    ): Promise<unknown> {
      try {
        const res = await doFetch(`${playlistUrl(playlistId)}/image?userName=${encodeURIComponent(userName)}`, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: data,
        });
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    },

    async ensureFavourites(): Promise<unknown> {
      const userName = config.displayName;
      if (!userName) throw new Error('No display name set');
      return playlistFetch(`${base}/api/profile/${encodeURIComponent(userName)}/favourites`, {
        method: 'POST',
      });
    },

    async fetchUsers(includeSelf?: boolean): Promise<unknown[]> {
      // Default excludes yourself; the room picker wants everyone.
      const exclude = includeSelf ? '' : (config.displayName ?? '');
      const params = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
      try {
        const res = await doFetch(`${base}/api/users${params}`);
        const body = (await res.json()) as unknown;
        return Array.isArray(body) ? body : [];
      } catch {
        return [];
      }
    },

    fetchUserProfile(userName: string): Promise<unknown> {
      return getJson(`${base}/api/profile/${encodeURIComponent(userName)}`);
    },

    async uploadProfileImage(userName: string, data: ArrayBuffer, mimeType: string): Promise<unknown> {
      try {
        const res = await doFetch(`${base}/api/profile/${encodeURIComponent(userName)}/image`, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: data,
        });
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    },

    async renameUser(oldName: string, newName: string): Promise<{ ok?: boolean; error?: string }> {
      if (!config.entraOid) return { error: 'not-authed' };
      try {
        const res = await doFetch(`${base}/api/profile/rename`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ oid: config.entraOid, oldName, newName }),
        });
        if (res.status === 409) return { error: 'taken' };
        if (res.status === 403) return { error: 'not-owner' };
        if (!res.ok) return { error: `server error ${res.status}` };
        config.displayName = newName;
        await deps.onDisplayNameChanged?.(newName);
        return { ok: true };
      } catch (err) {
        return { error: String(err) };
      }
    },

    fetchStats(period: string, userId?: string, count?: number): Promise<unknown> {
      let url = `${base}/api/stats?period=${encodeURIComponent(period)}`;
      if (userId) url += `&userId=${encodeURIComponent(userId)}`;
      if (count) url += `&count=${count}`;
      return getJson(url);
    },

    async djAutoplay(body: unknown): Promise<unknown> {
      try {
        const res = await doFetch(`${base}/api/dj/autoplay`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body ?? {}),
        });
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    },

    fetchDjSet(opts: DjFetchOptions = {}): Promise<unknown> {
      const entries: Array<[string, string]> = [];
      if (opts.users?.length) entries.push(['users', opts.users.join(',')]);
      if (opts.limit) entries.push(['limit', String(opts.limit)]);
      if (opts.excludeUris?.length) entries.push(['exclude', opts.excludeUris.join(',')]);
      return getJson(`${base}/api/dj?${qs(entries)}`);
    },

    fetchRecentlyPlayed(userId: string): Promise<unknown> {
      return getJson(`${base}/api/recently-played?userId=${encodeURIComponent(userId)}`);
    },

    async fetchDailyGame(date?: string): Promise<unknown> {
      try {
        const res = await doFetch(`${base}/api/game?date=${encodeURIComponent(gameDate(date))}`);
        if (res.status === 404 || res.status === 202) return { status: 'pending' };
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    },

    async submitGameScore(input: GameSubmitInput): Promise<unknown> {
      try {
        const res = await doFetch(`${base}/api/score`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(input),
        });
        const body = await res.json();
        if (res.status === 409) return { duplicate: true, existing: (body as { existing?: unknown }).existing };
        if (!res.ok) return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
        return { ok: true, score: body };
      } catch (err) {
        return { error: String(err) };
      }
    },

    fetchGameLeaderboard(date?: string): Promise<unknown> {
      return getJson(`${base}/api/game-leaderboard?date=${encodeURIComponent(gameDate(date))}`);
    },

    fetchGameDates(userName: string): Promise<unknown> {
      return getJson(`${base}/api/game-dates?userName=${encodeURIComponent(userName ?? '')}`);
    },

    fetchMyScore(gameId: string, userName: string): Promise<unknown> {
      return getJson(
        `${base}/api/my-score?gameId=${encodeURIComponent(gameId)}&userName=${encodeURIComponent(userName)}`
      );
    },

    fetchGameStats(date?: string): Promise<unknown> {
      return getJson(`${base}/api/game-stats?date=${encodeURIComponent(gameDate(date))}`);
    },
  };
}

export type AzureApi = ReturnType<typeof createAzureApi>;
