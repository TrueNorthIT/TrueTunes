// The live "who queued this" channel: /pubsub/ws through the gateway, mirroring src/pubsub.ts. Fakes only.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWebBridge } from '../index';
import { FakeWebSocket, fakeAuth, json, makeBridge, tick, type FakeAuth, type Harness } from './helpers';

afterEach(() => vi.useRealTimers());

const PROTOCOL = 'json.webpubsub.azure.v1';
const ITEM = {
  eventType: 'track' as const,
  uri: 'x-sonos:track:1',
  trackName: 'Song',
  artist: 'Band',
  serviceId: '72711',
  accountId: '9',
  artistId: 'ar1',
  album: 'Album',
  albumId: 'al1',
  imageUrl: 'https://img.test/a.jpg',
};

const group = (data: unknown, over: Record<string, unknown> = {}) => ({
  type: 'message',
  from: 'group',
  group: 'office',
  data,
  ...over,
});
const queued = (over: Record<string, unknown> = {}) => ({
  type: 'queued',
  eventType: 'track',
  user: 'Sam',
  uri: 'x-sonos:track:9',
  trackName: 'Other',
  artist: 'Someone',
  timestamp: 1234,
  ...over,
});

/** The bridge started, and its live socket created (not yet open). */
async function started(h: Harness): Promise<FakeWebSocket> {
  h.fake.on('POST', '/fn/log-event', () => json({ ok: true }));
  h.bridge.start();
  await vi.waitFor(() => expect(FakeWebSocket.pubsub.length).toBeGreaterThan(0));
  return FakeWebSocket.pubsub[FakeWebSocket.pubsub.length - 1];
}

async function startedOpen(h: Harness): Promise<FakeWebSocket> {
  const ws = await started(h);
  ws.open();
  return ws;
}

/** Receive a raw frame (not necessarily valid JSON). */
const receiveRaw = (ws: FakeWebSocket, data: string) => ws.dispatchEvent(new MessageEvent('message', { data }));

/**
 * The map is pushed to current listeners only by a refresh; a live event updates what a late subscriber is told
 * (and tells the event listeners). `mapNow` is that late subscriber.
 */
function watch(h: Harness) {
  const maps: AttributionMap[] = [];
  const events: AttributionEvent[] = [];
  h.bridge.onAttributionMap((m) => maps.push(m));
  h.bridge.onAttributionEvent((e) => events.push(e));
  const mapNow = async (): Promise<AttributionMap | undefined> => {
    let got: AttributionMap | undefined;
    const off = h.bridge.onAttributionMap((m) => (got = m));
    await tick();
    off();
    return got;
  };
  return { maps, events, mapNow };
}

describe('connecting', () => {
  it('offers the Web PubSub protocol and the bearer token as subprotocols, with the name in the query, never the token', async () => {
    const h = makeBridge();
    const ws = await started(h);
    expect(ws.url).toBe('wss://gw.test/pubsub/ws?username=Test%20User');
    expect(ws.protocols).toEqual([PROTOCOL, 'bearer.tok-1']);
    expect(ws.url).not.toContain('tok-1');
  });

  it('encodes the display name', async () => {
    const h = makeBridge({ storage: { 'tt.displayName.oid-1': 'Zoë & Co/1?' } });
    const ws = await started(h);
    expect(ws.url).toBe(`wss://gw.test/pubsub/ws?username=${encodeURIComponent('Zoë & Co/1?')}`);
  });

  it('derives the relay from the page origin when there is no base', async () => {
    const h = makeBridge({ gatewayBase: '' });
    h.env.socketUrl = undefined;
    const bridge = createWebBridge(h.env);
    h.fake.on('POST', '/fn/log-event', () => json({}));
    bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(1));
    expect(new URL(FakeWebSocket.pubsub[0].url).pathname).toBe('/pubsub/ws');
    bridge.stop();
  });

  it('sends joinGroup when it opens, and nothing before', async () => {
    const h = makeBridge();
    const ws = await started(h);
    expect(ws.pubsubFrames).toEqual([]);
    ws.open();
    expect(ws.pubsubFrames).toEqual([{ type: 'joinGroup', group: 'office' }]);
  });

  it('does not connect without a display name, and connects when one is set', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/profile/lookup', () => new Response('', { status: 404 }));
    h.auth.signedIn = { oid: 'oid-1', name: '', email: 'x@y.z' };
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    await tick();
    expect(FakeWebSocket.pubsub).toHaveLength(0);
    await h.bridge.setDisplayName('Named');
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(1));
    expect(FakeWebSocket.pubsub[0].url).toContain('username=Named');
  });

  it('does not touch the Sonos relay’s sockets', async () => {
    const h = makeBridge();
    await started(h);
    expect(FakeWebSocket.instances.every((s) => s.url.endsWith('/sonos/ws'))).toBe(true);
  });
});

