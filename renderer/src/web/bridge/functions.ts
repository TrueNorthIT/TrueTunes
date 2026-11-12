// The True Tunes Azure Functions through the gateway's /fn: src/ipc/functions.ts and the profile calls of
// src/ipc/entra.ts. Same method, path, query and body as the desktop; every call also carries the Entra bearer.

import { NO_TOKEN, type Gateway } from './gateway';
import type { Identity } from './identity';

/** `fn.fetch('profile/claim', init)` calls `{gateway}/fn/profile/claim`. Throws when there is no token. */
export function createFnFetch(gateway: Gateway) {
  return async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await gateway.fetch(`/fn/${path}`, init);
    if (!res) throw new Error(NO_TOKEN);
    return res;
  };
}
export type FnFetch = ReturnType<typeof createFnFetch>;

/**
 * The desktop answers a failed read with `{ error }` in place of the typed result (the renderer checks for it), so
 * the typed methods below return it as their own type: the bridge's contract, mirrored, not a shortcut.
 */
const failed = <T>(err: unknown): T => ({ error: String(err) }) as T;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

export function createFunctions(fn: FnFetch, identity: Identity, oid: () => string | undefined) {
  /** GET and answer the JSON, or { error } on a failure. */
  const read = async <T>(path: string): Promise<T> => {
    try {
      return await (await fn(path)).json();
    } catch (err) {
      return failed(err);
    }
  };

  /** A write: throws the server's error (or "Server error <status>") when the call fails. */
  const playlistFetch = async <T>(path: string, init: RequestInit): Promise<T> => {
    const res = await fn(path, init);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
    return body as T;
  };

  /** A write that answers { error } instead of throwing, and does not look at the status. */
  const write = async <T>(path: string, init: RequestInit): Promise<T> => {
    try {
      return await (await fn(path, init)).json();
    } catch (err) {
      return failed(err);
    }
  };

  // Weekly anonymous poll. Never throws; never sends anything but what the call is given.
  const poll = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    try {
      const res = await fn(path, body === undefined ? { method } : jsonInit(method, body));
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` } as T;
      return json as T;
    } catch (err) {
      return failed(err);
    }
  };

  const day = (date?: string) => encodeURIComponent(date && date.length ? date : 'today');
  const name = () => identity.name();

  return {
    fetchPlaylists(filter: { owner?: string; member?: string }): Promise<PlaylistMeta[]> {
      const params = new URLSearchParams();
      if (filter.owner) params.set('owner', filter.owner);
      if (filter.member) params.set('member', filter.member);
      return read(`playlists?${params}`);
    },
    fetchPlaylist: (id: string): Promise<PlaylistDoc> => read(`playlist/${encodeURIComponent(id)}`),
    createPlaylist: (playlistName: string, isPublic: boolean): Promise<PlaylistDoc> =>
      playlistFetch('playlists', jsonInit('POST', { name: playlistName, isPublic, owner: name() })),
    addTrackToPlaylist: (playlistId: string, track: PlaylistTrack): Promise<PlaylistDoc> =>
      playlistFetch(`playlist/${encodeURIComponent(playlistId)}/tracks`, jsonInit('POST', { track, userName: name() })),
    joinPlaylist: (playlistId: string, action: 'join' | 'leave'): Promise<PlaylistMeta> =>
      playlistFetch(
        `playlist/${encodeURIComponent(playlistId)}/members`,
        jsonInit('POST', { userName: name(), action })
      ),
    async ensureFavourites(): Promise<PlaylistDoc> {
      const userName = name();
      if (!userName) throw new Error('No display name set');
      return playlistFetch(`profile/${encodeURIComponent(userName)}/favourites`, { method: 'POST' });
    },
    deletePlaylist: (playlistId: string): Promise<{ ok?: boolean; error?: string }> =>
      playlistFetch(`playlist/${encodeURIComponent(playlistId)}`, jsonInit('DELETE', { userName: name() ?? '' })),
    updatePlaylist: (playlistId: string, patch: { name?: string; isPublic?: boolean }): Promise<PlaylistDoc> =>
      playlistFetch(`playlist/${encodeURIComponent(playlistId)}`, jsonInit('PUT', { userName: name(), ...patch })),
    removeTrackFromPlaylist: (playlistId: string, uri: string): Promise<PlaylistDoc> =>
      playlistFetch(`playlist/${encodeURIComponent(playlistId)}/tracks`, jsonInit('DELETE', { userName: name(), uri })),
    reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number): Promise<PlaylistDoc> =>
      playlistFetch(
        `playlist/${encodeURIComponent(playlistId)}/tracks`,
        jsonInit('PATCH', { userName: name(), fromIndex, toIndex })
      ),
    uploadPlaylistImage: (
      playlistId: string,
      data: ArrayBuffer,
      mimeType: string,
      userName: string
    ): Promise<{ imageUrl: string } | { error: string }> =>
      write(`playlist/${encodeURIComponent(playlistId)}/image?userName=${encodeURIComponent(userName)}`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: data,
      }),

    async fetchUsers(includeSelf?: boolean): Promise<UserSummary[]> {
      // HomePanel wants "other people", so excluding yourself is the default. The Discover room picker wants
      // everyone: you're in the room too.
      const exclude = includeSelf ? '' : (name() ?? '');
      const params = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
      try {
        const body: unknown = await (await fn(`users${params}`)).json();
        return Array.isArray(body) ? body : [];
      } catch {
        return [];
      }
    },
    fetchUserProfile: (userName: string): Promise<UserProfile | null> =>
      read(`profile/${encodeURIComponent(userName)}`),
    uploadProfileImage: (
      userName: string,
      data: ArrayBuffer,
      mimeType: string
    ): Promise<{ imageUrl: string } | { error: string }> =>
      write(`profile/${encodeURIComponent(userName)}/image`, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: data,
      }),

    async renameUser(oldName: string, newName: string): Promise<{ ok?: boolean; error?: string }> {
      const id = oid();
      if (!id) return { error: 'not-authed' };
      try {
        const res = await fn('profile/rename', jsonInit('POST', { oid: id, oldName, newName }));
        if (res.status === 409) return { error: 'taken' };
        if (res.status === 403) return { error: 'not-owner' };
        if (!res.ok) return { error: `server error ${res.status}` };
        identity.setName(newName);
        return { ok: true };
      } catch (err) {
        return { error: String(err) };
      }
    },

    // The GitHub token lives in the feedback function, not the app; the function signs the issue with the
    // caller's name from their Entra token.
    async submitFeedback(
      type: 'bug' | 'feature',
      title: string,
      description: string
    ): Promise<{ url: string } | { error: string }> {
      try {
        const res = await fn('feedback', jsonInit('POST', { type, title, description }));
        if (res.status === 401) return { error: 'sign in with your work account first' };
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) return { error: body.error ?? `server error ${res.status}` };
        return { url: body.url };
      } catch (err) {
        return { error: String(err) };
      }
    },

    fetchStats(period: string, userId?: string, count?: number): Promise<StatsResult> {
      let path = `stats?period=${encodeURIComponent(period)}`;
      if (userId) path += `&userId=${encodeURIComponent(userId)}`;
      if (count) path += `&count=${count}`;
      return read(path);
    },
    djAutoplay: (body: AutoplayRequestBody): Promise<AutoplayResult> =>
      write('dj/autoplay', jsonInit('POST', body ?? {})),
    fetchDjSet(opts: { users?: string[]; limit?: number; excludeUris?: string[] } = {}): Promise<DjSetResponse> {
      const params = new URLSearchParams();
      if (opts.users?.length) params.set('users', opts.users.join(','));
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.excludeUris?.length) params.set('exclude', opts.excludeUris.join(','));
      return read(`dj?${params}`);
    },
    fetchRecentlyPlayed: (userId: string): Promise<RecentlyPlayedData | null> =>
      read(`recently-played?userId=${encodeURIComponent(userId)}`),

    async fetchDailyGame(date?: string): Promise<GameFetchResult> {
      try {
        const res = await fn(`game?date=${day(date)}`);
        if (res.status === 404 || res.status === 202) return { status: 'pending' };
        return await res.json();
      } catch (err) {
        return failed(err);
      }
    },
    async submitGameScore(input: {
      gameId: string;
      userName: string;
      guesses: { main: Array<'left' | 'right'>; bonus: string[] };
    }): Promise<GameSubmitResult> {
      try {
        const res = await fn('score', jsonInit('POST', input));
        const body: unknown = await res.json();
        if (res.status === 409) return { duplicate: true, existing: (body as { existing?: GameScoreDoc }).existing };
        if (!res.ok) return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
        return { ok: true, score: body as GameScoreDoc };
      } catch (err) {
        return { error: String(err) };
      }
    },
    fetchGameLeaderboard: (date?: string): Promise<GameLeaderboardResult> => read(`game-leaderboard?date=${day(date)}`),
    fetchMusicStats: (): Promise<MusicStatsResult | { error: string }> => read('music-stats'),
    reportTrackMeta: (tracks: TrackMetaReport[]): Promise<{ saved?: number; error?: string }> =>
      write('track-meta', jsonInit('POST', { tracks })),
    fetchGameDates: (userName: string): Promise<GameDatesResult> =>
      read(`game-dates?userName=${encodeURIComponent(userName ?? '')}`),
    fetchMyScore: (gameId: string, userName: string): Promise<GameMyScoreResult> =>
      read(`my-score?gameId=${encodeURIComponent(gameId)}&userName=${encodeURIComponent(userName)}`),
    fetchGameStats: (date?: string): Promise<GameStatsResult> => read(`game-stats?date=${day(date)}`),

    fetchPolls: (): Promise<PollsFetchResult> => poll('GET', 'polls'),
    answerPoll: (input: { pollId: string; choice: number }): Promise<PollAnswerResult> =>
      poll('POST', 'polls/answer', { pollId: input?.pollId, choice: input?.choice }),
    pollAdminList: (): Promise<PollAdminListResult> => poll('GET', 'polls-admin'),
    pollAdminCreate: (input: PollInputPayload): Promise<PollAdminSaveResult> =>
      poll('POST', 'polls-admin', { question: input?.question, choices: input?.choices }),
    pollAdminUpdate: (id: string, input: PollInputPayload): Promise<PollAdminSaveResult> =>
      poll('PUT', `polls-admin/${encodeURIComponent(id)}`, { question: input?.question, choices: input?.choices }),
    pollAdminDelete: (id: string): Promise<PollAdminOkResult> =>
      poll('DELETE', `polls-admin/${encodeURIComponent(id)}`),
    pollAdminReorder: (orderedIds: string[]): Promise<PollAdminListResult> =>
      poll('POST', 'polls-admin/reorder', { orderedIds }),
  };
}
