import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import { createMsalAuth, type MsalClient } from '../auth';
import { createWebBridge } from '../index';
import { FakeWebSocket, fakeAuth, json, makeBridge, startReady, tick, text } from './helpers';

afterEach(() => vi.useRealTimers());

describe('blocked storage', () => {
  it('keeps the chosen group across a reconnect', async () => {
    const h = makeBridge({ blockedStorage: true });
    const ws = await startReady(h);
    expect(await h.bridge.setGroup('RINCON_C:2')).toEqual({ ok: true });
    vi.useFakeTimers();
    ws.drop();
    await vi.advanceTimersByTimeAsync(1000);
    FakeWebSocket.last().open();
    await vi.advanceTimersByTimeAsync(50);
    expect(await h.bridge.getActiveGroup()).toBe('RINCON_C');
    await h.bridge.play();
    expect(FakeWebSocket.last().commands('playback', 'play')[0][0]['groupId']).toBe('RINCON_C:2');
  });
});

describe('resync after stop', () => {
  it('does not bring the relay back; start does', async () => {
    const h = makeBridge();
    await startReady(h);
    h.bridge.stop();
    await h.bridge.resync();
    await tick();
    expect(FakeWebSocket.instances).toHaveLength(1);
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
  });
});

describe('gateway', () => {
  it('sends every request with cache no-store', async () => {
    const h = makeBridge();
    const seen: Array<RequestInit | undefined> = [];
    const inner = h.fake.fetch;
    h.env.fetch = (i, init) => {
      seen.push(init);
      return inner(i, init);
    };
    h.fake.on('GET', '/sonos/api/mfe', () => json({}));
    await createWebBridge(h.env).fetch({ operationId: 'getMfe' });
    expect(seen[0]?.cache).toBe('no-store');
  });

  it('tells the app when there is no token to send', async () => {
    const h = makeBridge({ auth: fakeAuth({ token: null }) });
    const expired = vi.fn();
    h.bridge.onAuthExpired(expired);
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ error: 'No Entra token — please sign in first' });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('tells the app when the forced refresh after a 401 yields no token', async () => {
    const h = makeBridge({ auth: fakeAuth({ token: 'old', refreshed: null }) });
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 401));
    const expired = vi.fn();
    h.bridge.onAuthExpired(expired);
    expect((await h.bridge.fetch({ operationId: 'getMfe' })).error).toMatch(/^401/);
    expect(expired).toHaveBeenCalled();
  });
});

describe('identity per account', () => {
  it("a second user on the same browser never inherits the first one's name", async () => {
    const a = makeBridge();
    a.fake.on('GET', '/fn/profile/lookup', () => json({ displayName: 'Alex' }));
    const done = vi.fn();
    a.bridge.onEntraReady(done);
    a.bridge.start();
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(a.storage.getItem('tt.displayName.oid-1')).toBe('Alex');

    a.fake.on('GET', '/fn/profile/lookup', () => text('', 404));
    const claims: unknown[] = [];
    a.fake.on('POST', '/fn/profile/claim', (c) => {
      claims.push(c.json());
      return json({});
    });
    const b = createWebBridge({
      ...a.env,
      auth: fakeAuth({ signedIn: { oid: 'oid-2', name: 'Bea', email: 'b@x.test' } }),
    });
    const doneB = vi.fn();
    b.onEntraReady(doneB);
    expect(await b.getDisplayName()).toBeNull();
    b.start();
    await vi.waitFor(() => expect(doneB).toHaveBeenCalled());
    expect(await b.getDisplayName()).toBe('Bea');
    expect(claims).toEqual([{ oid: 'oid-2', displayName: 'Bea' }]);
    b.stop();
    a.bridge.stop();
  });
});

describe('msal accounts and single-flight', () => {
  const acc = (username: string): AccountInfo => ({
    homeAccountId: username,
    environment: 'e',
    tenantId: 't',
    localAccountId: username,
    username,
    idTokenClaims: { oid: `oid-${username}` },
  });
  const CONFIG = { clientId: 'c', tenantId: 't', redirectUri: 'https://app.test/' };
  const result = (over = {}) => ({
    idToken: 'id',
    accessToken: 'at',
    idTokenClaims: { exp: Date.now() / 1000 + 3600 },
    ...over,
  });

  function client(over: Partial<MsalClient> = {}) {
    const c = {
      handleRedirectPromise: vi.fn(() => Promise.resolve(null)),
      getAllAccounts: vi.fn(() => [acc('first'), acc('second')]),
      getActiveAccount: vi.fn((): AccountInfo | null => null),
      setActiveAccount: vi.fn(),
      acquireTokenSilent: vi.fn(() => Promise.resolve(result())),
      loginRedirect: vi.fn(() => Promise.resolve()),
      clearCache: vi.fn(() => Promise.resolve()),
      ...over,
    } satisfies MsalClient;
    return c;
  }

  it('prefers the active account over the first cached one', async () => {
    const c = client({ getActiveAccount: () => acc('second') });
    expect((await createMsalAuth(CONFIG, () => Promise.resolve(c)).init())?.email).toBe('second');
  });

  it('falls back to the first account when none is active', async () => {
    const c = client();
    expect((await createMsalAuth(CONFIG, () => Promise.resolve(c)).init())?.email).toBe('first');
  });

  it('makes the account a redirect just signed in the active one', async () => {
    const c = client({ handleRedirectPromise: () => Promise.resolve({ account: acc('third') }) });
    expect((await createMsalAuth(CONFIG, () => Promise.resolve(c)).init())?.email).toBe('third');
    expect(c.setActiveAccount).toHaveBeenCalledWith(expect.objectContaining({ username: 'third' }));
  });

  it('signOut clears the active account', async () => {
    const c = client();
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(c));
    await auth.init();
    await auth.signOut();
    expect(c.setActiveAccount).toHaveBeenLastCalledWith(null);
  });

  it('ten concurrent callers near expiry share one forced refresh', async () => {
    const soon = Date.now() / 1000 + 60;
    const acquire = vi.fn<MsalClient['acquireTokenSilent']>(async (req) => {
      if (req.forceRefresh) {
        await new Promise((r) => setTimeout(r, 10));
        return result({ idToken: 'fresh' });
      }
      return result({ idTokenClaims: { exp: soon } });
    });
    const c = client({ acquireTokenSilent: acquire });
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(c));
    await auth.init();
    const tokens = await Promise.all(Array.from({ length: 10 }, () => auth.idToken()));
    expect(tokens.every((t) => t === 'fresh')).toBe(true);
    expect(acquire.mock.calls.filter(([r]) => r.forceRefresh)).toHaveLength(1);
  });
});
