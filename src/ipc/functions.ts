// The True Tunes Azure Functions: playlists, profiles, users, feedback, stats, DJ, games, polls and music stats.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as telemetry from '../telemetry';
import { config, saveConfig, PUBSUB_FUNCTION_URL } from '../state';
import { fnFetch } from './entra';
import { initPubSub } from './attribution';

async function playlistFetch(url: string, init: RequestInit): Promise<unknown> {
  const res = await fnFetch(url, init);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
  return body;
}

// Weekly anonymous poll. Never throws; never logs or tracks request bodies (an answer is only
// ever { pollId, choice } and is not tied to the user in any way).
async function pollRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  try {
    const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return json;
  } catch (err) {
    return { error: String(err) };
  }
}

export function register(): void {
  ipcMain.handle('playlist:list', async (_: IpcMainInvokeEvent, filter: { owner?: string; member?: string }) => {
    try {
      const params = new URLSearchParams();
      if (filter.owner) params.set('owner', filter.owner);
      if (filter.member) params.set('member', filter.member);
      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/playlists?${params}`);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('playlist:get', async (_: IpcMainInvokeEvent, id: string) => {
    try {
      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(id)}`);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('playlist:create', (_: IpcMainInvokeEvent, name: string, isPublic: boolean) =>
    playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isPublic, owner: config.displayName }),
    })
  );

  ipcMain.handle('playlist:addTrack', (_: IpcMainInvokeEvent, playlistId: string, track: unknown) =>
    playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, userName: config.displayName }),
    })
  );

  ipcMain.handle('playlist:join', (_: IpcMainInvokeEvent, playlistId: string, action: 'join' | 'leave') =>
    playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: config.displayName, action }),
    })
  );

  ipcMain.handle('profile:ensureFavourites', async () => {
    const userName = config.displayName;
    if (!userName) throw new Error('No display name set');
    return playlistFetch(`${PUBSUB_FUNCTION_URL}/api/profile/${encodeURIComponent(userName)}/favourites`, {
      method: 'POST',
    });
  });

  ipcMain.handle('playlist:delete', (_: IpcMainInvokeEvent, playlistId: string) =>
    playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: config.displayName ?? '' }),
    })
  );

  ipcMain.handle(
    'playlist:update',
    (_: IpcMainInvokeEvent, playlistId: string, patch: { name?: string; isPublic?: boolean }) =>
      playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: config.displayName, ...patch }),
      })
  );

  ipcMain.handle('playlist:removeTrack', (_: IpcMainInvokeEvent, playlistId: string, uri: string) =>
    playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: config.displayName, uri }),
    })
  );

  ipcMain.handle(
    'playlist:reorderTracks',
    (_: IpcMainInvokeEvent, playlistId: string, fromIndex: number, toIndex: number) =>
      playlistFetch(`${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}/tracks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: config.displayName, fromIndex, toIndex }),
      })
  );

  ipcMain.handle(
    'playlist:uploadImage',
    async (_: IpcMainInvokeEvent, playlistId: string, data: ArrayBuffer, mimeType: string, userName: string) => {
      try {
        const url = `${PUBSUB_FUNCTION_URL}/api/playlist/${encodeURIComponent(playlistId)}/image?userName=${encodeURIComponent(userName)}`;
        const res = await fnFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: Buffer.from(data),
        });
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle('users:list', async (_: IpcMainInvokeEvent, includeSelf?: boolean) => {
    // HomePanel wants "other people", so excluding yourself is the default. The
    // Discover room picker wants everyone — you're in the room too.
    const exclude = includeSelf ? '' : (config.displayName ?? '');
    const params = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
    try {
      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/users${params}`);
      const body = (await res.json()) as unknown;
      return Array.isArray(body) ? body : [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('profile:get', async (_: IpcMainInvokeEvent, userName: string) => {
    try {
      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/profile/${encodeURIComponent(userName)}`);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(
    'profile:uploadImage',
    async (_: IpcMainInvokeEvent, userName: string, data: ArrayBuffer, mimeType: string) => {
      try {
        const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/profile/${encodeURIComponent(userName)}/image`, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: Buffer.from(data),
        });
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle(
    'profile:rename',
    async (_: IpcMainInvokeEvent, oldName: string, newName: string): Promise<{ ok?: boolean; error?: string }> => {
      if (!config.entraOid) return { error: 'not-authed' };
      try {
        const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/profile/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oid: config.entraOid, oldName, newName }),
        });
        if (res.status === 409) return { error: 'taken' };
        if (res.status === 403) return { error: 'not-owner' };
        if (!res.ok) return { error: `server error ${res.status}` };
        config.displayName = newName;
        telemetry.setContext({ userId: newName });
        await saveConfig();
        initPubSub().catch(console.error);
        return { ok: true };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  // The GitHub token lives in the feedback function, not the app; the function signs the
  // issue with the caller's name from their Entra token.
  ipcMain.handle(
    'feedback:submit',
    async (
      _: IpcMainInvokeEvent,
      type: 'bug' | 'feature',
      title: string,
      description: string
    ): Promise<{ url: string } | { error: string }> => {
      try {
        const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, title, description }),
        });
        if (res.status === 401) return { error: 'sign in with your work account first' };
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !body.url) return { error: body.error ?? `server error ${res.status}` };
        return { url: body.url };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle('stats:fetch', async (_: IpcMainInvokeEvent, period: string, userId?: string, count?: number) => {
    try {
      let url = `${PUBSUB_FUNCTION_URL}/api/stats?period=${encodeURIComponent(period)}`;
      if (userId) url += `&userId=${encodeURIComponent(userId)}`;
      if (count) url += `&count=${count}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('dj:autoplay', async (_: IpcMainInvokeEvent, body: unknown) => {
    try {
      const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/dj/autoplay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(
    'dj:fetch',
    async (_: IpcMainInvokeEvent, opts: { users?: string[]; limit?: number; excludeUris?: string[] } = {}) => {
      try {
        const params = new URLSearchParams();
        if (opts.users?.length) params.set('users', opts.users.join(','));
        if (opts.limit) params.set('limit', String(opts.limit));
        if (opts.excludeUris?.length) params.set('exclude', opts.excludeUris.join(','));
        const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/dj?${params}`);
        return await res.json();
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle('history:recent', async (_: IpcMainInvokeEvent, userId: string) => {
    try {
      const url = `${PUBSUB_FUNCTION_URL}/api/recently-played?userId=${encodeURIComponent(userId)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('game:fetch', async (_: IpcMainInvokeEvent, date?: string) => {
    try {
      const d = date && date.length ? date : 'today';
      const url = `${PUBSUB_FUNCTION_URL}/api/game?date=${encodeURIComponent(d)}`;
      const res = await fetch(url);
      if (res.status === 404 || res.status === 202) {
        return { status: 'pending' };
      }
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(
    'game:submit',
    async (
      _: IpcMainInvokeEvent,
      input: {
        gameId: string;
        userName: string;
        guesses: { main: Array<'left' | 'right'>; bonus: string[] };
      }
    ) => {
      try {
        const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = await res.json();
        if (res.status === 409) return { duplicate: true, existing: (body as { existing?: unknown }).existing };
        if (!res.ok) return { error: (body as { error?: string }).error ?? `HTTP ${res.status}` };
        return { ok: true, score: body };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle('polls:fetch', () => pollRequest('GET', 'polls'));

  ipcMain.handle('polls:answer', (_: IpcMainInvokeEvent, input: { pollId: string; choice: number }) =>
    pollRequest('POST', 'polls/answer', { pollId: input?.pollId, choice: input?.choice })
  );

  ipcMain.handle('polls:admin-list', () => pollRequest('GET', 'polls-admin'));

  ipcMain.handle('polls:admin-create', (_: IpcMainInvokeEvent, input: { question: string; choices: string[] }) =>
    pollRequest('POST', 'polls-admin', { question: input?.question, choices: input?.choices })
  );

  ipcMain.handle(
    'polls:admin-update',
    (_: IpcMainInvokeEvent, id: string, input: { question: string; choices: string[] }) =>
      pollRequest('PUT', `polls-admin/${encodeURIComponent(id)}`, {
        question: input?.question,
        choices: input?.choices,
      })
  );

  ipcMain.handle('polls:admin-delete', (_: IpcMainInvokeEvent, id: string) =>
    pollRequest('DELETE', `polls-admin/${encodeURIComponent(id)}`)
  );

  ipcMain.handle('polls:admin-reorder', (_: IpcMainInvokeEvent, orderedIds: string[]) =>
    pollRequest('POST', 'polls-admin/reorder', { orderedIds })
  );

  ipcMain.handle('game:leaderboard', async (_: IpcMainInvokeEvent, date?: string) => {
    try {
      const d = date && date.length ? date : 'today';
      const url = `${PUBSUB_FUNCTION_URL}/api/game-leaderboard?date=${encodeURIComponent(d)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('music:stats', async () => {
    try {
      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/music-stats`);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('music:track-meta', async (_: IpcMainInvokeEvent, tracks: unknown) => {
    try {
      const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/track-meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks }),
      });
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('game:dates', async (_: IpcMainInvokeEvent, userName: string) => {
    try {
      const url = `${PUBSUB_FUNCTION_URL}/api/game-dates?userName=${encodeURIComponent(userName ?? '')}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('game:my-score', async (_: IpcMainInvokeEvent, gameId: string, userName: string) => {
    try {
      const url = `${PUBSUB_FUNCTION_URL}/api/my-score?gameId=${encodeURIComponent(gameId)}&userName=${encodeURIComponent(userName)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle('game:stats', async (_: IpcMainInvokeEvent, date?: string) => {
    try {
      const d = date && date.length ? date : 'today';
      const url = `${PUBSUB_FUNCTION_URL}/api/game-stats?date=${encodeURIComponent(d)}`;
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  });
}
