import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfficePubSub } from '../pubsub';
import type { AttributionEvent, PubSubSocket } from '../pubsub';

class FakeSocket implements PubSubSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(
    public url: string,
    public protocol: string
  ) {}
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const FN = 'https://fn.test';
const res = (body: string, status = 200) => new Response(body, { status });

let sockets: FakeSocket[];
let fetchMock: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.fn> & ((...a: unknown[]) => void);
let ps: OfficePubSub;
let attribution: string;
let negotiateStatus: number;
let logStatuses: number[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  sockets = [];
  attribution = '{}';
  negotiateStatus = 200;
  logStatuses = [];
  log = vi.fn() as typeof log;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/api/connect')) {
      return negotiateStatus >= 400
        ? res('', negotiateStatus)
        : res(JSON.stringify({ webPubSubUrl: `wss://wps.test/${sockets.length}` }));
    }
    if (url.endsWith('/api/attribution')) return res(attribution, attribution === '' ? 404 : 200);
    if (url.endsWith('/api/log-event')) return res('', logStatuses.shift() ?? 200);
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
  });
  ps = new OfficePubSub({
    createSocket: (u, p) => {
      const s = new FakeSocket(u, p);
      sockets.push(s);
      return s;
    },
    fetchImpl: fetchMock as unknown as typeof fetch,
    log,
  });
});

afterEach(() => {
  ps.disconnect();
  vi.useRealTimers();
});

async function connected(map = '{}') {
  attribution = map;
  const initial = await ps.connect('Rich', `${FN}/`);
  sockets[0].open();
  return initial;
}

const queued = (over: Partial<AttributionEvent> = {}): AttributionEvent => ({
  type: 'queued',
  eventType: 'track',
  user: 'Bob',
  uri: 'u1',
  trackName: 'T',
  artist: 'A',
  timestamp: 5,
  ...over,
});
const groupMsg = (data: unknown) => ({ type: 'message', from: 'group', group: 'office', data });

describe('OfficePubSub connect', () => {
  it('negotiates, loads attribution, opens the socket with the subprotocol and joins the hub', async () => {
    const initial = await connected(JSON.stringify({ u0: { user: 'X', timestamp: 1, trackName: 't', artist: 'a' } }));
    expect(fetchMock.mock.calls[0]).toEqual([`${FN}/api/connect?username=Rich`, { method: 'POST' }]);
    expect(Object.keys(initial)).toEqual(['u0']);
    expect(ps.getMap()).toEqual(initial);
    expect(sockets[0].url).toBe('wss://wps.test/0');
    expect(sockets[0].protocol).toBe('json.webpubsub.azure.v1');
    expect(ps.isConnected()).toBe(true);
    expect(sockets[0].sent).toEqual([{ type: 'joinGroup', group: 'office' }]);
  });

  it('treats a 404 on attribution as empty and keeps the map', async () => {
    const initial = await connected('');
    expect(initial).toEqual({});
    expect(ps.getMap()).toEqual({});
  });

  it('rejects when negotiation fails (>= 400)', async () => {
    negotiateStatus = 500;
    await expect(ps.connect('Rich', FN)).rejects.toThrow('500');
    expect(sockets).toHaveLength(0);
  });

  it('refresh reloads the map', async () => {
    await connected();
    attribution = JSON.stringify({ z: { user: 'Z', timestamp: 2, trackName: 't', artist: 'a' } });
    expect(Object.keys(await ps.refresh())).toEqual(['z']);
  });
});

