import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WsSession } from '../wsSession';
import type { SocketLike, WsBroadcast, WsConfig } from '../wsSession';

type Frame = [Record<string, unknown>, unknown];

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Frame[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onSend: ((frame: Frame) => void) | null = null;
  closeCalls: Array<number | undefined> = [];

  constructor(
    public url: string,
    public protocols: string[],
    public headers: Record<string, string>,
  ) {}

  send(data: string) {
    const frame = JSON.parse(data) as Frame;
    this.sent.push(frame);
    this.onSend?.(frame);
  }
  close(code?: number) {
    this.closeCalls.push(code);
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1005 });
  }
  // ── test helpers ──
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  push(header: Record<string, unknown>, payload: unknown = {}) {
    this.onmessage?.({ data: JSON.stringify([header, payload]) });
  }
  commands() {
    return this.sent.map(([h]) => `${h['namespace']}:${h['command']}`);
  }
}

const TICKET = '11111111-2222-3333-4444-555555555555';

const DEVICES = {
  devices: [
    { info: { id: 'RINCON_A', name: 'Office' }, groupId: 'RINCON_A:1', isCoordinator: true },
    { info: { id: 'RINCON_A2', name: 'Office 2' }, groupId: 'RINCON_A:1', isCoordinator: false },
    { info: { id: 'RINCON_B', name: 'Bathroom' }, groupId: 'RINCON_B:2', isCoordinator: true },
  ],
};

/** Answers every command like Sonos does, including the devices push after subscribe. */
function autoRespond(sock: FakeSocket, opts: { skipDevicesPush?: boolean } = {}) {
  sock.onSend = ([h]) => {
    const reply = (payload: unknown) => sock.push({ corrId: h['corrId'], namespace: h['namespace'] }, payload);
    if (h['command'] === 'getHouseholds') return reply({ households: [{ id: 'HH1' }] });
    if (h['namespace'] === 'devices' && h['command'] === 'subscribe') {
      reply({});
      if (!opts.skipDevicesPush) sock.push({ namespace: 'devices', name: 'devicesStatus' }, DEVICES);
      return;
    }
    if (h['namespace'] === 'playbackExtended') return reply({ playback: { playbackState: `INITIAL_${h['groupId']}` } });
    if (h['namespace'] === 'groupVolume') return reply({ volume: h['groupId'] === 'RINCON_A:1' ? 15 : 9 });
    reply({});
  };
}

function setup(configOverride: Partial<WsConfig> = {}, fetchImpl?: typeof fetch) {
  const config: WsConfig = { ...configOverride };
  const sockets: FakeSocket[] = [];
  const broadcasts: WsBroadcast[] = [];
  const onConfigChanged = vi.fn();
  const onPlaybackState = vi.fn();
  const onEvent = vi.fn();
  const onException = vi.fn();
  const onStatus = vi.fn();
  const discover = vi.fn(async () => {});
  const mfeFetch = vi.fn(async () => new Response(JSON.stringify({ app: { auth: { wsTicket: TICKET } } }), { status: 200 }));

  const session = new WsSession({
    config,
    getSessionToken: () => 'TOKEN',
    createSocket: (url, protocols, headers) => {
      const s = new FakeSocket(url, protocols, headers);
      sockets.push(s);
      return s;
    },
    discoverServiceCredentials: discover,
    broadcast: (m) => broadcasts.push(m),
    onConfigChanged,
    onPlaybackState,
    onEvent,
    onException,
    onStatus,
    fetchImpl: fetchImpl ?? (mfeFetch as unknown as typeof fetch),
  });
  return { session, config, sockets, broadcasts, onConfigChanged, onPlaybackState, onEvent, onException, onStatus, discover, mfeFetch };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
};

