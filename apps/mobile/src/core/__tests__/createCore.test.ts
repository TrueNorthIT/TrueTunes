import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCore } from '../createCore';
import type { CorePlatform, EntraProvider } from '../createCore';
import type { SocketLike } from '../../sonos/wsSession';

type Frame = [Record<string, unknown>, unknown];

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Frame[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message?: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  closeCalls: Array<number | undefined> = [];
  constructor(public url: string) {}
  send(data: string) {
    const frame = JSON.parse(data) as Frame;
    this.sent.push(frame);
    const [h] = frame;
    const reply = (p: unknown) => this.push({ corrId: h['corrId'], namespace: h['namespace'] }, p);
    if (h['command'] === 'getHouseholds') return reply({ households: [{ id: 'HH1' }] });
    if (h['namespace'] === 'devices' && h['command'] === 'subscribe') {
      reply({});
      this.push({ namespace: 'devices', name: 'devicesStatus' }, DEVICES);
      return;
    }
    reply({});
  }
  close(code?: number) {
    this.closeCalls.push(code);
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1005 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  push(header: Record<string, unknown>, payload: unknown = {}) {
    this.onmessage?.({ data: JSON.stringify([header, payload]) });
  }
}

const DEVICES = {
  devices: [
    { info: { id: 'RINCON_A', name: 'Office' }, groupId: 'RINCON_A:1', isCoordinator: true },
    { info: { id: 'RINCON_B', name: 'Bathroom' }, groupId: 'RINCON_B:2', isCoordinator: true },
  ],
};

const TICKET = '11111111-2222-3333-4444-555555555555';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const settle = async () => {
  for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(0);
};

function build(opts: { storedToken?: string; tokenValid?: boolean; kv?: Record<string, string>; entra?: EntraProvider; version?: string } = {}) {
  const kv = new Map<string, string>(Object.entries(opts.kv ?? {}));
  let token: string | null = opts.storedToken ?? null;
  const sonosSockets: FakeSocket[] = [];
  const calls: string[] = [];
  let mfeStatus = 200;
  let contentStatus = 200;

  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.endsWith('/api/mfe')) {
      return mfeStatus === 200 && (opts.tokenValid ?? true) ? json({ app: { wsTicket: TICKET } }) : new Response('no', { status: 401 });
    }
    if (url.includes('/integrations/registrations')) return json([{ 'service-id': '72711', 'account-id': '13' }]);
    if (url.includes('/queues/')) return contentStatus === 401 ? new Response('', { status: 401 }) : json({ resources: [] });
    if (url.includes('/api/profile/lookup')) return json({ displayName: 'Rich K' });
    if (url.includes('/api/connect')) return json({ webPubSubUrl: 'wss://pubsub.example/client' });
    if (url.includes('/api/attribution')) return json({ 'sonos:track:1': { user: 'Sam', timestamp: 1, trackName: 'T', artist: 'A' } });
    return json({});
  });

  const platform: CorePlatform = {
    tokenStore: {
      load: async () => token,
      save: async (t) => {
        token = t;
      },
      clear: async () => {
        token = null;
      },
    },
    kvStore: {
      get: async (k) => kv.get(k) ?? null,
      set: async (k, v) => void kv.set(k, v),
      remove: async (k) => void kv.delete(k),
    },
    createSonosSocket: (url) => {
      const s = new FakeSocket(url);
      sonosSockets.push(s);
      return s;
    },
    createPubSubSocket: (url) => new FakeSocket(url),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    appVersion: opts.version ?? '1.0.0',
    openExternal: async () => {},
    env: { pubsubFunctionUrl: 'https://fn.example' },
    entra: opts.entra ?? null,
  };

  const core = createCore(platform);
  return {
    core,
    kv,
    sonosSockets,
    calls,
    fetchImpl,
    getToken: () => token,
    setMfe: (s: number) => (mfeStatus = s),
    setContent: (s: number) => (contentStatus = s),
  };
}