describe('incoming events', () => {
  it('track (and legacy no-eventType) events update the map and notify', async () => {
    await connected();
    const cb = vi.fn();
    ps.onEvent(cb);
    sockets[0].push(groupMsg(queued()));
    sockets[0].push(groupMsg(queued({ eventType: undefined, uri: 'legacy', user: 'Old' })));
    expect(ps.getMap().u1).toEqual({ user: 'Bob', timestamp: 5, trackName: 'T', artist: 'A' });
    expect(ps.getMap().legacy.user).toBe('Old');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('album events notify but do not touch the map', async () => {
    await connected();
    const cb = vi.fn();
    ps.onEvent(cb);
    sockets[0].push(groupMsg(queued({ eventType: 'album', uri: 'album1' })));
    expect(ps.getMap()).toEqual({});
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('ignores other groups, non-group senders, missing uri and malformed payloads', async () => {
    await connected();
    const cb = vi.fn();
    ps.onEvent(cb);
    sockets[0].push({ ...groupMsg(queued()), group: 'other' });
    sockets[0].push({ ...groupMsg(queued()), from: 'server' });
    sockets[0].push(groupMsg(queued({ uri: '' })));
    sockets[0].push({ type: 'ack' });
    sockets[0].onmessage?.({ data: 'not json' });
    expect(cb).not.toHaveBeenCalled();
    expect(ps.getMap()).toEqual({});
  });
});

describe('publishQueued', () => {
  it('ignores items without a uri', async () => {
    await connected();
    await ps.publishQueued({ eventType: 'track', uri: '', trackName: 't', artist: 'a' });
    expect(sockets[0].sent).toHaveLength(1); // just joinGroup
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('log-event'))).toBe(false);
  });

  it('updates the map for tracks, broadcasts with noEcho and logs to Cosmos', async () => {
    await connected();
    await ps.publishQueued({ eventType: 'track', uri: 'u9', trackName: 'T', artist: 'A', album: 'Al' });
    expect(ps.getMap().u9).toEqual({ user: 'Rich', timestamp: 1_000_000, trackName: 'T', artist: 'A' });
    const frame = sockets[0].sent[1] as {
      type: string;
      group: string;
      dataType: string;
      noEcho: boolean;
      data: AttributionEvent;
    };
    expect(frame).toMatchObject({ type: 'sendToGroup', group: 'office', dataType: 'json', noEcho: true });
    expect(frame.data).toMatchObject({ user: 'Rich', uri: 'u9', eventType: 'track', album: 'Al' });
    const logCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/api/log-event'))!;
    expect(logCall[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse((logCall[1] as RequestInit).body as string).uri).toBe('u9');
  });

  it('does not add a badge for album events', async () => {
    await connected();
    await ps.publishQueued({ eventType: 'album', uri: 'alb', trackName: 'T', artist: 'A' });
    expect(ps.getMap()).toEqual({});
    expect(sockets[0].sent).toHaveLength(2);
  });

  it('does not send over a socket that is not open', async () => {
    await connected();
    sockets[0].readyState = 3;
    await ps.publishQueued({ eventType: 'track', uri: 'u', trackName: 'T', artist: 'A' });
    expect(sockets[0].sent).toHaveLength(1);
  });

  it('retries the Cosmos log 3 times with 1s then 2s delays, then warns', async () => {
    await connected();
    logStatuses = [500, 500, 500];
    const logCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/log-event')).length;
    await ps.publishQueued({ eventType: 'track', uri: 'u', trackName: 'T', artist: 'A' });
    await vi.advanceTimersByTimeAsync(0);
    expect(logCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(logCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(logCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(logCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(logCalls()).toBe(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(logCalls()).toBe(3);
    expect(log).toHaveBeenCalledWith('[pubsub] Cosmos log failed after retries:', expect.stringContaining('500'));
  });

  it('stops retrying after a success', async () => {
    await connected();
    logStatuses = [500, 200];
    await ps.publishQueued({ eventType: 'track', uri: 'u', trackName: 'T', artist: 'A' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/log-event'))).toHaveLength(2);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('reconnect', () => {
  const connectCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/connect')).length;

  it('backs off 1s, 2s, 4s while failing and resets after open', async () => {
    await connected();
    negotiateStatus = 500;
    sockets[0].drop();
    expect(ps.isConnected()).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(connectCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1); // 1s: attempt fails
    expect(connectCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(connectCalls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); // +2s
    expect(connectCalls()).toBe(3);
    await vi.advanceTimersByTimeAsync(3999);
    expect(connectCalls()).toBe(3);
    negotiateStatus = 200;
    await vi.advanceTimersByTimeAsync(1); // +4s: succeeds, new socket
    expect(connectCalls()).toBe(4);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(ps.isConnected()).toBe(true);

    // backoff reset: next drop waits 1s again
    sockets[1].drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(connectCalls()).toBe(5);
  });

  it('caps the delay at 60s', async () => {
    await connected();
    negotiateStatus = 500;
    sockets[0].drop();
    // delays: 1,2,4,8,16,32,60,60 ...
    let total = 0;
    for (const d of [1, 2, 4, 8, 16, 32]) total += d * 1000;
    await vi.advanceTimersByTimeAsync(total);
    const before = connectCalls();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(connectCalls()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(connectCalls()).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectCalls()).toBe(before + 2);
  });

  it('does not reconnect after disconnect(), and disconnect cancels a pending reconnect', async () => {
    await connected();
    sockets[0].drop();
    ps.disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connectCalls()).toBe(1);
    expect(ps.isConnected()).toBe(false);

    const cb = vi.fn();
    await ps.connect('Rich', FN);
    ps.onEvent(cb);
    ps.disconnect(); // clears listeners
    expect(sockets[1].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets).toHaveLength(2);
  });

  it('logs socket errors', async () => {
    await connected();
    sockets[0].onerror?.({ message: 'kaput' });
    expect(log).toHaveBeenCalledWith('[pubsub] WS error:', 'kaput');
  });
});
