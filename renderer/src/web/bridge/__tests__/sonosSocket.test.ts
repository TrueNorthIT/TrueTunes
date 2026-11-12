import { describe, it, expect, vi, afterEach } from 'vitest';
import { FakeWebSocket, fakeAuth, makeBridge, playSonos, startReady, tick, DEVICES, type Frame } from './helpers';

afterEach(() => vi.useRealTimers());

const PB_PUSH = (groupId: string, n = 1): Frame => [
  { namespace: 'playbackExtended', groupId, type: 'extendedPlaybackStatus' },
  { playback: { playbackState: 'PLAYBACK_STATE_PLAYING' }, n },
];
const VOL_PUSH = (groupId: string, volume: number): Frame => [
  { namespace: 'groupVolume', groupId, type: 'groupVolume' },
  { volume },
];

describe('connection', () => {
  it('connects to the relay offering the bearer as a subprotocol, never in the URL', async () => {
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const ws = FakeWebSocket.last();
    expect(ws.url).toBe('wss://gw.test/sonos/ws');
    expect(ws.protocols).toEqual(['v1.api.smartspeaker.audio', 'bearer.tok-1']);
    expect(ws.url).not.toContain('tok-1');
  });

  it('derives the relay URL from the page when none is given', async () => {
    const h = makeBridge();
    delete h.env.socketUrl;
    const { createWebBridge } = await import('../index');
    const bridge = createWebBridge(h.env);
    bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.last().url).toBe(`ws://${location.host}/sonos/ws`);
  });

  it('does not open a second socket on a second start', async () => {
    const h = makeBridge();
    await startReady(h);
    h.bridge.start();
    await tick();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does nothing while signed out', async () => {
    const h = makeBridge({ auth: fakeAuth({ signedIn: null, token: null }) });
    h.bridge.start();
    await tick();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(h.fake.calls).toHaveLength(0);
  });
});

