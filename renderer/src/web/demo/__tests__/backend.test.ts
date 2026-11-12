import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoBackend, disposeDemoBackends } from '..';
import { TRACKS, albumById } from '../../../test/fixtures/catalog';
import { NOW_PLAYING_INDEX, QUEUE_TRACKS } from '../../../test/mockBackend';

interface Pushed {
  playback: { playbackState: string; positionMillis: number; itemId?: string; queueVersion: string };
  metadata?: { currentItem: { track: { name: string } } };
}
type QueueRow = { id: { objectId: string } };

/** A backend with one subscriber recording every push. */
async function start() {
  const bridge = createDemoBackend();
  const playbacks: Pushed[] = [];
  const volumes: number[] = [];
  bridge.onWsMessage((h, p) => {
    const ns = (h as { namespace: string }).namespace;
    if (ns === 'playbackExtended') playbacks.push(p as Pushed);
    else if (ns === 'groupVolume') volumes.push((p as { volume: number }).volume);
  });
  await flush();
  const last = () => playbacks[playbacks.length - 1];
  const queueIds = async () => {
    const r = await bridge.fetch({ operationId: 'getQueueResources', query: { count: '50' } });
    return ((r.data as { items: QueueRow[] }).items ?? []).map((i) => i.id.objectId);
  };
  return { bridge, playbacks, volumes, last, queueIds };
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const ids = QUEUE_TRACKS.map((t) => t.id);
const now = QUEUE_TRACKS[NOW_PLAYING_INDEX];
const addBody = (objectId: string, type = 'TRACK') => ({ id: { objectId }, type });
const spare = (n: number) => TRACKS.filter((t) => !ids.includes(t.id))[n];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  disposeDemoBackends();
  vi.useRealTimers();
});