describe('incoming events (the desktop’s rules)', () => {
  it('a queued track fills the map and tells the listeners', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    ws.receive(group(queued()) as never);
    expect((await seen.mapNow())?.['x-sonos:track:9']).toEqual({
      user: 'Sam',
      timestamp: 1234,
      trackName: 'Other',
      artist: 'Someone',
    });
    expect(seen.events).toEqual([queued()]);
  });

  it('a legacy event with no eventType counts as a track', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    const legacy = queued();
    delete (legacy as Record<string, unknown>)['eventType'];
    ws.receive(group(legacy) as never);
    expect((await seen.mapNow())?.['x-sonos:track:9']?.user).toBe('Sam');
    expect(seen.events).toHaveLength(1);
  });

  it('an album event notifies the listeners but does not enter the map', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    ws.receive(group(queued({ eventType: 'album', uri: 'x-sonos:album:1' })) as never);
    expect(seen.events).toHaveLength(1);
    expect((await seen.mapNow())?.['x-sonos:album:1']).toBeUndefined();
  });

  it.each([
    ['not from a group', group(queued(), { from: 'server' })],
    ['another group', group(queued(), { group: 'elsewhere' })],
    ['an ack, not a message', { type: 'ack', ackId: 1, success: true }],
    ['a system frame', { type: 'system', event: 'connected', userId: 'x' }],
    ['no data', group(undefined)],
    ['data that is not an object', group('queued')],
    ['an event that is not queued', group(queued({ type: 'played' }))],
    ['a queued event with no uri', group(queued({ uri: '' }))],
    ['a queued event with no uri field', group({ type: 'queued', user: 'Sam' })],
  ])('ignores %s', async (_name, frame) => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    await tick();
    ws.receive(frame as never);
    expect(seen.events).toEqual([]);
    expect((await seen.mapNow())?.['x-sonos:track:9']).toBeUndefined();
  });

  it('ignores malformed frames and carries on', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    for (const raw of ['not json', '', '{', 'null', '[1,2]', '"x"']) receiveRaw(ws, raw);
    ws.receive(group(queued()) as never);
    expect(seen.events).toHaveLength(1);
  });

  it('ignores frames from a socket that has been replaced', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const first = await startedOpen(h);
    await h.bridge.setDisplayName('Renamed');
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(2));
    first.receive(group(queued()) as never);
    expect(seen.events).toEqual([]);
  });
});

