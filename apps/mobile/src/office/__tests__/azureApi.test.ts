import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAzureApi } from '../azureApi';

const BASE = 'https://fn.test';
const JSON_H = { 'Content-Type': 'application/json' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let config: { displayName?: string; entraOid?: string };
let onChanged: ReturnType<typeof vi.fn>;
let api: ReturnType<typeof createAzureApi>;

beforeEach(() => {
  fetchMock = vi.fn(async () => json({ ok: 1 }));
  config = { displayName: 'Rich', entraOid: 'oid-1' };
  onChanged = vi.fn();
  api = createAzureApi({
    baseUrl: BASE,
    config,
    fetchImpl: fetchMock as unknown as typeof fetch,
    onDisplayNameChanged: onChanged as unknown as (n: string) => void,
  });
});

const buf = new ArrayBuffer(4);

type Case = [string, () => Promise<unknown>, string, RequestInit | undefined];

function cases(): Case[] {
  return [
    ['fetchPlaylists owner+member', () => api.fetchPlaylists({ owner: 'a b', member: 'c' }), `${BASE}/api/playlists?owner=a%20b&member=c`, undefined],
    ['fetchPlaylists empty', () => api.fetchPlaylists({}), `${BASE}/api/playlists?`, undefined],
    ['fetchPlaylist', () => api.fetchPlaylist('p/1'), `${BASE}/api/playlist/p%2F1`, undefined],
    ['createPlaylist', () => api.createPlaylist('Mix', true), `${BASE}/api/playlists`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ name: 'Mix', isPublic: true, owner: 'Rich' }) }],
    ['updatePlaylist', () => api.updatePlaylist('p1', { name: 'N' }), `${BASE}/api/playlist/p1`,
      { method: 'PUT', headers: JSON_H, body: JSON.stringify({ userName: 'Rich', name: 'N' }) }],
    ['deletePlaylist', () => api.deletePlaylist('p1'), `${BASE}/api/playlist/p1`,
      { method: 'DELETE', headers: JSON_H, body: JSON.stringify({ userName: 'Rich' }) }],
    ['addTrackToPlaylist', () => api.addTrackToPlaylist('p1', { uri: 'u' }), `${BASE}/api/playlist/p1/tracks`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ track: { uri: 'u' }, userName: 'Rich' }) }],
    ['removeTrackFromPlaylist', () => api.removeTrackFromPlaylist('p1', 'u'), `${BASE}/api/playlist/p1/tracks`,
      { method: 'DELETE', headers: JSON_H, body: JSON.stringify({ userName: 'Rich', uri: 'u' }) }],
    ['reorderPlaylistTracks', () => api.reorderPlaylistTracks('p1', 1, 3), `${BASE}/api/playlist/p1/tracks`,
      { method: 'PATCH', headers: JSON_H, body: JSON.stringify({ userName: 'Rich', fromIndex: 1, toIndex: 3 }) }],
    ['joinPlaylist', () => api.joinPlaylist('p1', 'leave'), `${BASE}/api/playlist/p1/members`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ userName: 'Rich', action: 'leave' }) }],
    ['uploadPlaylistImage', () => api.uploadPlaylistImage('p1', buf, 'image/png', 'R&B'), `${BASE}/api/playlist/p1/image?userName=R%26B`,
      { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: buf }],
    ['ensureFavourites', () => api.ensureFavourites(), `${BASE}/api/profile/Rich/favourites`, { method: 'POST' }],
    ['fetchUsers default', () => api.fetchUsers(), `${BASE}/api/users?exclude=Rich`, undefined],
    ['fetchUsers includeSelf', () => api.fetchUsers(true), `${BASE}/api/users`, undefined],
    ['fetchUserProfile', () => api.fetchUserProfile('A B'), `${BASE}/api/profile/A%20B`, undefined],
    ['uploadProfileImage', () => api.uploadProfileImage('Rich', buf, 'image/jpeg'), `${BASE}/api/profile/Rich/image`,
      { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: buf }],
    ['renameUser', () => api.renameUser('Rich', 'Rick'), `${BASE}/api/profile/rename`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ oid: 'oid-1', oldName: 'Rich', newName: 'Rick' }) }],
    ['fetchStats period only', () => api.fetchStats('week'), `${BASE}/api/stats?period=week`, undefined],
    ['fetchStats all', () => api.fetchStats('week', 'u 1', 5), `${BASE}/api/stats?period=week&userId=u%201&count=5`, undefined],
    ['djAutoplay', () => api.djAutoplay({ a: 1 }), `${BASE}/api/dj/autoplay`,
      { method: 'POST', headers: JSON_H, body: '{"a":1}' }],
    ['djAutoplay undefined body', () => api.djAutoplay(undefined), `${BASE}/api/dj/autoplay`,
      { method: 'POST', headers: JSON_H, body: '{}' }],
    ['fetchDjSet all', () => api.fetchDjSet({ users: ['a', 'b'], limit: 10, excludeUris: ['x', 'y'] }), `${BASE}/api/dj?users=a%2Cb&limit=10&exclude=x%2Cy`, undefined],
    ['fetchDjSet none', () => api.fetchDjSet(), `${BASE}/api/dj?`, undefined],
    ['fetchRecentlyPlayed', () => api.fetchRecentlyPlayed('u 1'), `${BASE}/api/recently-played?userId=u%201`, undefined],
    ['fetchDailyGame default', () => api.fetchDailyGame(), `${BASE}/api/game?date=today`, undefined],
    ['fetchDailyGame empty', () => api.fetchDailyGame(''), `${BASE}/api/game?date=today`, undefined],
    ['fetchDailyGame date', () => api.fetchDailyGame('2026-01-02'), `${BASE}/api/game?date=2026-01-02`, undefined],
    ['submitGameScore', () => api.submitGameScore({ gameId: 'g', userName: 'Rich', guesses: { main: ['left'], bonus: [] } }), `${BASE}/api/score`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ gameId: 'g', userName: 'Rich', guesses: { main: ['left'], bonus: [] } }) }],
    ['fetchGameLeaderboard', () => api.fetchGameLeaderboard(), `${BASE}/api/game-leaderboard?date=today`, undefined],
    ['fetchGameDates', () => api.fetchGameDates('A B'), `${BASE}/api/game-dates?userName=A%20B`, undefined],
    ['fetchMyScore', () => api.fetchMyScore('g 1', 'A B'), `${BASE}/api/my-score?gameId=g%201&userName=A%20B`, undefined],
    ['fetchGameStats', () => api.fetchGameStats('2026-01-02'), `${BASE}/api/game-stats?date=2026-01-02`, undefined],
    ['claimDisplayName', () => api.claimDisplayName('o', 'N'), `${BASE}/api/profile/claim`,
      { method: 'POST', headers: JSON_H, body: JSON.stringify({ oid: 'o', displayName: 'N' }) }],
    ['lookupProfileByOid', () => api.lookupProfileByOid('o/1'), `${BASE}/api/profile/lookup?oid=o%2F1`, undefined],
  ];
}