describe('pushes', () => {
  it('delivers the current state on subscribe, later than the subscribe call', async () => {
    const bridge = createDemoBackend();
    const msgs: string[] = [];
    bridge.onWsMessage((h) => msgs.push((h as { namespace: string }).namespace));
    expect(msgs).toEqual([]);
    await flush();
    expect(msgs).toEqual(['groupVolume', 'playbackExtended']);

    const groups = vi.fn();
    const map = vi.fn();
    const entra = vi.fn();
    const auth = vi.fn();
    bridge.onWsGroups(groups);
    bridge.onAttributionMap(map);
    bridge.onEntraReady(entra);
    bridge.onAuthReady(auth);
    await flush();
    expect(groups).toHaveBeenCalledOnce();
    expect(Object.keys(map.mock.calls[0][0])).toHaveLength(20);
    expect(entra).toHaveBeenCalledOnce();
    expect(auth).toHaveBeenCalledOnce();
  });

  it('starts playing the fourth track, 83 s in, at volume 35', async () => {
    const { last, volumes } = await start();
    expect(volumes).toEqual([35]);
    expect(last().playback).toMatchObject({
      playbackState: 'PLAYBACK_STATE_PLAYING',
      positionMillis: 83_000,
      itemId: '4',
    });
    expect(last().metadata?.currentItem.track.name).toBe(now.title);
  });

  it('stops pushing to an unsubscribed listener', async () => {
    const bridge = createDemoBackend();
    const cb = vi.fn();
    const off = bridge.onWsMessage(cb);
    await flush();
    cb.mockClear();
    off();
    await bridge.pause();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('transport', () => {
  it('pause freezes the position, play resumes it', async () => {
    const { bridge, playbacks, last } = await start();
    vi.advanceTimersByTime(5_000);
    await bridge.pause();
    expect(last().playback).toMatchObject({ playbackState: 'PLAYBACK_STATE_PAUSED', positionMillis: 88_000 });
    const pushes = playbacks.length;
    vi.advanceTimersByTime(20_000);
    expect(playbacks).toHaveLength(pushes); // no per-second pushing
    await bridge.play();
    expect(last().playback).toMatchObject({ playbackState: 'PLAYBACK_STATE_PLAYING', positionMillis: 88_000 });
    vi.advanceTimersByTime(2_000);
    await bridge.pause();
    expect(last().playback.positionMillis).toBe(90_000);
  });

  it('skips next, previous and to a numbered (1-based) track', async () => {
    const { bridge, last } = await start();
    await bridge.skipNext();
    expect(last().playback.itemId).toBe('5');
    expect(last().metadata?.currentItem.track.name).toBe(QUEUE_TRACKS[4].title);
    expect(last().playback.positionMillis).toBe(0);
    await bridge.skipPrev(); // within 3 s of the start: back one track
    expect(last().playback.itemId).toBe('4');
    vi.advanceTimersByTime(10_000);
    await bridge.skipPrev(); // later: restarts the same track
    expect(last().playback).toMatchObject({ itemId: '4', positionMillis: 0 });
    await bridge.skipToTrack(1);
    expect(last().metadata?.currentItem.track.name).toBe(QUEUE_TRACKS[0].title);
    expect(await bridge.skipToTrack(99)).toHaveProperty('error');
  });

  it('seeks within the track', async () => {
    const { bridge, last } = await start();
    await bridge.seek(30_000);
    expect(last().playback.positionMillis).toBe(30_000);
  });

  it('advances to the next track when one ends, and stops at the end of the queue', async () => {
    const { bridge, last } = await start();
    vi.advanceTimersByTime(now.durationSec * 1000 - 83_000 + 1);
    expect(last().playback.itemId).toBe('5');
    expect(last().playback.positionMillis).toBeLessThan(1000);

    await bridge.skipToTrack(20);
    vi.advanceTimersByTime(QUEUE_TRACKS[19].durationSec * 1000 + 1);
    expect(last().playback).toMatchObject({ playbackState: 'PLAYBACK_STATE_IDLE', itemId: '20', positionMillis: 0 });
  });

  it('wraps at the end with repeat on, and repeats one track with repeatOne', async () => {
    const { bridge, last } = await start();
    await bridge.setPlayModes({ repeat: true, repeatOne: false });
    await bridge.skipToTrack(20);
    vi.advanceTimersByTime(QUEUE_TRACKS[19].durationSec * 1000 + 1);
    expect(last().playback).toMatchObject({ playbackState: 'PLAYBACK_STATE_PLAYING', itemId: '1' });
    await bridge.setPlayModes({ repeat: false, repeatOne: true, shuffle: true });
    vi.advanceTimersByTime(QUEUE_TRACKS[0].durationSec * 1000 + 1);
    expect(last().playback.itemId).toBe('1');
  });

  it('pushes a groupVolume message when the volume is set', async () => {
    const { bridge, volumes } = await start();
    await bridge.setGroupVolume(60);
    expect(volumes).toEqual([35, 60]);
    expect(await bridge.setGroupVolume(101)).toHaveProperty('error');
  });
});

describe('queue', () => {
  it('adds at the requested position, bumping the etag, and honours If-Match', async () => {
    const { bridge, queueIds, last } = await start();
    const before = await bridge.fetch({ operationId: 'getQueueResources' });
    const extra = spare(2);
    const r = await bridge.fetch({
      operationId: 'addQueueResource',
      query: { position: '2' },
      headers: { 'If-Match': before.etag! },
      body: addBody(extra.id),
    });
    expect(r.error).toBeUndefined();
    expect(r.etag).not.toBe(before.etag);
    expect((await queueIds()).slice(0, 4)).toEqual([ids[0], ids[1], extra.id, ids[2]]);
    expect(last().playback.queueVersion).toBe(r.etag);
    expect(last().playback.itemId).toBe('5'); // the playing track moved down one

    const stale = await bridge.fetch({
      operationId: 'addQueueResource',
      query: { position: '-1' },
      headers: { 'If-Match': before.etag! },
      body: addBody(extra.id),
    });
    expect(stale.error).toMatch(/Precondition/);
    await bridge.fetch({ operationId: 'addQueueResource', query: { position: '-1' }, body: addBody(extra.id) });
    expect((await queueIds()).slice(-1)[0]).toBe(extra.id);
  });

  it('adds an album as its tracks', async () => {
    const { bridge, queueIds } = await start();
    const album = albumById(QUEUE_TRACKS[0].albumId)!;
    await bridge.fetch({ operationId: 'addQueueResource', query: { position: '0' }, body: addBody(album.id, 'ALBUM') });
    expect((await queueIds()).slice(0, album.tracks.length)).toEqual(album.tracks.map((t) => t.id));
  });

  it('pages the queue', async () => {
    const { bridge } = await start();
    const r = await bridge.fetch({ operationId: 'getQueueResources', query: { count: '5', offset: '18' } });
    expect((r.data as { items: unknown[] }).items).toHaveLength(2);
  });

  it('removes items and keeps the right track playing', async () => {
    const { bridge, queueIds, last } = await start();
    await bridge.removeFromQueue([0, 2, 10]);
    expect(await queueIds()).toEqual(ids.filter((_, i) => ![0, 2, 10].includes(i)));
    expect(last().playback.itemId).toBe('2'); // still the same track, two rows earlier
    expect(last().metadata?.currentItem.track.name).toBe(now.title);
  });

  it('plays the next track when the playing one is removed (and over the BFF delete)', async () => {
    const { bridge, last } = await start();
    await bridge.fetch({ operationId: 'deleteQueueResources', query: { items: '3' } });
    expect(last().metadata?.currentItem.track.name).toBe(QUEUE_TRACKS[4].title);
    expect(last().playback).toMatchObject({ itemId: '4', positionMillis: 0, playbackState: 'PLAYBACK_STATE_PLAYING' });
  });

  it('reorders a non-contiguous selection to sit before toIndex, keeping the playing track', async () => {
    const { bridge, queueIds, last } = await start();
    await bridge.reorderQueue([1, 5, 9], 3, 20);
    const order = [0, 2, 1, 5, 9, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    expect(await queueIds()).toEqual(order.map((i) => ids[i]));
    expect(last().metadata?.currentItem.track.name).toBe(now.title);
    expect(last().playback.itemId).toBe('6'); // the playing track is now sixth
    await bridge.reorderQueue([0], 20, 20); // to the very end
    expect((await queueIds()).slice(-1)[0]).toBe(ids[0]);
  });

  it('reorders a contiguous run through the BFF', async () => {
    const { bridge, queueIds } = await start();
    await bridge.fetch({ operationId: 'reorderQueueResources', query: { items: '0,1', positions: '5,6' } });
    expect((await queueIds()).slice(0, 8)).toEqual([ids[2], ids[3], ids[4], ids[5], ids[6], ids[0], ids[1], ids[7]]);
  });

  it('clears the queue and goes idle; an add then fills it again', async () => {
    const { bridge, queueIds, last } = await start();
    await bridge.clearQueue();
    expect(await queueIds()).toEqual([]);
    expect(last().playback.playbackState).toBe('PLAYBACK_STATE_IDLE');
    await bridge.fetch({ operationId: 'addQueueResource', body: addBody(ids[7]) });
    expect(await queueIds()).toEqual([ids[7]]);
    expect(last().metadata?.currentItem.track.name).toBe(QUEUE_TRACKS[7].title);
  });

  it('loadContent puts the content after the playing track and plays it', async () => {
    const { bridge, queueIds, last } = await start();
    const extra = spare(5);
    await bridge.loadContent({ type: 'TRACK', id: { objectId: extra.id } });
    expect((await queueIds())[4]).toBe(extra.id);
    expect(last().metadata?.currentItem.track.name).toBe(extra.title);
    expect(last().playback).toMatchObject({ itemId: '5', playbackState: 'PLAYBACK_STATE_PLAYING' });
    await bridge.loadContent({ type: 'TRACK', id: { objectId: ids[0] }, queueAction: 'REPLACE' });
    expect(await queueIds()).toEqual([ids[0]]);
  });
});

describe('attribution', () => {
  it('shows a published queue add in the map and tells subscribers', async () => {
    const { bridge } = await start();
    const events = vi.fn();
    const maps = vi.fn();
    bridge.onAttributionEvent(events);
    bridge.onAttributionMap(maps);
    await flush();
    await bridge.publishQueued({ eventType: 'track', uri: 'demo-uri', trackName: 'Some Song', artist: 'Some Band' });
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'queued', uri: 'demo-uri', user: 'Wren Calloway', trackName: 'Some Song' })
    );
    expect(maps.mock.calls.slice(-1)[0]?.[0]['demo-uri']).toMatchObject({ user: 'Wren Calloway', artist: 'Some Band' });
    maps.mockClear();
    await bridge.refreshAttribution();
    expect(maps).toHaveBeenCalledOnce();
  });
});

describe('playlists, game and polls', () => {
  it('round-trips a playlist', async () => {
    const { bridge } = await start();
    const made = await bridge.createPlaylist('Demo mix', true);
    const t = QUEUE_TRACKS[0];
    const track = {
      uri: t.id,
      trackName: t.title,
      artist: t.artist,
      serviceId: 's',
      accountId: 'a',
      addedBy: 'x',
      addedAt: 0,
    };
    await bridge.addTrackToPlaylist(made.id, track);
    await bridge.addTrackToPlaylist(made.id, { ...track, uri: QUEUE_TRACKS[1].id });
    await bridge.reorderPlaylistTracks(made.id, 0, 1);
    expect((await bridge.fetchPlaylist(made.id)).tracks.map((x) => x.uri)).toEqual([QUEUE_TRACKS[1].id, t.id]);
    expect((await bridge.fetchPlaylists({ owner: 'Wren Calloway' })).find((p) => p.id === made.id)).toMatchObject({
      name: 'Demo mix',
      trackCount: 2,
    });
    await bridge.updatePlaylist(made.id, { name: 'Renamed' });
    await bridge.removeTrackFromPlaylist(made.id, t.id);
    expect(await bridge.fetchPlaylist(made.id)).toMatchObject({ name: 'Renamed', trackCount: 1 });
    await bridge.deletePlaylist(made.id);
    await expect(bridge.fetchPlaylist(made.id)).rejects.toThrow();
    expect((await bridge.fetchPlaylists({ owner: 'Wren Calloway' })).some((p) => p.id === made.id)).toBe(false);
  });

  it('adds a favourite and lets a member leave a shared playlist', async () => {
    const { bridge } = await start();
    const fav = await bridge.ensureFavourites();
    const before = fav.tracks.length;
    await bridge.addTrackToPlaylist(fav.id, {
      uri: 'new-fav',
      trackName: 'x',
      artist: 'y',
      serviceId: 's',
      accountId: 'a',
      addedBy: '',
      addedAt: 0,
    });
    expect((await bridge.ensureFavourites()).tracks).toHaveLength(before + 1);
    const joined = await bridge.joinPlaylist('pl-sunday', 'join');
    expect((await bridge.fetchPlaylist('pl-sunday')).members).toContain('Wren Calloway');
    expect(joined.id).toBe('pl-sunday');
    await bridge.joinPlaylist('pl-sunday', 'leave');
    expect((await bridge.fetchPlaylist('pl-sunday')).members).not.toContain('Wren Calloway');
  });

  it('scores a Queuedle game and reflects it everywhere it is read', async () => {
    const { bridge } = await start();
    const gameDate = '2026-10-26';
    const game = await bridge.fetchDailyGame(gameDate);
    if (!('questions' in game)) throw new Error('no game');
    const guesses = {
      main: game.questions.map((q) => q.winner),
      bonus: game.questions.map((q) => (q.winner === 'left' ? q.left : q.right).topQueuer),
    };
    expect((await bridge.fetchMyScore(gameDate, 'Wren Calloway')).score).toBeUndefined();
    const res = await bridge.submitGameScore({ gameId: gameDate, userName: 'Wren Calloway', guesses });
    expect(res).toMatchObject({ ok: true, score: { mainScore: 10, bonusScore: 10, total: 20 } });
    expect((await bridge.submitGameScore({ gameId: gameDate, userName: 'Wren Calloway', guesses })).duplicate).toBe(
      true
    );
    expect((await bridge.fetchMyScore(gameDate, 'Wren Calloway')).score).toMatchObject({ total: 20, guesses });
    expect((await bridge.fetchGameDates('Wren Calloway')).dates?.find((d) => d.gameId === gameDate)?.userPlayed).toBe(
      true
    );
    expect((await bridge.fetchGameLeaderboard(gameDate)).scores[0]).toMatchObject({
      userName: 'Wren Calloway',
      total: 20,
    });
  });

  it('serves one live poll, and admin edits work on drafts only', async () => {
    const { bridge } = await start();
    const res = await bridge.fetchPolls();
    expect('polls' in res && res.polls.map((p) => p.id)).toEqual(['demo-poll-1']);
    expect(await bridge.answerPoll({ pollId: 'demo-poll-1', choice: 1 })).toEqual({ ok: true });
    const created = await bridge.pollAdminCreate({ question: 'Next?', choices: ['a', 'b'] });
    if (!('poll' in created)) throw new Error('create failed');
    expect(created.poll.live).toBe(false);
    expect(
      await bridge.pollAdminUpdate(created.poll.id, { question: 'Edited?', choices: ['a', 'b', 'c'] })
    ).toMatchObject({
      poll: { question: 'Edited?' },
    });
    expect(await bridge.pollAdminDelete('demo-poll-1')).toHaveProperty('error');
    expect(await bridge.pollAdminDelete(created.poll.id)).toEqual({ ok: true });
  });
});

describe('every method settles', () => {
  const buf = new ArrayBuffer(1);
  const track = { uri: 'u', trackName: 't', artist: 'a', serviceId: 's', accountId: 'c', addedBy: 'x', addedAt: 0 };
  const args: Record<string, unknown[]> = {
    fetch: [{ operationId: 'getQueueResources' }],
    fetchImage: ['https://art.mock.invalid/x.svg'],
    setGroup: ['g'],
    setGroupVolume: [10],
    setQueueId: ['q'],
    loadContent: [{ type: 'TRACK', id: { objectId: ids[0] } }],
    playAudioClip: [{ text: 'hi' }],
    setPlayModes: [{ shuffle: true }],
    skipToTrack: [1],
    seek: [1000],
    reorderQueue: [[0], 1, 20],
    removeFromQueue: [[0]],
    openExternal: ['https://example.invalid'],
    setDisplayName: ['Demo'],
    renameUser: ['a', 'b'],
    publishQueued: [{ eventType: 'track', uri: 'u', trackName: 't', artist: 'a' }],
    fetchRecentlyPlayed: ['x'],
    fetchStats: ['week'],
    fetchMyScore: ['2026-10-26', 'x'],
    fetchGameDates: ['x'],
    submitGameScore: [{ gameId: '2026-10-26', userName: 'x', guesses: { main: [], bonus: [] } }],
    answerPoll: [{ pollId: 'demo-poll-1', choice: 0 }],
    pollAdminCreate: [{ question: 'q', choices: ['a', 'b'] }],
    pollAdminUpdate: ['demo-poll-1', { question: 'q', choices: ['a', 'b'] }],
    pollAdminDelete: ['demo-poll-1'],
    pollAdminReorder: [[]],
    reportTrackMeta: [[]],
    trackEvent: ['e'],
    fetchPlaylists: [{}],
    fetchPlaylist: ['pl-focus'],
    createPlaylist: ['x', true],
    updatePlaylist: ['pl-focus', { name: 'x' }],
    deletePlaylist: ['pl-sunday'],
    addTrackToPlaylist: ['pl-focus', track],
    removeTrackFromPlaylist: ['pl-focus', 'u'],
    reorderPlaylistTracks: ['pl-focus', 0, 1],
    joinPlaylist: ['pl-sunday', 'join'],
    uploadPlaylistImage: ['pl-focus', buf, 'image/png', 'x'],
    uploadProfileImage: ['x', buf, 'image/png'],
    fetchUserProfile: ['x'],
    submitFeedback: ['bug', 't', 'd'],
    geniusDescription: ['a', 'b'],
    geniusArtist: ['a'],
    geniusAlbumYear: ['a', 'b'],
    geniusArtistAlbums: ['a'],
    geniusAlbumAbout: ['a', 'b'],
    djAutoplay: [{ groupId: 'g', clientId: 'c', queueUris: [] }],
    updateNowPlayingSmtc: [{}],
  };

  it('resolves or rejects promptly, never hangs', async () => {
    vi.useRealTimers();
    const bridge = createDemoBackend();
    const hung: string[] = [];
    for (const [name, fn] of Object.entries(bridge)) {
      if (/^on[A-Z]/.test(name)) continue;
      const call = Promise.resolve()
        .then(() => (fn as (...a: unknown[]) => unknown)(...(args[name] ?? [])))
        .then(
          () => 'settled',
          () => 'settled'
        );
      const verdict = await Promise.race([call, new Promise<string>((r) => setTimeout(() => r('hung'), 200))]);
      if (verdict === 'hung') hung.push(name);
    }
    expect(hung).toEqual([]);
  });

  it('gives each backend its own state', async () => {
    const a = createDemoBackend();
    const b = createDemoBackend();
    await a.clearQueue();
    const r = await b.fetch({ operationId: 'getQueueResources' });
    expect((r.data as { items: unknown[] }).items).toHaveLength(20);
  });
});