describe('publishing', () => {
  it('broadcasts the event to the office when the socket is open, with the exact frame', async () => {
    const h = makeBridge();
    const ws = await startedOpen(h);
    await h.bridge.publishQueued(ITEM);
    expect(ws.pubsubFrames).toHaveLength(2);
    expect(ws.pubsubFrames[1]).toEqual({
      type: 'sendToGroup',
      group: 'office',
      data: {
        type: 'queued',
        eventType: 'track',
        user: 'Test User',
        uri: 'x-sonos:track:1',
        trackName: 'Song',
        artist: 'Band',
        serviceId: '72711',
        accountId: '9',
        artistId: 'ar1',
        album: 'Album',
        albumId: 'al1',
        imageUrl: 'https://img.test/a.jpg',
        timestamp: expect.any(Number),
      },
      dataType: 'json',
      noEcho: true,
    });
  });

  it('broadcasts the very event it logs, and still does everything it did before', async () => {
    const h = makeBridge();
    const seen = watch(h);
    const ws = await startedOpen(h);
    await h.bridge.publishQueued(ITEM);
    const posts = h.fake.to('/fn/log-event', 'POST');
    expect(posts).toHaveLength(1);
    const sent = (ws.pubsubFrames[1] as { data: unknown }).data;
    expect(sent).toEqual(JSON.parse(String(posts[0].body)));
    expect((await seen.mapNow())?.[ITEM.uri]?.user).toBe('Test User'); // the local map
    expect(seen.events.at(-1)?.uri).toBe(ITEM.uri); // the local event
  });

  it('sends an album as an album, which the map will not take', async () => {
    const h = makeBridge();
    const ws = await startedOpen(h);
    await h.bridge.publishQueued({ ...ITEM, eventType: 'album', uri: 'x-sonos:album:1' });
    expect((ws.pubsubFrames[1] as { data: { eventType: string } }).data.eventType).toBe('album');
  });

  it('sends nothing for an item with no uri', async () => {
    const h = makeBridge();
    const ws = await startedOpen(h);
    await h.bridge.publishQueued({ ...ITEM, uri: '' });
    expect(ws.pubsubFrames).toHaveLength(1);
  });

  it('sends nothing while the socket is still connecting, but still logs the event', async () => {
    const h = makeBridge();
    const ws = await started(h); // not open
    await h.bridge.publishQueued(ITEM);
    expect(ws.pubsubFrames).toEqual([]);
    expect(h.fake.to('/fn/log-event', 'POST')).toHaveLength(1);
  });

  it('sends nothing once the socket has closed, but still logs the event', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.fake.on('POST', '/fn/log-event', () => json({}));
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.pubsub[0];
    ws.open();
    ws.drop();
    await h.bridge.publishQueued(ITEM);
    expect(ws.pubsubFrames).toHaveLength(1); // the joinGroup only
    expect(h.fake.to('/fn/log-event', 'POST')).toHaveLength(1);
  });

  it('sends nothing before the bridge has started', async () => {
    const h = makeBridge();
    h.fake.on('POST', '/fn/log-event', () => json({}));
    await h.bridge.publishQueued(ITEM);
    expect(FakeWebSocket.pubsub).toHaveLength(0);
    expect(h.fake.to('/fn/log-event', 'POST')).toHaveLength(1);
  });

  it('a send that throws does not break publishing', async () => {
    const h = makeBridge();
    const ws = await startedOpen(h);
    ws.send = () => {
      throw new Error('closing');
    };
    await expect(h.bridge.publishQueued(ITEM)).resolves.toBeUndefined();
    expect(h.fake.to('/fn/log-event', 'POST')).toHaveLength(1);
  });
});

