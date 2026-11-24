import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEVICES,
  FakeWebSocket,
  fakeAuth,
  json,
  makeBridge,
  playSonos,
  startReady,
  text,
  tick,
  last,
  type Frame,
} from './helpers';

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

  it.each([
    ['', `ws://${location.host}/sonos/ws`],
    ['https://gw.test', 'wss://gw.test/sonos/ws'],
    ['http://localhost:8080/', 'ws://localhost:8080/sonos/ws'],
  ])('derives the relay URL when none is given (gateway base %j)', async (gatewayBase, want) => {
    const h = makeBridge({ gatewayBase });
    delete h.env.socketUrl;
    const { createWebBridge } = await import('../index');
    const bridge = createWebBridge(h.env);
    bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.last().url).toBe(want);
    bridge.stop();
  });

  it('takes a socketUrl with or without the path', async () => {
    const h = makeBridge();
    h.env.socketUrl = 'wss://relay.test/sonos/ws';
    const { createWebBridge } = await import('../index');
    createWebBridge(h.env).start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(FakeWebSocket.last().url).toBe('wss://relay.test/sonos/ws');
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
    const state = msgs
      .map(([hd]) => hd as Frame[0])
      .filter((hd) => hd['namespace'] === 'playbackExtended' || hd['namespace'] === 'groupVolume');
    expect(state.length).toBeGreaterThan(0);
    expect(state.every((hd) => hd['groupId'] === 'RINCON_C:2')).toBe(true);
  });

  it('falls back to the first group when the preferred one has gone', async () => {
    const h = makeBridge({ storage: { 'tt.preferredCoordinatorId': 'RINCON_GONE' } });
    await startReady(h);
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_A');
  });

  it("forwards only the active group's playback and volume pushes", async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    const msgs: Array<{ ns: string; group: unknown }> = [];
    h.bridge.onWsMessage((hd) =>
      msgs.push({ ns: (hd as Frame[0])['namespace'] as string, group: (hd as Frame[0])['groupId'] })
    );
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
    expect(
      msgs.map(([hd, p]) => [
        hd['namespace'],
        (p as { n?: number; volume?: number }).n ?? (p as { volume: number }).volume,
      ])
    ).toEqual([
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
    expect(last(ws.sent)?.[0]['corrId']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('commands', () => {
  const GROUP = 'RINCON_A:1';
  const table: Array<[string, (b: ReturnType<typeof makeBridge>['bridge']) => Promise<unknown>, Frame]> = [
    [
      'play',
      (b) => b.play(),
      [
        { namespace: 'playback', groupId: GROUP, command: 'play' },
        { allowTvPauseRestore: true, deviceFeedback: 'NONE' },
      ],
    ],
    [
      'pause',
      (b) => b.pause(),
      [
        { namespace: 'playback', groupId: GROUP, command: 'pause' },
        { allowTvPauseRestore: true, deviceFeedback: 'NONE' },
      ],
    ],
    ['skipNext', (b) => b.skipNext(), [{ namespace: 'playback', groupId: GROUP, command: 'skipToNextTrack' }, {}]],
    ['skipPrev', (b) => b.skipPrev(), [{ namespace: 'playback', groupId: GROUP, command: 'skipBack' }, {}]],
    [
      'skipToTrack',
      (b) => b.skipToTrack(4),
      [{ namespace: 'playback', groupId: GROUP, command: 'skipToTrack' }, { trackNumber: 4 }],
    ],
    [
      'seek',
      (b) => b.seek(12345),
      [{ namespace: 'playback', groupId: GROUP, command: 'seek' }, { positionMillis: 12345 }],
    ],
    [
      'setPlayModes',
      (b) => b.setPlayModes({ shuffle: true }),
      [{ namespace: 'playback', groupId: GROUP, command: 'setPlayModes' }, { playModes: { shuffle: true } }],
    ],
    [
      'loadContent',
      (b) => b.loadContent({ type: 'CUSTOM' }),
      [{ namespace: 'playback', groupId: GROUP, command: 'loadContent' }, { type: 'CUSTOM' }],
    ],
    [
      'setGroupVolume',
      (b) => b.setGroupVolume(35),
      [{ namespace: 'groupVolume', groupId: GROUP, command: 'setVolume' }, { volume: 35 }],
    ],
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

  it.each(table.filter(([n]) => n !== 'setGroupVolume'))(
    '%s says the socket is down before it connects',
    async (_name, call) => {
      const h = makeBridge();
      expect(await call(h.bridge)).toEqual({ error: 'WS not connected' });
    }
  );

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

    // The announcement path under test is playAudioClip -> gateway POST /tts -> `audioClip` frames. The gateway's
    // contract is in server/src/shared/gatewayTts.test.ts; the web bridge's code is renderer/src/web/bridge/commands.ts.
    const MINTED = 'https://gw.test/tts/AbCdEfGhIjKlMnOpQrStUv.mp3';
    const GOOGLE = (q: string) => `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${q}`;
    const mints = (h: ReturnType<typeof makeBridge>) => h.fake.on('POST', '/tts', () => json({ url: MINTED }));

    // REQ-1: "A spoken announcement plays in a natural British Azure voice." Given { text }, playAudioClip POSTs
    // it to the gateway's /tts with the caller's Entra token and plays the minted link, with the volume and players asked for.
    it('REQ-1: speaks text through the gateway’s Azure Speech link, with a volume and chosen players', async () => {
      const h = makeBridge();
      mints(h);
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ text: 'hello there', volume: 55, playerIds: ['RINCON_C'] });

      const posts = h.fake.to('/tts', 'POST');
      expect(posts, 'Expected exactly one POST /tts for one announcement').toHaveLength(1);
      expect(posts[0].headers['authorization'], 'Expected the caller’s Entra ID token as a Bearer token').toBe(
        'Bearer tok-1'
      );
      expect(posts[0].headers['content-type'], 'Expected a JSON body').toMatch(/application\/json/);
      expect(posts[0].json(), 'Expected the body to be { text } (the gateway picks the default voice)').toEqual({
        text: 'hello there',
      });
      const [[hd, payload]] = ws.commands('audioClip');
      expect(hd['playerId']).toBe('RINCON_C');
      expect(payload, 'Expected the speakers to be given the minted gateway link, not a Google URL').toMatchObject({
        volume: 55,
        streamUrl: MINTED,
      });
    });

    // REQ-2: "The caller can choose the voice for one announcement." { text, voice } is passed to /tts unchanged.
    it('REQ-2: passes a chosen voice to the gateway', async () => {
      const h = makeBridge();
      mints(h);
      await startReady(h);
      await h.bridge.playAudioClip({ text: 'Hi', voice: 'en-GB-RyanNeural' });
      expect(h.fake.to('/tts', 'POST')[0]?.json(), 'Expected { text, voice } in the POST /tts body').toEqual({
        text: 'Hi',
        voice: 'en-GB-RyanNeural',
      });
    });

    // REQ-8: "One announcement uses the quota once, however many speakers are in the group." The active group has
    // two players: one POST /tts, and both speakers are given the same link.
    it('REQ-8: one announcement to a two-speaker group makes one /tts request and gives both speakers the same link', async () => {
      const h = makeBridge();
      mints(h);
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ text: 'Pizza is here' });
      expect(h.fake.to('/tts', 'POST'), 'Expected one speech request for the whole group').toHaveLength(1);
      const clips = ws.commands('audioClip', 'loadAudioClip');
      expect(clips.map(([hd]) => hd['playerId'])).toEqual(['RINCON_A', 'RINCON_B']);
      expect(clips.map(([, payload]) => (payload as { streamUrl: string }).streamUrl)).toEqual([MINTED, MINTED]);
    });

    // REQ-3 / REQ-10: "A voice that is not a British neural voice is refused." / "Text over 500 characters is
    // refused." The gateway answers 400 { error }: playAudioClip returns that error and sends nothing to the speakers.
    it.each([
      ['REQ-3', 'Invalid voice', { text: 'Hi', voice: 'fr-FR-DeniseNeural' }],
      ['REQ-10', 'Invalid text', { text: 'a'.repeat(501) }],
    ])(
      '%s: a gateway 400 %j is returned as { error } and nothing is sent to the speakers',
      async (_req, error, clip) => {
        const h = makeBridge();
        h.fake.on('POST', '/tts', () => json({ error }, 400));
        const ws = await startReady(h);
        const res = await h.bridge.playAudioClip(clip);
        expect(res, `Expected { error: "${error}" } from the gateway to come back`).toEqual({ error });
        expect(ws.commands('audioClip'), 'Expected no audioClip frame after a refused announcement').toHaveLength(0);
      }
    );

    // REQ-4: "If Azure Speech cannot produce the audio, the announcement still plays in the Google voice." Any
    // failure other than a 400 (503 speech-unavailable, 429, 5xx, 401, no JSON, no network) falls back to today's URL.
    it.each([
      ['a 503 speech-unavailable', () => json({ error: 'speech-unavailable' }, 503)],
      ['a 429', () => json({ error: 'quota' }, 429)],
      ['a 500', () => text('boom', 500)],
      ['a 401', () => json({ error: 'sign-in required' }, 401)],
      ['a 200 that is not JSON', () => text('<html>oops</html>', 200)],
      [
        'a network error',
        (): Response => {
          throw new TypeError('Failed to fetch');
        },
      ],
    ])('REQ-4: %s from /tts falls back to the Google voice and still plays', async (_what, respond) => {
      const h = makeBridge();
      h.fake.on('POST', '/tts', respond);
      const ws = await startReady(h);
      const res = await h.bridge.playAudioClip({ text: 'hello there', volume: 55, playerIds: ['RINCON_C'] });
      expect(h.fake.to('/tts', 'POST'), 'Expected the gateway to have been tried first').not.toHaveLength(0);
      const [[hd, payload]] = ws.commands('audioClip');
      expect(hd['playerId']).toBe('RINCON_C');
      expect(payload, 'Expected the exact Google Translate URL as before').toMatchObject({
        volume: 55,
        streamUrl: GOOGLE('hello%20there'),
      });
      expect(res, 'Expected the announcement to be reported as played, not as an error').toEqual([
        { playerId: 'RINCON_C', result: {} },
      ]);
    });

    // REQ-4: the Google fallback applies to a chosen voice too (Google has one voice).
    it('REQ-4: a failed /tts with a chosen voice still plays the Google URL', async () => {
      const h = makeBridge();
      h.fake.on('POST', '/tts', () => json({ error: 'speech-unavailable' }, 503));
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ text: 'Hi', voice: 'en-GB-RyanNeural', playerIds: ['RINCON_C'] });
      expect(h.fake.to('/tts', 'POST'), 'Expected the gateway to have been tried first').toHaveLength(1);
      expect(ws.commands('audioClip')[0]?.[1]).toMatchObject({ streamUrl: GOOGLE('Hi') });
    });

    // REQ-11: "Playing a sound file by URL works as it does today." A { url } clip is played as given and never
    // goes near the speech service.
    it('REQ-11: a { url } clip plays that URL and makes no /tts request', async () => {
      const h = makeBridge();
      mints(h);
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ url: 'https://example.com/ding.mp3' });
      expect(
        ws.commands('audioClip', 'loadAudioClip')[0]?.[1],
        'Expected the given URL to reach the speakers'
      ).toMatchObject({ streamUrl: 'https://example.com/ding.mp3' });
      expect(h.fake.to('/tts'), 'Expected a plain sound file not to use speech quota').toHaveLength(0);
    });

    // A 200 that carries no usable link is a failure like any other.
    it.each([
      ['no url', {}],
      ['a url that is not https', { url: 'http://gw.test/tts/x.mp3' }],
    ])('REQ-4: a 200 from /tts with %s falls back to the Google voice', async (_what, body) => {
      const h = makeBridge();
      h.fake.on('POST', '/tts', () => json(body));
      const ws = await startReady(h);
      await h.bridge.playAudioClip({ text: 'Hi', playerIds: ['RINCON_C'] });
      expect(ws.commands('audioClip')[0]?.[1]).toMatchObject({ streamUrl: GOOGLE('Hi') });
    });

    // With no token the gateway door answers null without a request; the announcement still plays.
    it('REQ-4: with no token to send, the Google voice plays and /tts is not asked', async () => {
      const h = makeBridge();
      mints(h);
      const ws = await startReady(h);
      h.auth.token = null;
      await h.bridge.playAudioClip({ text: 'Hi', playerIds: ['RINCON_C'] });
      expect(h.fake.to('/tts')).toHaveLength(0);
      expect(ws.commands('audioClip')[0]?.[1]).toMatchObject({ streamUrl: GOOGLE('Hi') });
    });

    // Speech is made last: a clip that would be refused anyway spends no quota.
    it('makes no /tts request for text that fails its other checks', async () => {
      const h = makeBridge();
      mints(h);
      await startReady(h);
      expect(await h.bridge.playAudioClip({ text: 'Hi', volume: 101 })).toEqual({ error: 'Invalid volume' });
      expect(await h.bridge.playAudioClip({ text: 'Hi', playerIds: [] })).toEqual({ error: 'No active group' });
      expect(h.fake.to('/tts')).toHaveLength(0);
    });

    it('validates', async () => {
      const h = makeBridge();
      await startReady(h);
      expect(await h.bridge.playAudioClip({})).toEqual({ error: 'Need text or an https url' });
      expect(await h.bridge.playAudioClip({ url: 'http://x.test/a.mp3' })).toEqual({
        error: 'Need text or an https url',
      });
      expect(await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3', volume: 101 })).toEqual({
        error: 'Invalid volume',
      });
      expect(await h.bridge.playAudioClip({ url: 'https://x.test/a.mp3', playerIds: [] })).toEqual({
        error: 'No active group',
      });
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

  it("after a switch the old group's replayed state is gone and the new group's push is forwarded", async () => {
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
    expect(last(seen)).toBe('RINCON_C:2');
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
    const msgs = vi.fn();
    h.bridge.onWsMessage(msgs);
    await tick();
    msgs.mockClear();
    ws.dispatchEvent(new MessageEvent('message', { data: 'not json' }));
    ws.dispatchEvent(new MessageEvent('message', { data: '"a string"' }));
    expect(msgs).not.toHaveBeenCalled();
  });
});