describe('azureApi request shapes', () => {
  for (const [name, call, url, init] of cases()) {
    it(name, async () => {
      // rebuild via factory so `api` from beforeEach is used at call time
      await call();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [gotUrl, gotInit] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      expect(gotUrl).toBe(url);
      expect(gotInit).toEqual(init);
    });
  }
});

describe('error handling', () => {
  it('GET helpers return { error } on network failure or bad JSON', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await api.fetchStats('week')).toEqual({ error: 'Error: boom' });
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect(await api.fetchPlaylist('p')).toEqual({ error: expect.stringContaining('SyntaxError') });
  });

  it('upload / dj methods return { error } on failure', async () => {
    fetchMock.mockRejectedValue(new Error('x'));
    expect(await api.uploadPlaylistImage('p', buf, 'i/png', 'u')).toEqual({ error: 'Error: x' });
    expect(await api.uploadProfileImage('u', buf, 'i/png')).toEqual({ error: 'Error: x' });
    expect(await api.djAutoplay({})).toEqual({ error: 'Error: x' });
    expect(await api.fetchDailyGame()).toEqual({ error: 'Error: x' });
    expect(await api.submitGameScore({} as never)).toEqual({ error: 'Error: x' });
  });

  it('playlist mutations throw with server error message or status', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 403));
    await expect(api.deletePlaylist('p')).rejects.toThrow('nope');
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(api.joinPlaylist('p', 'join')).rejects.toThrow('Server error 500');
    fetchMock.mockResolvedValueOnce(json({ id: 'p' }, 201));
    await expect(api.createPlaylist('n', false)).resolves.toEqual({ id: 'p' });
  });

  it('ensureFavourites throws without a display name', async () => {
    config.displayName = undefined;
    await expect(api.ensureFavourites()).rejects.toThrow('No display name set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletePlaylist sends empty userName when no display name', async () => {
    config.displayName = undefined;
    await api.deletePlaylist('p');
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe('{"userName":""}');
  });

  it('fetchUsers filters non-arrays and errors to []', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'x' }));
    expect(await api.fetchUsers()).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error('x'));
    expect(await api.fetchUsers()).toEqual([]);
    fetchMock.mockResolvedValueOnce(json([{ userId: 'a' }]));
    expect(await api.fetchUsers()).toEqual([{ userId: 'a' }]);
  });
});