describe('reconnecting', () => {
  async function startedWithTimers(auth?: FakeAuth) {
    vi.useFakeTimers();
    const h = makeBridge(auth ? { auth } : {});
    h.fake.on('POST', '/fn/log-event', () => json({}));
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    return h;
  }
  const last = () => FakeWebSocket.pubsub[FakeWebSocket.pubsub.length - 1];

  it('backs off 1 s, 2 s, 4 s ... capped at 60 s', async () => {
    await startedWithTimers();
    let count = 1;
    expect(FakeWebSocket.pubsub).toHaveLength(count);
    for (const delay of [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
      last().drop();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(FakeWebSocket.pubsub).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      count++;
      expect(FakeWebSocket.pubsub).toHaveLength(count);
    }
  });

  it('resets the backoff when a connection opens', async () => {
    await startedWithTimers();
    for (const delay of [1000, 2000, 4000]) {
      last().drop();
      await vi.advanceTimersByTimeAsync(delay);
    }
    last().open();
    last().drop();
    const count = FakeWebSocket.pubsub.length;
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.pubsub).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.pubsub).toHaveLength(count + 1);
  });

  it('joins the group again on every new connection', async () => {
    await startedWithTimers();
    last().open();
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    last().open();
    expect(last().pubsubFrames).toEqual([{ type: 'joinGroup', group: 'office' }]);
  });

  it('asks for a fresh token for every attempt', async () => {
    const auth = fakeAuth({ token: 'one' });
    await startedWithTimers(auth);
    expect(last().protocols).toEqual([PROTOCOL, 'bearer.one']);
    auth.token = 'two';
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().protocols).toEqual([PROTOCOL, 'bearer.two']);
    auth.token = 'three';
    last().drop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(last().protocols).toEqual([PROTOCOL, 'bearer.three']);
    expect(last().url).not.toContain('three');
  });

  it('stops for good when there is no token, and does not signal that the sign-in expired', async () => {
    const auth = fakeAuth();
    const h = await startedWithTimers(auth);
    const expired = vi.fn();
    h.bridge.onAuthExpired(expired);
    expired.mockClear();
    auth.token = null;
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    const count = FakeWebSocket.pubsub.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeWebSocket.pubsub).toHaveLength(count);
    expect(expired).not.toHaveBeenCalled();
  });

  it('never runs two sockets at once', async () => {
    const h = await startedWithTimers();
    h.bridge.start();
    h.bridge.start();
    await h.bridge.retrySonosAuth();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.pubsub).toHaveLength(1);
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(5000);
    const live = FakeWebSocket.pubsub.filter((s) => s.readyState !== 3);
    expect(live.length).toBeLessThanOrEqual(1);
  });

  it('a socket the browser refuses to construct is retried later, not thrown', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    let refuse = true;
    class Refusing extends FakeWebSocket {
      constructor(url: string, protocols?: string | string[]) {
        if (refuse && url.includes('/pubsub/ws')) throw new DOMException('blocked', 'SecurityError');
        super(url, protocols);
      }
    }
    const bridge = createWebBridge({ ...h.env, WebSocket: Refusing as unknown as typeof WebSocket });
    bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.pubsub).toHaveLength(0);
    refuse = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeWebSocket.pubsub).toHaveLength(1);
    bridge.stop();
  });
});

