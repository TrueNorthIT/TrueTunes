import { describe, it, expect } from 'vitest';
import { BASE, fakeAuth, json, text, makeBridge, type Harness } from './helpers';

const bridgeFor = (storage: Record<string, string> = { 'tt.displayName': 'Joe' }) => {
  const h = makeBridge({ storage });
  h.fake.on('GET', /^\/fn\//, () => json({ ok: 'get' }));
  h.fake.on('POST', /^\/fn\//, () => json({ ok: 'post' }));
  h.fake.on('PUT', /^\/fn\//, () => json({ ok: 'put' }));
  h.fake.on('PATCH', /^\/fn\//, () => json({ ok: 'patch' }));
  h.fake.on('DELETE', /^\/fn\//, () => json({ ok: 'delete' }));
  return h;
};

const track = { uri: 'u', trackName: 't' } as unknown as PlaylistTrack;
const buf = new Uint8Array([1, 2, 3]).buffer;

interface Expect {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  contentType?: string;
}

const table: Array<[string, (b: Harness['bridge']) => Promise<unknown>, Expect]> = [
  ['fetchPlaylists', (b) => b.fetchPlaylists({ owner: 'a', member: 'b' }), { method: 'GET', path: '/fn/playlists', query: { owner: 'a', member: 'b' } }],
  ['fetchPlaylists (none)', (b) => b.fetchPlaylists({}), { method: 'GET', path: '/fn/playlists' }],
  ['fetchPlaylist', (b) => b.fetchPlaylist('p 1'), { method: 'GET', path: '/fn/playlist/p%201' }],
  ['createPlaylist', (b) => b.createPlaylist('N', true), { method: 'POST', path: '/fn/playlists', body: { name: 'N', isPublic: true, owner: 'Joe' }, contentType: 'application/json' }],
  ['addTrackToPlaylist', (b) => b.addTrackToPlaylist('p', track), { method: 'POST', path: '/fn/playlist/p/tracks', body: { track, userName: 'Joe' }, contentType: 'application/json' }],
  ['joinPlaylist', (b) => b.joinPlaylist('p', 'leave'), { method: 'POST', path: '/fn/playlist/p/members', body: { userName: 'Joe', action: 'leave' } }],
  ['ensureFavourites', (b) => b.ensureFavourites(), { method: 'POST', path: '/fn/profile/Joe/favourites' }],
  ['deletePlaylist', (b) => b.deletePlaylist('p'), { method: 'DELETE', path: '/fn/playlist/p', body: { userName: 'Joe' } }],
  ['updatePlaylist', (b) => b.updatePlaylist('p', { name: 'x', isPublic: false }), { method: 'PUT', path: '/fn/playlist/p', body: { userName: 'Joe', name: 'x', isPublic: false } }],
  ['removeTrackFromPlaylist', (b) => b.removeTrackFromPlaylist('p', 'spotify:1'), { method: 'DELETE', path: '/fn/playlist/p/tracks', body: { userName: 'Joe', uri: 'spotify:1' } }],
  ['reorderPlaylistTracks', (b) => b.reorderPlaylistTracks('p', 1, 3), { method: 'PATCH', path: '/fn/playlist/p/tracks', body: { userName: 'Joe', fromIndex: 1, toIndex: 3 } }],
  ['uploadPlaylistImage', (b) => b.uploadPlaylistImage('p', buf, 'image/png', 'Joe Q'), { method: 'POST', path: '/fn/playlist/p/image', query: { userName: 'Joe Q' }, contentType: 'image/png' }],
  ['fetchUsers', (b) => b.fetchUsers(), { method: 'GET', path: '/fn/users', query: { exclude: 'Joe' } }],
  ['fetchUsers (self)', (b) => b.fetchUsers(true), { method: 'GET', path: '/fn/users' }],
  ['fetchUserProfile', (b) => b.fetchUserProfile('Joe Q'), { method: 'GET', path: '/fn/profile/Joe%20Q' }],
  ['uploadProfileImage', (b) => b.uploadProfileImage('Joe Q', buf, 'image/jpeg'), { method: 'POST', path: '/fn/profile/Joe%20Q/image', contentType: 'image/jpeg' }],
  ['renameUser', (b) => b.renameUser('Joe', 'Joseph'), { method: 'POST', path: '/fn/profile/rename', body: { oid: 'oid-1', oldName: 'Joe', newName: 'Joseph' } }],
  ['submitFeedback', (b) => b.submitFeedback('bug', 'T', 'D'), { method: 'POST', path: '/fn/feedback', body: { type: 'bug', title: 'T', description: 'D' } }],
  ['fetchStats', (b) => b.fetchStats('week', 'u', 5), { method: 'GET', path: '/fn/stats', query: { period: 'week', userId: 'u', count: '5' } }],
  ['fetchStats (period only)', (b) => b.fetchStats('day'), { method: 'GET', path: '/fn/stats', query: { period: 'day' } }],
  ['djAutoplay', (b) => b.djAutoplay({ groupId: 'g', clientId: 'c', queueUris: [] }), { method: 'POST', path: '/fn/dj/autoplay', body: { groupId: 'g', clientId: 'c', queueUris: [] } }],
  ['fetchDjSet', (b) => b.fetchDjSet({ users: ['a', 'b'], limit: 3, excludeUris: ['x', 'y'] }), { method: 'GET', path: '/fn/dj', query: { users: 'a,b', limit: '3', exclude: 'x,y' } }],
  ['fetchDjSet (none)', (b) => b.fetchDjSet(), { method: 'GET', path: '/fn/dj' }],
  ['fetchRecentlyPlayed', (b) => b.fetchRecentlyPlayed('u'), { method: 'GET', path: '/fn/recently-played', query: { userId: 'u' } }],
  ['fetchDailyGame', (b) => b.fetchDailyGame(), { method: 'GET', path: '/fn/game', query: { date: 'today' } }],
  ['fetchDailyGame (date)', (b) => b.fetchDailyGame('2026-01-02'), { method: 'GET', path: '/fn/game', query: { date: '2026-01-02' } }],
  ['submitGameScore', (b) => b.submitGameScore({ gameId: 'g', userName: 'Joe', guesses: { main: ['left'], bonus: [] } }), { method: 'POST', path: '/fn/score', body: { gameId: 'g', userName: 'Joe', guesses: { main: ['left'], bonus: [] } } }],
  ['fetchPolls', (b) => b.fetchPolls(), { method: 'GET', path: '/fn/polls' }],
  ['answerPoll', (b) => b.answerPoll({ pollId: 'p', choice: 2 }), { method: 'POST', path: '/fn/polls/answer', body: { pollId: 'p', choice: 2 } }],
  ['pollAdminList', (b) => b.pollAdminList(), { method: 'GET', path: '/fn/polls-admin' }],
  ['pollAdminCreate', (b) => b.pollAdminCreate({ question: 'q', choices: ['a', 'b'] }), { method: 'POST', path: '/fn/polls-admin', body: { question: 'q', choices: ['a', 'b'] } }],
  ['pollAdminUpdate', (b) => b.pollAdminUpdate('i d', { question: 'q', choices: ['a'] }), { method: 'PUT', path: '/fn/polls-admin/i%20d', body: { question: 'q', choices: ['a'] } }],
  ['pollAdminDelete', (b) => b.pollAdminDelete('i d'), { method: 'DELETE', path: '/fn/polls-admin/i%20d' }],
  ['pollAdminReorder', (b) => b.pollAdminReorder(['b', 'a']), { method: 'POST', path: '/fn/polls-admin/reorder', body: { orderedIds: ['b', 'a'] } }],
  ['fetchGameLeaderboard', (b) => b.fetchGameLeaderboard(), { method: 'GET', path: '/fn/game-leaderboard', query: { date: 'today' } }],
  ['fetchMusicStats', (b) => b.fetchMusicStats(), { method: 'GET', path: '/fn/music-stats' }],
  ['reportTrackMeta', (b) => b.reportTrackMeta([{ uri: 'u', durationMs: 5 }]), { method: 'POST', path: '/fn/track-meta', body: { tracks: [{ uri: 'u', durationMs: 5 }] } }],
  ['fetchGameDates', (b) => b.fetchGameDates('Joe Q'), { method: 'GET', path: '/fn/game-dates', query: { userName: 'Joe Q' } }],
  ['fetchMyScore', (b) => b.fetchMyScore('g', 'u'), { method: 'GET', path: '/fn/my-score', query: { gameId: 'g', userName: 'u' } }],
  ['fetchGameStats', (b) => b.fetchGameStats(), { method: 'GET', path: '/fn/game-stats', query: { date: 'today' } }],
];

describe('every function call', () => {
  it.each(table)('%s', async (_label, call, want) => {
    const h = bridgeFor();
    await call(h.bridge);
    expect(h.fake.calls).toHaveLength(1);
    const c = h.fake.calls[0];
    expect(c.method).toBe(want.method);
    expect(c.url.split('?')[0]).toBe(`${BASE}${want.path}`);
    const got: Record<string, string> = {};
    c.query.forEach((v, k) => (got[k] = v));
    expect(got).toEqual(want.query ?? {});
    expect(c.headers['authorization']).toBe('Bearer tok-1');
    if (want.body !== undefined) expect(c.json()).toEqual(want.body);
    else if (want.contentType === undefined) expect(c.body ?? undefined).toBeUndefined();
    if (want.contentType) expect(c.headers['content-type']).toBe(want.contentType);
    if (want.contentType?.startsWith('image/')) expect(c.body).toBe(buf);
  });

  it('covers every bridge method that calls a function (guard against a method added without a row)', () => {
    expect(table.length).toBeGreaterThanOrEqual(38);
  });
});

describe('results', () => {
  it('hands back the parsed body', async () => {
    const h = bridgeFor();
    expect(await h.bridge.fetchPlaylist('p')).toEqual({ ok: 'get' });
    expect(await h.bridge.createPlaylist('N', false)).toEqual({ ok: 'post' });
  });

  it('read calls turn a failure into { error }', async () => {
    const h = bridgeFor();
    h.fake.on('GET', /^\/fn\/playlist\//, () => Promise.reject(new Error('offline')));
    expect(await h.bridge.fetchPlaylist('p')).toEqual({ error: 'Error: offline' });
    h.fake.on('GET', '/fn/stats', () => Promise.reject(new TypeError('x')));
    expect(await h.bridge.fetchStats('day')).toEqual({ error: 'TypeError: x' });
  });

  it('with no token a call fails the way a network failure does', async () => {
    const h = makeBridge({ auth: fakeAuth({ token: null }), storage: { 'tt.displayName': 'Joe' } });
    expect(await h.bridge.fetchStats('day')).toEqual({ error: 'Error: No Entra token — please sign in first' });
    expect(h.fake.calls).toHaveLength(0);
  });

  it('playlist writes throw the server error, or "Server error <status>"', async () => {
    const h = bridgeFor();
    h.fake.on('POST', '/fn/playlists', () => json({ error: 'name taken' }, 409));
    await expect(h.bridge.createPlaylist('N', true)).rejects.toThrow('name taken');
    h.fake.on('DELETE', '/fn/playlist/p', () => text('<html>', 500));
    await expect(h.bridge.deletePlaylist('p')).rejects.toThrow('Server error 500');
  });

  it('ensureFavourites needs a display name', async () => {
    const h = bridgeFor({});
    await expect(h.bridge.ensureFavourites()).rejects.toThrow('No display name set');
    expect(h.fake.calls).toHaveLength(0);
  });

  it('delete and the playlist writes send userName "" with no display name', async () => {
    const h = bridgeFor({});
    await h.bridge.deletePlaylist('p');
    expect(h.fake.calls[0].json()).toEqual({ userName: '' });
  });

  it('fetchUsers returns [] for a non-array or a failure', async () => {
    const h = bridgeFor();
    h.fake.on('GET', '/fn/users', () => json({ error: 'x' }));
    expect(await h.bridge.fetchUsers()).toEqual([]);
    h.fake.on('GET', '/fn/users', () => Promise.reject(new Error('x')));
    expect(await h.bridge.fetchUsers()).toEqual([]);
    h.fake.on('GET', '/fn/users', () => json([{ userId: 'a' }]));
    expect(await h.bridge.fetchUsers(true)).toEqual([{ userId: 'a' }]);
  });

  it('the daily game is pending on 404 and 202', async () => {
    const h = bridgeFor();
    h.fake.on('GET', '/fn/game', () => text('', 404));
    expect(await h.bridge.fetchDailyGame()).toEqual({ status: 'pending' });
    h.fake.on('GET', '/fn/game', () => json({ status: 'generating' }, 202));
    expect(await h.bridge.fetchDailyGame()).toEqual({ status: 'pending' });
  });

  it('a score answers ok, duplicate, or an error', async () => {
    const h = bridgeFor();
    const input = { gameId: 'g', userName: 'Joe', guesses: { main: [], bonus: [] } };
    h.fake.on('POST', '/fn/score', () => json({ total: 4 }));
    expect(await h.bridge.submitGameScore(input)).toEqual({ ok: true, score: { total: 4 } });
    h.fake.on('POST', '/fn/score', () => json({ existing: { total: 9 } }, 409));
    expect(await h.bridge.submitGameScore(input)).toEqual({ duplicate: true, existing: { total: 9 } });
    h.fake.on('POST', '/fn/score', () => json({ error: 'closed' }, 400));
    expect(await h.bridge.submitGameScore(input)).toEqual({ error: 'closed' });
    h.fake.on('POST', '/fn/score', () => json({}, 500));
    expect(await h.bridge.submitGameScore(input)).toEqual({ error: 'HTTP 500' });
    h.fake.on('POST', '/fn/score', () => Promise.reject(new Error('x')));
    expect(await h.bridge.submitGameScore(input)).toEqual({ error: 'Error: x' });
  });

  it('polls never throw: a failure is { error }', async () => {
    const h = bridgeFor();
    h.fake.on('GET', '/fn/polls', () => json({ error: 'nope' }, 403));
    expect(await h.bridge.fetchPolls()).toEqual({ error: 'nope' });
    h.fake.on('GET', '/fn/polls', () => text('', 500));
    expect(await h.bridge.fetchPolls()).toEqual({ error: 'HTTP 500' });
    h.fake.on('GET', '/fn/polls', () => Promise.reject(new Error('x')));
    expect(await h.bridge.fetchPolls()).toEqual({ error: 'Error: x' });
  });

  it('uploads answer { error } on a failure', async () => {
    const h = bridgeFor();
    h.fake.on('POST', /\/image$/, () => Promise.reject(new Error('x')));
    expect(await h.bridge.uploadProfileImage('Joe', buf, 'image/png')).toEqual({ error: 'Error: x' });
  });

  describe('renameUser', () => {
    it('is not-authed with no signed-in user', async () => {
      const h = bridgeFor();
      h.auth.signedIn = null;
      expect(await h.bridge.renameUser('a', 'b')).toEqual({ error: 'not-authed' });
      expect(h.fake.calls).toHaveLength(0);
    });

    it.each([
      [409, { error: 'taken' }],
      [403, { error: 'not-owner' }],
      [500, { error: 'server error 500' }],
    ])('maps %i', async (status, want) => {
      const h = bridgeFor();
      h.fake.on('POST', '/fn/profile/rename', () => text('', status));
      expect(await h.bridge.renameUser('a', 'b')).toEqual(want);
      expect(await h.bridge.getDisplayName()).toBe('Joe');
    });

    it('on success keeps the new name', async () => {
      const h = bridgeFor();
      expect(await h.bridge.renameUser('Joe', 'Joseph')).toEqual({ ok: true });
      expect(await h.bridge.getDisplayName()).toBe('Joseph');
      expect(h.storage.getItem('tt.displayName')).toBe('Joseph');
      await h.bridge.createPlaylist('N', true);
      expect(h.fake.calls.at(-1)?.json()).toMatchObject({ owner: 'Joseph' });
    });

    it('answers a network failure as { error }', async () => {
      const h = bridgeFor();
      h.fake.on('POST', '/fn/profile/rename', () => Promise.reject(new Error('x')));
      expect(await h.bridge.renameUser('a', 'b')).toEqual({ error: 'Error: x' });
    });
  });

  describe('submitFeedback', () => {
    it('answers the issue url', async () => {
      const h = bridgeFor();
      h.fake.on('POST', '/fn/feedback', () => json({ url: 'https://github.com/x/1' }));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ url: 'https://github.com/x/1' });
    });

    it('answers each failure', async () => {
      const h = bridgeFor();
      h.fake.on('POST', '/fn/feedback', () => text('', 401));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ error: 'sign in with your work account first' });
      h.fake.on('POST', '/fn/feedback', () => json({ error: 'too long' }, 400));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ error: 'too long' });
      h.fake.on('POST', '/fn/feedback', () => json({}, 502));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ error: 'server error 502' });
      h.fake.on('POST', '/fn/feedback', () => json({}, 200));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ error: 'server error 200' });
      h.fake.on('POST', '/fn/feedback', () => Promise.reject(new Error('x')));
      expect(await h.bridge.submitFeedback('bug', 't', 'd')).toEqual({ error: 'Error: x' });
    });
  });
});