describe('bootstrap', () => {
  it('runs the desktop sequence in order and then announces ready, groups and the active group state', async () => {
    const h = makeBridge();
    const events: string[] = [];
    h.bridge.onWsReady(() => events.push('ready'));
    h.bridge.onWsGroups((g) => events.push(`groups:${g.length}`));
    h.bridge.onWsMessage((hd) => events.push(`msg:${(hd as { namespace: string }).namespace}`));
    const ws = await startReady(h);
    await tick();

    const order = ws.sent.map(([hd]) => `${hd['namespace']}:${hd['command']}`);
    expect(order.slice(0, 2)).toEqual(['households:getHouseholds', 'devices:subscribe']);
    expect(order.slice(2)).toEqual(
      expect.arrayContaining([
        'playbackExtended:subscribe',
        'playbackExtended:subscribe',
        'groupVolume:subscribe',
        'groupVolume:subscribe',
        'playerVolume:subscribe',
        'playerVolume:subscribe',
        'playerVolume:subscribe',
        'hardwareStatus:subscribe',
        'hardwareStatus:subscribe',
        'hardwareStatus:subscribe',
      ])
    );
    // playbackExtended for every coordinator group goes before any groupVolume
    expect(order.indexOf('groupVolume:subscribe')).toBeGreaterThan(order.lastIndexOf('playbackExtended:subscribe'));
    expect(ws.sent[0]).toEqual([
      { command: 'getHouseholds', namespace: 'households', corrId: expect.any(String) },
      { connectedOnly: 'true' },
    ]);
    expect(ws.sent[1][0]).toMatchObject({ namespace: 'devices', householdId: 'HH1', command: 'subscribe' });
    expect(ws.commands('playerVolume').map(([hd]) => hd['playerId'])).toEqual(['RINCON_A', 'RINCON_B', 'RINCON_C']);
    expect(ws.commands('playbackExtended').map(([hd]) => hd['groupId'])).toEqual(['RINCON_A:1', 'RINCON_C:2']);

    // ready and groups, then the active (first) group's initial playback and volume again
    const tail = events.slice(events.indexOf('ready'));
    expect(tail.slice(0, 2)).toEqual(['ready', 'groups:2']);
    expect(tail.slice(2)).toEqual(['msg:playbackExtended', 'msg:groupVolume']);
  });

  it('hands out the groups with id, coordinator, name and players', async () => {
    const h = makeBridge();
    const groups = vi.fn();
    h.bridge.onWsGroups(groups);
    await startReady(h);
    expect(groups).toHaveBeenCalledWith([
      { id: 'RINCON_A:1', coordinatorId: 'RINCON_A', name: 'Kitchen', playerIds: ['RINCON_A', 'RINCON_B'] },
      { id: 'RINCON_C:2', coordinatorId: 'RINCON_C', name: 'Office', playerIds: ['RINCON_C'] },
    ]);
  });

  it('uses the first group and remembers it when there is no preference', async () => {
    const h = makeBridge();
    await startReady(h);
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_A');
    expect(h.storage.getItem('tt.preferredCoordinatorId')).toBe('RINCON_A');
  });

  it('restores the preferred group by coordinator id', async () => {
    const h = makeBridge({ storage: { 'tt.preferredCoordinatorId': 'RINCON_C' } });
    const msgs: Array<[unknown, unknown]> = [];
    h.bridge.onWsMessage((hd, p) => msgs.push([hd, p]));
    const ws = await startReady(h);
    await tick();
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_C');
    await h.bridge.play();
    expect(ws.commands('playback', 'play')[0][0]['groupId']).toBe('RINCON_C:2');
    expect(msgs.every(([hd]) => (hd as { groupId: string }).groupId === 'RINCON_C:2')).toBe(true);
  });

  it('falls back to the first group when the preferred one has gone', async () => {
    const h = makeBridge({ storage: { 'tt.preferredCoordinatorId': 'RINCON_GONE' } });
    await startReady(h);
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_A');
  });

  it('forwards only the active group\'s playback and volume pushes', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    const msgs: Array<{ ns: string; group: unknown }> = [];
    h.bridge.onWsMessage((hd) => msgs.push({ ns: (hd as Frame[0])['namespace'] as string, group: (hd as Frame[0])['groupId'] }));
    await tick();
    msgs.length = 0;
    ws.receive(PB_PUSH('RINCON_C:2'));
    ws.receive(VOL_PUSH('RINCON_C:2', 50));
    ws.receive(PB_PUSH('RINCON_A:1'));
    ws.receive(VOL_PUSH('RINCON_A:1', 40));
    ws.receive([{ namespace: 'playerVolume', playerId: 'RINCON_C' }, { volume: 1 }]);
    expect(msgs).toEqual([
      { ns: 'playbackExtended', group: 'RINCON_A:1' },
      { ns: 'groupVolume', group: 'RINCON_A:1' },
      { ns: 'playerVolume', group: undefined },
    ]);
  });

  it('closes the socket when the bootstrap fails, then reconnects', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    FakeWebSocket.server = (ws, [hd]) => {
      if (hd['command'] === 'getHouseholds') ws.drop();
    };
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('late subscribers', () => {
  it('get ready, groups, auth and the last playback and volume of the active group', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    ws.receive(PB_PUSH('RINCON_A:1', 7));
    ws.receive(VOL_PUSH('RINCON_A:1', 33));
    ws.receive(PB_PUSH('RINCON_C:2', 8)); // another group: never replayed

    const ready = vi.fn();
    const groups = vi.fn();
    const authed = vi.fn();
    const msgs: Array<[Frame[0], unknown]> = [];
    h.bridge.onWsReady(ready);
    h.bridge.onWsGroups(groups);
    h.bridge.onAuthReady(authed);
    h.bridge.onWsMessage((hd, p) => msgs.push([hd as Frame[0], p]));
    expect(ready).not.toHaveBeenCalled(); // later, not inside the subscribe call
    await tick();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(groups).toHaveBeenCalledTimes(1);
    expect(authed).toHaveBeenCalledTimes(1);
    expect(msgs.map(([hd, p]) => [hd['namespace'], (p as { n?: number; volume?: number }).n ?? (p as { volume: number }).volume])).toEqual([
      ['playbackExtended', 7],
      ['groupVolume', 33],
    ]);
  });

  it('an unsubscribed callback is never called', async () => {
    const h = makeBridge();
    await startReady(h);
    const cb = vi.fn();
    const off = h.bridge.onWsReady(cb);
    off();
    await tick();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('send', () => {
  it('times out a command that is never answered after 10 s', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    vi.useFakeTimers();
    FakeWebSocket.server = null;
    const p = h.bridge.play();
    const expectation = expect(p).rejects.toThrow(/WS timeout/);
    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;
    expect(ws.commands('playback', 'play')).toHaveLength(1);
  });

  it('resolves with the payload of the response carrying the same corrId', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    FakeWebSocket.server = (s, [hd]) =>
      queueMicrotask(() => s.receive([{ ...hd, response: 'x' }, { answer: hd['command'] }]));
    expect(await h.bridge.skipNext()).toEqual({ answer: 'skipToNextTrack' });
    expect(ws.sent.at(-1)?.[0]['corrId']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('commands', () => {
  const GROUP = 'RINCON_A:1';
  const table: Array<[string, (b: ReturnType<typeof makeBridge>['bridge']) => Promise<unknown>, Frame]> = [
    ['play', (b) => b.play(), [{ namespace: 'playback', groupId: GROUP, command: 'play' }, { allowTvPauseRestore: true, deviceFeedback: 'NONE' }]],
    ['pause', (b) => b.pause(), [{ namespace: 'playback', groupId: GROUP, command: 'pause' }, { allowTvPauseRestore: true, deviceFeedback: 'NONE' }]],
    ['skipNext', (b) => b.skipNext(), [{ namespace: 'playback', groupId: GROUP, command: 'skipToNextTrack' }, {}]],
    ['skipPrev', (b) => b.skipPrev(), [{ namespace: 'playback', groupId: GROUP, command: 'skipBack' }, {}]],
    ['skipToTrack', (b) => b.skipToTrack(4), [{ namespace: 'playback', groupId: GROUP, command: 'skipToTrack' }, { trackNumber: 4 }]],
    ['seek', (b) => b.seek(12345), [{ namespace: 'playback', groupId: GROUP, command: 'seek' }, { positionMillis: 12345 }]],
    ['setPlayModes', (b) => b.setPlayModes({ shuffle: true }), [{ namespace: 'playback', groupId: GROUP, command: 'setPlayModes' }, { playModes: { shuffle: true } }]],
    ['loadContent', (b) => b.loadContent({ type: 'CUSTOM' }), [{ namespace: 'playback', groupId: GROUP, command: 'loadContent' }, { type: 'CUSTOM' }]],
    ['setGroupVolume', (b) => b.setGroupVolume(35), [{ namespace: 'groupVolume', groupId: GROUP, command: 'setVolume' }, { volume: 35 }]],
  ];

  it.each(table)('%s sends its frame to the active group', async (_name, call, [header, payload]) => {
    const h = makeBridge();
    const ws = await startReady(h);
    const before = ws.sent.length;
    await call(h.bridge);
    const [sentHeader, sentPayload] = ws.sent[before];
    expect(sentHeader).toEqual({ ...header, corrId: expect.any(String) });
    expect(sentPayload).toEqual(payload);
    expect(ws.sent).toHaveLength(before + 1);
  });

  it.each(table.filter(([n]) => n !== 'setGroupVolume'))('%s says the socket is down before it connects', async (_name, call) => {
    const h = makeBridge();
    expect(await call(h.bridge)).toEqual({ error: 'WS not connected' });
  });

  it('setGroupVolume validates before it sends', async () => {
    const h = makeBridge();
    expect(await h.bridge.setGroupVolume(101)).toEqual({ error: 'Invalid volume' });
    expect(await h.bridge.setGroupVolume(-1)).toEqual({ error: 'Invalid volume' });
    expect(await h.bridge.setGroupVolume('5' as unknown as number)).toEqual({ error: 'Invalid volume' });
    expect(await h.bridge.setGroupVolume(50)).toEqual({ error: 'No active group' });
    await startReady(h);
    const ws = FakeWebSocket.last();
    ws.drop();
    expect(await h.bridge.setGroupVolume(50)).toEqual({ error: 'WS not connected' });
  });

  describe('playAudioClip', () => {
    it('says the socket is down before it connects', async () => {
      const h = makeBridge();
      expect(await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3' })).toEqual({ error: 'WS not connected' });
    });

    it('plays an https url on every player of the active group', async () => {
      const h = makeBridge();
      const ws = await startReady(h);
      const res = await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3' });
      const clips = ws.commands('audioClip', 'loadAudioClip');
      expect(clips.map(([hd]) => hd['playerId'])).toEqual(['RINCON_A', 'RINCON_B']);
      expect(clips[0][1]).toEqual({
        name: 'TrueTunes',
        appId: 'com.truetunes',
        clipType: 'CUSTOM',
        streamUrl: 'https://x.test/a.mp3',
        priority: 'LOW',
        volume: 30,
      });
      expect(res).toEqual([
        { playerId: 'RINCON_A', result: {} },
        { playerId: 'RINCON_B', result: {} },
      ]);
    });

    it('speaks text through Google TTS, with a volume and chosen players', async () => {
      const h = makeBridge();
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ text: 'hello there', volume: 55, playerIds: ['RINCON_C'] });
      const [[hd, payload]] = ws.commands('audioClip');
      expect(hd['playerId']).toBe('RINCON_C');
      expect(payload).toMatchObject({
        volume: 55,
        streamUrl: 'https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=hello%20there',
      });
    });

    it('validates', async () => {
      const h = makeBridge();
      await startReady(h);
      expect(await h.bridge.playAudioClip({})).toEqual({ error: 'Need text or an https url' });
      expect(await h.bridge.playAudioClip({ url: 'http://x.test/a.mp3' })).toEqual({ error: 'Need text or an https url' });
      expect(await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3', volume: 101 })).toEqual({ error: 'Invalid volume' });
      expect(await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3', playerIds: [] })).toEqual({ error: 'No active group' });
    });

    it('turns a failed player into an error entry', async () => {
      const h = makeBridge();
      await startReady(h);
      vi.useFakeTimers();
      FakeWebSocket.server = null;
      const p = h.bridge.playAudioClip({ url: 'https://x.test/a.mp3', playerIds: ['RINCON_A'] });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await p).toEqual([{ playerId: 'RINCON_A', result: { error: expect.stringContaining('WS timeout') } }]);
    });
  });
});

describe('setGroup, refreshPlayback, resync', () => {
  it('setGroup switches, remembers, and re-subscribes playback and volume for the new group', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    const before = ws.sent.length;
    expect(await h.bridge.setGroup('RINCON_C:2')).toEqual({ ok: true });
    await tick();
    const sent = ws.sent.slice(before).map(([hd]) => `${hd['namespace']}:${hd['groupId']}:${hd['command']}`);
    expect(sent).toEqual(['playbackExtended:RINCON_C:2:subscribe', 'groupVolume:RINCON_C:2:subscribe']);
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_C');
    expect(h.storage.getItem('tt.preferredCoordinatorId')).toBe('RINCON_C');
    await h.bridge.pause();
    expect(ws.commands('playback', 'pause')[0][0]['groupId']).toBe('RINCON_C:2');
  });

  it('setGroup refuses an unknown group', async () => {
    const h = makeBridge();
    await startReady(h);
    expect(await h.bridge.setGroup('nope')).toEqual({ error: 'Unknown group: nope' });
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_A');
  });

  it('after a switch the old group\'s replayed state is gone and the new group\'s push is forwarded', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    ws.receive(PB_PUSH('RINCON_A:1', 1));
    await h.bridge.setGroup('RINCON_C:2');
    await tick();
    const seen: unknown[] = [];
    h.bridge.onWsMessage((hd) => seen.push((hd as Frame[0])['groupId']));
    await tick();
    // only what the re-subscribes answered for the new group
    expect(seen.every((g) => g === 'RINCON_C:2')).toBe(true);
    ws.receive(PB_PUSH('RINCON_C:2', 2));
    expect(seen.at(-1)).toBe('RINCON_C:2');
  });

  it('refreshPlayback re-subscribes the active group when connected, and is quiet when not', async () => {
    const h = makeBridge();
    await h.bridge.refreshPlayback();
    const ws = await startReady(h);
    const before = ws.sent.length;
    await h.bridge.refreshPlayback();
    expect(ws.sent.slice(before).map(([hd]) => [hd['namespace'], hd['groupId'], hd['command']])).toEqual([
      ['playbackExtended', 'RINCON_A:1', 'subscribe'],
    ]);
  });

  it('resync re-announces ready and groups and refreshes playback', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    const ready = vi.fn();
    const groups = vi.fn();
    h.bridge.onWsReady(ready);
    h.bridge.onWsGroups(groups);
    await tick();
    ready.mockClear();
    groups.mockClear();
    const before = ws.sent.length;
    await h.bridge.resync();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(groups).toHaveBeenCalledTimes(1);
    expect(ws.sent.slice(before).map(([hd]) => hd['namespace'])).toEqual(['playbackExtended']);
  });

  it('resync with the socket down starts a fresh connection', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    vi.useFakeTimers();
    ws.drop();
    await h.bridge.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('reconnect', () => {
  it('backs off 1 s, 2 s, 4 s ... capped at 30 s, and resets after an open', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    let expectedCount = 1;
    expect(FakeWebSocket.instances).toHaveLength(expectedCount);

    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      FakeWebSocket.last().drop();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(expectedCount);
      await vi.advanceTimersByTimeAsync(1);
      expectedCount++;
      expect(FakeWebSocket.instances).toHaveLength(expectedCount);
    }

    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.instances).toHaveLength(expectedCount + 1);
  });

  it('asks for a freshly refreshed token after a connection that was never accepted', async () => {
    vi.useFakeTimers();
    const auth = fakeAuth({ token: 'old', refreshed: 'new' });
    const h = makeBridge({ auth });
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.last().protocols).toEqual(['v1.api.smartspeaker.audio', 'bearer.old']);
    FakeWebSocket.last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.last().protocols).toEqual(['v1.api.smartspeaker.audio', 'bearer.new']);
    expect(auth.idTokenCalls.filter((c) => c?.forceRefresh)).toHaveLength(1);
  });

  it('does not force a refresh when an accepted connection drops', async () => {
    vi.useFakeTimers();
    const auth = fakeAuth();
    const h = makeBridge({ auth });
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    auth.idTokenCalls.length = 0;
    FakeWebSocket.last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(auth.idTokenCalls.some((c) => c?.forceRefresh)).toBe(false);
  });

  it('emits auth expired and stops when no token can be had, until start is called again', async () => {
    vi.useFakeTimers();
    const auth = fakeAuth({ token: 'old', refreshed: null });
    const h = makeBridge({ auth });
    const expired = vi.fn();
    h.bridge.onAuthExpired(expired);
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    auth.refreshed = undefined;
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('stop closes the socket and stops reconnecting', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    h.bridge.stop();
    expect(FakeWebSocket.last().readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('ignores a frame that is not JSON', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    ws.dispatchEvent(new MessageEvent('message', { data: 'not json' }));
    expect(DEVICES.length).toBe(3);
  });
});