describe('stopping and renaming', () => {
  it('stop() closes the socket and does not reconnect', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.pubsub[0];
    ws.open();
    h.bridge.stop();
    expect(ws.readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeWebSocket.pubsub).toHaveLength(1);
  });

  it('stop() cancels a reconnect that is already waiting', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.pubsub[0].drop();
    h.bridge.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeWebSocket.pubsub).toHaveLength(1);
  });

  it('stop() while the token is being fetched opens nothing', async () => {
    const auth = fakeAuth();
    let release: (t: string) => void = () => {};
    const h = makeBridge({ auth });
    // the bridge's own gateway calls get a token at once; only the live socket's has to wait
    let calls = 0;
    const original = auth.idToken;
    auth.idToken = (o) => (++calls >= 4 ? new Promise<string | null>((r) => (release = r)) : original(o));
    h.fake.on('POST', '/fn/log-event', () => json({}));
    h.bridge.start();
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(4));
    h.bridge.stop();
    release('late');
    await tick();
    expect(FakeWebSocket.pubsub).toHaveLength(0);
  });

  it('signing out closes it', async () => {
    const h = makeBridge();
    const ws = await startedOpen(h);
    await h.bridge.entraSignOut();
    expect(ws.readyState).toBe(3);
  });

  it('can be started again after a stop', async () => {
    const h = makeBridge();
    const first = await startedOpen(h);
    h.bridge.stop();
    expect(first.readyState).toBe(3);
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(2));
  });

  it('setDisplayName reconnects under the new name, closing the old socket first', async () => {
    const h = makeBridge();
    const first = await startedOpen(h);
    expect(await h.bridge.setDisplayName('New Name')).toBeNull();
    expect(first.readyState).toBe(3);
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(2));
    const second = FakeWebSocket.pubsub[1];
    expect(second.url).toBe('wss://gw.test/pubsub/ws?username=New%20Name');
    expect(second.protocols).toEqual([PROTOCOL, 'bearer.tok-1']);
  });

  it('a name that is taken does not reconnect', async () => {
    const h = makeBridge();
    h.fake.on('POST', '/fn/profile/claim', () => new Response('', { status: 409 }));
    await startedOpen(h);
    expect(await h.bridge.setDisplayName('Taken')).toEqual({ error: 'taken' });
    await tick();
    expect(FakeWebSocket.pubsub).toHaveLength(1);
  });

  it('renameUser reconnects under the new name when it succeeds', async () => {
    const h = makeBridge();
    h.fake.on('POST', '/fn/profile/rename', () => json({ ok: true }));
    const first = await startedOpen(h);
    expect(await h.bridge.renameUser('Test User', 'Better Name')).toEqual({ ok: true });
    expect(first.readyState).toBe(3);
    await vi.waitFor(() => expect(FakeWebSocket.pubsub).toHaveLength(2));
    expect(FakeWebSocket.pubsub[1].url).toBe('wss://gw.test/pubsub/ws?username=Better%20Name');
  });

  it('renameUser that fails leaves the connection alone', async () => {
    const h = makeBridge();
    h.fake.on('POST', '/fn/profile/rename', () => new Response('', { status: 409 }));
    const first = await startedOpen(h);
    expect(await h.bridge.renameUser('Test User', 'Taken')).toEqual({ error: 'taken' });
    await tick();
    expect(first.readyState).toBe(1);
    expect(FakeWebSocket.pubsub).toHaveLength(1);
  });

  it('a rename while a reconnect is waiting reconnects once, not twice', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.pubsub[0].drop();
    await h.bridge.setDisplayName('Newer');
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.pubsub).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeWebSocket.pubsub).toHaveLength(2);
  });
});

describe('when the live channel cannot connect', () => {
  it('attribution still works: publishQueued and refreshAttribution behave as they did', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.fake.on('POST', '/fn/log-event', () => json({ ok: true }));
    const seen = watch(h);
    h.bridge.start();
    await vi.advanceTimersByTimeAsync(0);
    FakeWebSocket.pubsub[0].drop(); // the gateway refused the upgrade, or Web PubSub is down

    await h.bridge.publishQueued(ITEM);
    expect(h.fake.to('/fn/log-event', 'POST')).toHaveLength(1);
    expect(seen.events.at(-1)?.uri).toBe(ITEM.uri);
    expect((await seen.mapNow())?.[ITEM.uri]?.user).toBe('Test User');

    const before = h.fake.to('/fn/attribution').length;
    h.fake.on('GET', '/fn/attribution', () =>
      json({ 'x-sonos:track:7': { user: 'Pat', timestamp: 5, trackName: 'T', artist: 'A' } })
    );
    await h.bridge.refreshAttribution();
    expect(h.fake.to('/fn/attribution').length).toBe(before + 1);
    expect(seen.maps.at(-1)?.['x-sonos:track:7']?.user).toBe('Pat');
  });

  it('a failure in the live channel does not stop the start-up load or the Sonos relay', async () => {
    const h = makeBridge();
    const seen = watch(h);
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(seen.maps.length).toBeGreaterThan(0));
    expect(h.fake.to('/fn/attribution').length).toBeGreaterThan(0);
  });
});