/** connect(), open the socket and let the bootstrap finish. */
async function connected(ctx: ReturnType<typeof setup>, opts?: { skipDevicesPush?: boolean }) {
  await ctx.session.connect();
  const sock = ctx.sockets[ctx.sockets.length - 1];
  autoRespond(sock, opts);
  sock.open();
  await settle();
  return sock;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('connect', () => {
  it('fetches /api/mfe with the session cookie and opens the socket with ticket, subprotocol and Origin', async () => {
    const ctx = setup();
    await ctx.session.connect();
    const [url, init] = ctx.mfeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://play.sonos.com/api/mfe');
    expect((init.headers as Record<string, string>)['Cookie']).toBe('__Secure-next-auth.session-token=TOKEN');

    const sock = ctx.sockets[0];
    expect(sock.url).toBe(`wss://api.ws.sonos.com/websocket?ticket=${TICKET}`);
    expect(sock.protocols).toEqual(['v1.api.smartspeaker.audio']);
    expect(sock.headers['Origin']).toBe('https://play.sonos.com');
    expect(sock.headers['User-Agent']).toContain('Chrome/');
  });

  it('does not open a second socket while one is connecting or open', async () => {
    const ctx = setup();
    await ctx.session.connect();
    await ctx.session.connect();
    expect(ctx.sockets).toHaveLength(1);
  });

  it('schedules a reconnect and reports when the ticket fetch fails', async () => {
    const ctx = setup({}, vi.fn(async () => new Response('no', { status: 401 })) as unknown as typeof fetch);
    await ctx.session.connect();
    expect(ctx.sockets).toHaveLength(0);
    expect(ctx.onException).toHaveBeenCalledWith(expect.any(Error), { phase: 'ws_ticket_fetch' });
  });

  it('emits ws_ticket_missing when the MFE response has no ticket', async () => {
    const ctx = setup({}, vi.fn(async () => new Response('{"nothing":true}', { status: 200 })) as unknown as typeof fetch);
    await ctx.session.connect();
    expect(ctx.onEvent).toHaveBeenCalledWith('ws_ticket_missing');
    expect(ctx.sockets).toHaveLength(0);
  });
});

describe('bootstrap', () => {
  it('subscribes in the desktop order and broadcasts ready, groups and the active group state', async () => {
    const ctx = setup();
    const sock = await connected(ctx);

    expect(sock.commands().slice(0, 2)).toEqual(['households:getHouseholds', 'devices:subscribe']);
    const rest = sock.commands().slice(2);
    expect(rest.filter((c) => c === 'playbackExtended:subscribe')).toHaveLength(2);
    expect(rest.filter((c) => c === 'groupVolume:subscribe')).toHaveLength(2);
    expect(rest.filter((c) => c === 'playerVolume:subscribe')).toHaveLength(3);
    expect(rest.filter((c) => c === 'hardwareStatus:subscribe')).toHaveLength(3);
    // devices subscribe carries the discovered household
    expect(sock.sent[1][0]['householdId']).toBe('HH1');

    expect(ctx.discover).toHaveBeenCalledTimes(1);
    expect(ctx.config.householdId).toBe('HH1');

    // Command responses are forwarded as ws:message too (as on desktop), so only check ordering.
    const lifecycle = ctx.broadcasts.map((b) => b.channel).filter((c) => c !== 'ws:message');
    expect(lifecycle).toEqual(['ws:ready', 'ws:groups']);
    const groupsMsg = ctx.broadcasts.find((b) => b.channel === 'ws:groups') as Extract<WsBroadcast, { channel: 'ws:groups' }>;
    expect(groupsMsg.groups.map((g) => g.name)).toEqual(['Office', 'Bathroom']);
    expect(groupsMsg.groups[0].playerIds).toEqual(['RINCON_A', 'RINCON_A2']);

    // Initial state for the active group only, re-broadcast as ordinary pushes.
    const seeded = ctx.broadcasts.filter((b) => b.channel === 'ws:message') as Array<Extract<WsBroadcast, { channel: 'ws:message' }>>;
    const pb = seeded.filter((m) => m.header['namespace'] === 'playbackExtended' && m.payload && JSON.stringify(m.payload).includes('INITIAL_RINCON_A:1'));
    expect(pb.length).toBeGreaterThan(0);
    expect(seeded.some((m) => m.header['namespace'] === 'groupVolume' && (m.payload as { volume: number }).volume === 15)).toBe(true);
    expect(ctx.onEvent).toHaveBeenCalledWith('ws_connected', expect.objectContaining({ groupCount: 2 }));
  });

  it('defaults to the first group and persists it as the preference', async () => {
    const ctx = setup();
    await connected(ctx);
    expect(ctx.config.groupId).toBe('RINCON_A:1');
    expect(ctx.config.queueId).toBe('RINCON_A');
    expect(ctx.config.preferredCoordinatorId).toBe('RINCON_A');
    expect(ctx.onConfigChanged).toHaveBeenCalledTimes(1);
  });

  it('restores the saved group by stable coordinatorId and does not re-persist', async () => {
    const ctx = setup({ preferredCoordinatorId: 'RINCON_B' });
    await connected(ctx);
    expect(ctx.config.groupId).toBe('RINCON_B:2');
    expect(ctx.config.queueId).toBe('RINCON_B');
    expect(ctx.onConfigChanged).not.toHaveBeenCalled();
  });

  it('falls back to the first group when the saved coordinator has left the household', async () => {
    const ctx = setup({ preferredCoordinatorId: 'RINCON_GONE' });
    await connected(ctx);
    expect(ctx.config.groupId).toBe('RINCON_A:1');
    expect(ctx.config.preferredCoordinatorId).toBe('RINCON_A');
  });

  it('closes the socket and reports when bootstrap fails (devices push never arrives)', async () => {
    const ctx = setup();
    const sock = await connected(ctx, { skipDevicesPush: true });
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(ctx.onException).toHaveBeenCalledWith(expect.any(Error), { phase: 'ws_bootstrap' });
    expect(sock.closeCalls).toHaveLength(1);
  });
});

describe('message routing', () => {
  it('forwards only the active group for playbackExtended and groupVolume', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.broadcasts.length = 0;

    sock.push({ namespace: 'playbackExtended', groupId: 'RINCON_B:2' }, { playback: { playbackState: 'PLAYBACK_STATE_PLAYING' } });
    sock.push({ namespace: 'groupVolume', groupId: 'RINCON_B:2' }, { volume: 1 });
    expect(ctx.broadcasts).toHaveLength(0);

    sock.push({ namespace: 'playbackExtended', groupId: 'RINCON_A:1' }, { playback: { playbackState: 'PLAYBACK_STATE_PAUSED' } });
    sock.push({ namespace: 'groupVolume', groupId: 'RINCON_A:1' }, { volume: 22 });
    expect(ctx.broadcasts.map((b) => b.channel)).toEqual(['ws:message', 'ws:message']);
  });

  it('forwards other namespaces regardless of group', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.broadcasts.length = 0;
    sock.push({ namespace: 'playerVolume', groupId: 'RINCON_B:2' }, {});
    expect(ctx.broadcasts).toHaveLength(1);
  });

  it('reports play state from playbackExtended pushes', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    sock.push({ namespace: 'playbackExtended', groupId: 'RINCON_A:1' }, { playback: { playbackState: 'PLAYBACK_STATE_PLAYING' } });
    expect(ctx.onPlaybackState).toHaveBeenLastCalledWith(true);
    sock.push({ namespace: 'playbackExtended', groupId: 'RINCON_A:1' }, { playback: { playbackState: 'PLAYBACK_STATE_BUFFERING' } });
    expect(ctx.onPlaybackState).toHaveBeenLastCalledWith(false);
  });

  it('ignores malformed frames', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.broadcasts.length = 0;
    sock.onmessage?.({ data: 'not json' });
    expect(ctx.broadcasts).toHaveLength(0);
  });
});