describe('partial playback messages', () => {
  const FULL = (groupId: string): Frame => [
    { namespace: 'playbackExtended', groupId, type: 'extendedPlaybackStatus' },
    {
      playback: { playbackState: 'PLAYBACK_STATE_PLAYING', positionMillis: 5000 },
      metadata: { currentItem: { track: { name: 'T', durationMillis: 180000 } } },
    },
  ];

  it('does not hand the renderer an empty subscribe response that lands after the status push', async () => {
    const h = makeBridge();
    playSonos();
    // The push arrives before the subscribe response, which is empty
    FakeWebSocket.server = (ws, [header]) => {
      const ns = header['namespace'];
      const reply = (p: unknown) => queueMicrotask(() => ws.receive([{ ...header, success: true }, p]));
      if (header['command'] === 'getHouseholds') return reply({ households: [{ id: 'HH1' }] });
      if (ns === 'devices') {
        reply({});
        return queueMicrotask(() =>
          queueMicrotask(() => ws.receive([{ namespace: 'devices', name: 'devicesStatus' }, { devices: DEVICES }]))
        );
      }
      if (ns === 'playbackExtended') {
        ws.receive(FULL(String(header['groupId'])));
        return reply({});
      }
      reply({});
    };
    const msgs: unknown[] = [];
    h.bridge.onWsMessage((hd, p) => {
      if ((hd as { namespace: string }).namespace === 'playbackExtended') msgs.push(p);
    });
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    FakeWebSocket.last().open();
    await vi.waitFor(() => expect(FakeWebSocket.last().commands('groupVolume', 'subscribe')).toHaveLength(2));
    await tick();
    expect(msgs.length).toBeGreaterThan(0);
    for (const p of msgs) expect(p).toHaveProperty('playback.playbackState');
  });

  it('replays the last full status with later partial messages merged in', async () => {
    const h = makeBridge();
    const ws = await startReady(h);
    ws.receive(FULL('RINCON_A:1'));
    ws.receive([
      { namespace: 'playbackExtended', groupId: 'RINCON_A:1' },
      { playback: { playbackState: 'PLAYBACK_STATE_PAUSED', positionMillis: 9000 } },
    ]);
    ws.receive([{ namespace: 'playbackExtended', groupId: 'RINCON_A:1' }, {}]);
    const got: unknown[] = [];
    h.bridge.onWsMessage((hd, p) => {
      if ((hd as { namespace: string }).namespace === 'playbackExtended') got.push(p);
    });
    await tick();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({
      playback: { playbackState: 'PLAYBACK_STATE_PAUSED', positionMillis: 9000 },
      metadata: { currentItem: { track: { durationMillis: 180000 } } },
    });
  });
});

describe('coming back to the app', () => {
  const visible = (state: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  afterEach(() => visible('visible'));

  it('reconnects at once, resetting the backoff, when the socket is down', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      FakeWebSocket.last().drop();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    const before = FakeWebSocket.instances.length;
    FakeWebSocket.last().drop();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow')); // fires together: one wake
    await vi.advanceTimersByTimeAsync(300);
    expect(FakeWebSocket.instances).toHaveLength(before + 1);
  });

  it('refreshes playback on an open socket, and does nothing while hidden', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.last();
    const n = ws.commands('playbackExtended', 'subscribe').length;
    visible('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(500);
    expect(ws.commands('playbackExtended', 'subscribe')).toHaveLength(n);
    visible('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.commands('playbackExtended', 'subscribe')).toHaveLength(n + 1);
  });

  it('drops a half-open socket that does not answer and connects again', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    playSonos();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(0);
    const count = FakeWebSocket.instances.length;
    FakeWebSocket.server = null; // the phone slept: nothing answers any more
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300 + 5000);
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
  });
});