/** start() then bring the socket up and let bootstrap finish. */
async function boot(t: ReturnType<typeof build>) {
  const result = await t.core.start();
  await settle();
  const sock = t.sonosSockets[t.sonosSockets.length - 1];
  if (sock) {
    sock.open();
    await settle();
  }
  return { result, sock };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('start', () => {
  it('needs login with no stored session and opens no socket', async () => {
    const t = build();
    const { result } = await boot(t);
    expect(result).toBe('needs-login');
    expect(t.sonosSockets).toHaveLength(0);
    expect(await t.core.bridge.getEntraUser()).toBeNull();
  });

  it('restores a valid stored session, then connects and bootstraps', async () => {
    const t = build({ storedToken: 'GOOD' });
    const ready = vi.fn();
    t.core.bridge.onAuthReady(ready);
    const groups = vi.fn();
    t.core.bridge.onWsGroups(groups);

    const { result, sock } = await boot(t);
    expect(result).toBe('authed');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(sock).toBeDefined();
    expect(groups).toHaveBeenCalledTimes(1);
    expect((groups.mock.calls[0][0] as Array<{ name: string }>).map((g) => g.name)).toEqual(['Office', 'Bathroom']);
    expect(await t.core.bridge.getActiveGroup()).toBe('RINCON_A');
  });

  it('discards a stale stored session', async () => {
    const t = build({ storedToken: 'STALE', tokenValid: false });
    const { result } = await boot(t);
    expect(result).toBe('needs-login');
    expect(t.getToken()).toBeNull();
    expect(t.sonosSockets).toHaveLength(0);
  });

  it('flags a new version once, and remembers it', async () => {
    const first = build({ version: '2.0.0', kv: { config: JSON.stringify({ lastSeenVersion: '1.0.0' }) } });
    await first.core.start();
    expect(await first.core.bridge.isNewVersion()).toBe(true);

    const second = build({ version: '2.0.0', kv: Object.fromEntries(first.kv) });
    await second.core.start();
    expect(await second.core.bridge.isNewVersion()).toBe(false);
  });
});

describe('login', () => {
  it('submitSonosToken validates, persists and brings the session up', async () => {
    const t = build();
    await boot(t);
    const ready = vi.fn();
    t.core.bridge.onAuthReady(ready);

    expect(await t.core.submitSonosToken('FRESH')).toBe(true);
    await settle();
    t.sonosSockets[0].open();
    await settle();

    expect(t.getToken()).toBe('FRESH');
    expect(ready).toHaveBeenCalledTimes(1);
    expect(t.sonosSockets).toHaveLength(1);
  });

  it('rejects a token Sonos does not accept', async () => {
    const t = build({ tokenValid: false });
    await boot(t);
    expect(await t.core.submitSonosToken('BAD')).toBe(false);
    expect(t.getToken()).toBeNull();
  });

  it('late auth subscribers still learn the session is ready', async () => {
    const t = build({ storedToken: 'GOOD' });
    await boot(t);
    const late = vi.fn();
    t.core.bridge.onAuthReady(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('session expiry', () => {
  it('a 401 tears down the session: expired event, token cleared, socket closed, no stale ready replay', async () => {
    const t = build({ storedToken: 'GOOD' });
    const { sock } = await boot(t);
    const expired = vi.fn();
    t.core.bridge.onAuthExpired(expired);

    t.setContent(401);
    const res = await t.core.bridge.fetch({ operationId: 'getQueueResources' });
    await settle();

    expect(res.error).toContain('401');
    expect(expired).toHaveBeenCalledTimes(1);
    expect(t.getToken()).toBeNull();
    expect(sock!.closeCalls).toContain(1000);

    const lateReady = vi.fn();
    t.core.bridge.onAuthReady(lateReady);
    expect(lateReady).not.toHaveBeenCalled();

    // and it does not try to reconnect a socket for a dead session
    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.sonosSockets).toHaveLength(1);
  });
});

describe('bridge', () => {
  it('play/pause/skip go to the active group over the socket', async () => {
    const t = build({ storedToken: 'GOOD' });
    const { sock } = await boot(t);
    sock!.sent.length = 0;
    await t.core.bridge.play();
    await t.core.bridge.skipNext();
    expect(sock!.sent.map(([h]) => `${h['namespace']}:${h['command']}:${h['groupId']}`)).toEqual([
      'playback:play:RINCON_A:1',
      'playback:skipToNextTrack:RINCON_A:1',
    ]);
  });

  it('setGroup switches group and persists the preference', async () => {
    const t = build({ storedToken: 'GOOD' });
    await boot(t);
    expect(await t.core.bridge.setGroup('RINCON_B:2')).toEqual({ ok: true });
    await settle();
    expect(JSON.parse(t.kv.get('config')!).preferredCoordinatorId).toBe('RINCON_B');
    expect(await t.core.bridge.getActiveGroup()).toBe('RINCON_B');
  });

  it('queue calls use the Sonos API through the shared client', async () => {
    const t = build({ storedToken: 'GOOD' });
    await boot(t);
    await t.core.bridge.removeFromQueue([1, 2]);
    expect(t.calls.some((c) => c.startsWith('DELETE') && c.includes('/queues/RINCON_A/resources?items=1%2C2'))).toBe(true);
  });

  it('publishQueued surfaces the local user attribution event immediately', async () => {
    const t = build({ storedToken: 'GOOD', kv: { config: JSON.stringify({ displayName: 'Rich' }) } });
    await boot(t);
    const events: Array<{ user: string; trackName: string }> = [];
    t.core.bridge.onAttributionEvent((e) => events.push(e));
    await t.core.bridge.publishQueued({ eventType: 'track', uri: 'sonos:track:9', trackName: 'Puss n Boots', artist: 'Adam Ant' });
    expect(events).toEqual([expect.objectContaining({ user: 'Rich', trackName: 'Puss n Boots' })]);
  });

  it('delivers the initial attribution map to late subscribers', async () => {
    const t = build({ storedToken: 'GOOD', kv: { config: JSON.stringify({ displayName: 'Rich' }) } });
    await boot(t);
    const map = vi.fn();
    t.core.bridge.onAttributionMap(map);
    expect(map).toHaveBeenCalledWith(expect.objectContaining({ 'sonos:track:1': expect.anything() }));
  });

  it('desktop-only features are inert on mobile', async () => {
    const t = build();
    expect(await t.core.bridge.isWindowMaximized()).toBe(false);
    await expect(t.core.bridge.minimizeWindow()).resolves.toBeUndefined();
    await expect(t.core.bridge.installUpdate()).resolves.toBeUndefined();
    expect(await t.core.bridge.fetchImage()).toEqual({ error: expect.stringContaining('not supported') });
    expect(() => t.core.bridge.onUpdateDownloaded(() => {})()).not.toThrow();
  });
});

describe('entra', () => {
  function fakeEntra(user = { oid: 'oid-1', name: 'Rich Kelsey', email: 'r@x.co' }) {
    return {
      acquireTokenSilent: vi.fn(async () => user),
      acquireTokenInteractive: vi.fn(async () => user),
      acquireGraphToken: vi.fn(async () => null),
      signOut: vi.fn(async () => {}),
    } satisfies EntraProvider;
  }

  it('signs in silently after Sonos auth, resolves the display name, claims it and announces the user', async () => {
    const entra = fakeEntra();
    const t = build({ storedToken: 'GOOD', entra });
    const onEntra = vi.fn();
    t.core.bridge.onEntraReady(onEntra);
    await boot(t);

    expect(entra.acquireTokenInteractive).not.toHaveBeenCalled();
    expect(onEntra).toHaveBeenCalledWith(expect.objectContaining({ oid: 'oid-1' }));
    // lookupProfileByOid answered "Rich K", which wins over the Entra name
    expect(await t.core.bridge.getDisplayName()).toBe('Rich K');
    expect(t.calls.some((c) => c.startsWith('POST') && c.includes('/api/profile/claim'))).toBe(true);
    expect(JSON.parse(t.kv.get('config')!)).toMatchObject({ entraOid: 'oid-1', displayName: 'Rich K' });
  });

  it('falls back to interactive sign-in when there is no cached account', async () => {
    const entra = fakeEntra();
    entra.acquireTokenSilent.mockResolvedValue(null as never);
    const t = build({ storedToken: 'GOOD', entra });
    await boot(t);
    expect(entra.acquireTokenInteractive).toHaveBeenCalledTimes(1);
  });

  it('a failed Entra sign-in does not block the app', async () => {
    const entra = fakeEntra();
    entra.acquireTokenSilent.mockRejectedValue(new Error('AADSTS50011'));
    const t = build({ storedToken: 'GOOD', entra });
    const ready = vi.fn();
    t.core.bridge.onAuthReady(ready);
    await boot(t);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(t.sonosSockets).toHaveLength(1);
  });

  it('sign-out clears the Entra identity and display name', async () => {
    const entra = fakeEntra();
    const t = build({ storedToken: 'GOOD', entra });
    await boot(t);
    await t.core.bridge.entraSignOut();
    expect(entra.signOut).toHaveBeenCalled();
    expect(await t.core.bridge.getEntraUser()).toBeNull();
    expect(await t.core.bridge.getDisplayName()).toBeNull();
  });

  it('re-login forces the account picker', async () => {
    const entra = fakeEntra();
    const t = build({ storedToken: 'GOOD', entra });
    await boot(t);
    await t.core.bridge.entraReLogin();
    expect(entra.acquireTokenInteractive).toHaveBeenCalledWith('select_account');
  });

  it('runs fine with no Entra provider at all', async () => {
    const t = build({ storedToken: 'GOOD' });
    await boot(t);
    expect(await t.core.bridge.getEntraUser()).toBeNull();
  });
});

describe('onForeground', () => {
  it('reconnects the Sonos socket when the app returns after it was dropped', async () => {
    const t = build({ storedToken: 'GOOD' });
    const { sock } = await boot(t);
    sock!.readyState = 3; // Android killed it in the background; no close event delivered
    t.sonosSockets[0].onclose = null;
    t.core.onForeground();
    await settle();
    expect(t.sonosSockets.length).toBeGreaterThanOrEqual(2);
  });

  it('does nothing when not signed in', async () => {
    const t = build();
    await boot(t);
    t.core.onForeground();
    await settle();
    expect(t.sonosSockets).toHaveLength(0);
  });
});