describe('send', () => {
  it('resolves with the payload of the frame carrying the same corrId', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    sock.onSend = ([h]) => sock.push({ corrId: h['corrId'] }, { echoed: h['command'] });
    await expect(ctx.session.send({ namespace: 'x', command: 'ping' }, {})).resolves.toEqual({ echoed: 'ping' });
  });

  it('rejects when the socket is not open', async () => {
    const ctx = setup();
    await expect(ctx.session.send({ namespace: 'x', command: 'y' }, {})).rejects.toThrow('WebSocket not open');
  });

  it('times out after 10s and emits ws_timeout', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    sock.onSend = null; // never answer
    const p = ctx.session.send({ namespace: 'playback', command: 'play' }, {});
    const assertion = expect(p).rejects.toThrow(/WS timeout/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(ctx.onEvent).toHaveBeenCalledWith('ws_timeout', { namespace: 'playback', command: 'play' });
  });
});

describe('reconnect', () => {
  it('backs off 1s, 2s, 4s and resets after a successful open', async () => {
    const ctx = setup();
    await ctx.session.connect();
    const first = ctx.sockets[0];
    first.close(1006);
    expect(ctx.sockets).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(ctx.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.sockets).toHaveLength(2);

    ctx.sockets[1].close(1006); // second failure -> 2s
    await vi.advanceTimersByTimeAsync(1999);
    expect(ctx.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.sockets).toHaveLength(3);

    // A successful open resets the backoff to 1s.
    autoRespond(ctx.sockets[2]);
    ctx.sockets[2].open();
    await settle();
    ctx.sockets[2].close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.sockets).toHaveLength(4);
  });

  it('emits ws_closed for abnormal closes only', async () => {
    const ctx = setup();
    await ctx.session.connect();
    ctx.sockets[0].close(1006);
    expect(ctx.onEvent).toHaveBeenCalledWith('ws_closed', { code: 1006 });
    ctx.onEvent.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    ctx.sockets[1].close(1000);
    expect(ctx.onEvent).not.toHaveBeenCalledWith('ws_closed', expect.anything());
  });

  it('stop() closes the socket and prevents any reconnect', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.session.stop();
    expect(sock.closeCalls).toEqual([1000]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.sockets).toHaveLength(1);
  });

  it('a late close from a replaced socket does not clobber the live one', async () => {
    const ctx = setup();
    await ctx.session.connect();
    ctx.sockets[0].close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    const live = ctx.sockets[1];
    autoRespond(live);
    live.open();
    await settle();
    expect(ctx.session.isOpen).toBe(true);

    ctx.sockets[0].onclose?.({ code: 1006 }); // stale event from the first socket
    expect(ctx.session.isOpen).toBe(true);
  });
});