describe('special status handling', () => {
  it('fetchDailyGame maps 404/202 to pending', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await api.fetchDailyGame()).toEqual({ status: 'pending' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 202 }));
    expect(await api.fetchDailyGame()).toEqual({ status: 'pending' });
    fetchMock.mockResolvedValueOnce(json({ id: 'g' }));
    expect(await api.fetchDailyGame()).toEqual({ id: 'g' });
  });

  it('submitGameScore maps 409 / errors / success', async () => {
    fetchMock.mockResolvedValueOnce(json({ existing: { s: 1 } }, 409));
    expect(await api.submitGameScore({} as never)).toEqual({ duplicate: true, existing: { s: 1 } });
    fetchMock.mockResolvedValueOnce(json({ error: 'bad' }, 400));
    expect(await api.submitGameScore({} as never)).toEqual({ error: 'bad' });
    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await api.submitGameScore({} as never)).toEqual({ error: 'HTTP 500' });
    fetchMock.mockResolvedValueOnce(json({ points: 3 }));
    expect(await api.submitGameScore({} as never)).toEqual({ ok: true, score: { points: 3 } });
  });

  it('claimDisplayName: true only on 409; network failure allows', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }));
    expect(await api.claimDisplayName('o', 'n')).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await api.claimDisplayName('o', 'n')).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('x'));
    expect(await api.claimDisplayName('o', 'n')).toBe(false);
  });

  it('lookupProfileByOid handles 404, non-ok, missing name, errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await api.lookupProfileByOid('o')).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await api.lookupProfileByOid('o')).toBeNull();
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await api.lookupProfileByOid('o')).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('x'));
    expect(await api.lookupProfileByOid('o')).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ displayName: 'Rich' }));
    expect(await api.lookupProfileByOid('o')).toBe('Rich');
  });
});

describe('setDisplayName / renameUser', () => {
  it('setDisplayName returns taken without mutating config', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }));
    expect(await api.setDisplayName('Bob')).toEqual({ error: 'taken' });
    expect(config.displayName).toBe('Rich');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('setDisplayName claims then updates config and notifies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await api.setDisplayName('Bob')).toBeNull();
    expect(config.displayName).toBe('Bob');
    expect(onChanged).toHaveBeenCalledWith('Bob');
  });

  it('setDisplayName skips claim for empty name or no oid', async () => {
    expect(await api.setDisplayName('')).toBeNull();
    config.entraOid = undefined;
    expect(await api.setDisplayName('Bob')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(config.displayName).toBe('Bob');
  });

  it('renameUser status mapping', async () => {
    config.entraOid = undefined;
    expect(await api.renameUser('a', 'b')).toEqual({ error: 'not-authed' });
    config.entraOid = 'oid-1';
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }));
    expect(await api.renameUser('a', 'b')).toEqual({ error: 'taken' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    expect(await api.renameUser('a', 'b')).toEqual({ error: 'not-owner' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await api.renameUser('a', 'b')).toEqual({ error: 'server error 500' });
    fetchMock.mockRejectedValueOnce(new Error('x'));
    expect(await api.renameUser('a', 'b')).toEqual({ error: 'Error: x' });
    expect(config.displayName).toBe('Rich');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('renameUser success updates config and notifies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await api.renameUser('Rich', 'Rick')).toEqual({ ok: true });
    expect(config.displayName).toBe('Rick');
    expect(onChanged).toHaveBeenCalledWith('Rick');
  });
});