describe('commands', () => {
  it('returns WS not connected when closed', async () => {
    const ctx = setup();
    expect(ctx.session.play()).toEqual({ error: 'WS not connected' });
    expect(ctx.session.skipNext()).toEqual({ error: 'WS not connected' });
  });

  it.each([
    ['play', 'playback', 'play', { allowTvPauseRestore: true, deviceFeedback: 'NONE' }, []],
    ['pause', 'playback', 'pause', { allowTvPauseRestore: true, deviceFeedback: 'NONE' }, []],
    ['skipNext', 'playback', 'skipToNextTrack', {}, []],
    ['skipPrev', 'playback', 'skipBack', {}, []],
    ['skipToTrack', 'playback', 'skipToTrack', { trackNumber: 4 }, [4]],
    ['seek', 'playback', 'seek', { positionMillis: 12000 }, [12000]],
    ['setPlayModes', 'playback', 'setPlayModes', { playModes: { shuffle: true } }, [{ shuffle: true }]],
    ['loadContent', 'playback', 'loadContent', { a: 1 }, [{ a: 1 }]],
    ['setGroupVolume', 'groupVolume', 'setVolume', { volume: 30 }, [30]],
  ] as const)('%s sends %s:%s to the active group', async (method, namespace, command, payload, args) => {
    const ctx = setup();
    const sock = await connected(ctx);
    sock.sent.length = 0;
    await (ctx.session[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    expect(sock.sent).toHaveLength(1);
    const [header, body] = sock.sent[0];
    expect(header).toMatchObject({ namespace, command, groupId: 'RINCON_A:1' });
    expect(body).toEqual(payload);
  });

  it('validates volume', async () => {
    const ctx = setup();
    await connected(ctx);
    expect(ctx.session.setGroupVolume(101)).toEqual({ error: 'Invalid volume' });
    expect(ctx.session.setGroupVolume(-1)).toEqual({ error: 'Invalid volume' });
    expect(ctx.session.setGroupVolume(NaN as never)).toEqual({ error: 'Invalid volume' });
  });

  it('setGroup switches group, persists the preference and re-subscribes playback and volume', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.onConfigChanged.mockClear();
    sock.sent.length = 0;

    expect(ctx.session.setGroup('RINCON_B:2')).toEqual({ ok: true });
    expect(ctx.config.groupId).toBe('RINCON_B:2');
    expect(ctx.config.queueId).toBe('RINCON_B');
    expect(ctx.config.preferredCoordinatorId).toBe('RINCON_B');
    expect(ctx.onConfigChanged).toHaveBeenCalledTimes(1);
    expect(sock.sent.map(([h]) => `${h['namespace']}:${h['command']}:${h['groupId']}`)).toEqual([
      'playbackExtended:subscribe:RINCON_B:2',
      'groupVolume:subscribe:RINCON_B:2',
    ]);
    expect(ctx.session.getActiveGroup()).toBe('RINCON_B');
  });

  it('setGroup rejects unknown groups without changing anything', async () => {
    const ctx = setup();
    await connected(ctx);
    expect(ctx.session.setGroup('nope')).toEqual({ error: 'Unknown group: nope' });
    expect(ctx.config.groupId).toBe('RINCON_A:1');
  });
});

describe('resync', () => {
  it('reconnects when the socket is down', async () => {
    const ctx = setup();
    ctx.session.resync();
    await settle();
    expect(ctx.sockets).toHaveLength(1);
  });

  it('re-broadcasts ready/groups and re-subscribes playback when up', async () => {
    const ctx = setup();
    const sock = await connected(ctx);
    ctx.broadcasts.length = 0;
    sock.sent.length = 0;
    ctx.session.resync();
    expect(ctx.broadcasts.map((b) => b.channel).filter((c) => c !== 'ws:message')).toEqual(['ws:ready', 'ws:groups']);
    expect(sock.commands()).toEqual(['playbackExtended:subscribe']);
  });
});

describe('whenHousehold', () => {
  it('resolves immediately when the household is already known', async () => {
    const ctx = setup({ householdId: 'HH0' });
    await expect(ctx.session.whenHousehold()).resolves.toBeUndefined();
  });

  it('resolves as soon as the bootstrap discovers the household', async () => {
    const ctx = setup();
    let done = false;
    void ctx.session.whenHousehold().then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    await connected(ctx);
    expect(done).toBe(true);
    expect(ctx.config.householdId).toBe('HH1');
  });

  it('gives up after the timeout without rejecting', async () => {
    const ctx = setup();
    const p = ctx.session.whenHousehold(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toBeUndefined();
    expect(ctx.config.householdId).toBeUndefined();
  });
});

describe('connection status', () => {
  it('starts disconnected and reports connecting, then connected once bootstrap completes', async () => {
    const ctx = setup();
    expect(ctx.session.connectionStatus).toBe('disconnected');
    await ctx.session.connect();
    expect(ctx.onStatus.mock.calls.map((c) => c[0])).toEqual(['connecting']);
    autoRespond(ctx.sockets[0]);
    ctx.sockets[0].open(); // socket open alone is not 'connected' - bootstrap still has to finish
    expect(ctx.session.connectionStatus).toBe('connecting');
    await settle();
    expect(ctx.session.connectionStatus).toBe('connected');
    expect(ctx.onStatus.mock.calls.map((c) => c[0])).toEqual(['connecting', 'connected']);
  });

  it('goes disconnected on an unexpected close, then connecting -> connected on the reconnect', async () => {
    const ctx = setup();
    const first = await connected(ctx);
    ctx.onStatus.mockClear();
    first.close(1006);
    expect(ctx.onStatus.mock.calls.map((c) => c[0])).toEqual(['disconnected']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.onStatus.mock.calls.map((c) => c[0])).toEqual(['disconnected', 'connecting']);
    autoRespond(ctx.sockets[1]);
    ctx.sockets[1].open();
    await settle();
    expect(ctx.session.connectionStatus).toBe('connected');
  });

  it('is disconnected after a failed ticket fetch, and after stop()', async () => {
    const failing = setup({}, vi.fn(async () => new Response('no', { status: 401 })) as unknown as typeof fetch);
    await failing.session.connect();
    expect(failing.session.connectionStatus).toBe('disconnected');

    const ctx = setup();
    await connected(ctx);
    ctx.session.stop();
    expect(ctx.session.connectionStatus).toBe('disconnected');
  });

  it('only notifies on a real change', async () => {
    const ctx = setup();
    await connected(ctx);
    ctx.onStatus.mockClear();
    ctx.session.stop();
    ctx.session.stop();
    expect(ctx.onStatus).toHaveBeenCalledTimes(1);
  });
});
