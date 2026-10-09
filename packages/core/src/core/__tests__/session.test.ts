import { describe, expect, it, vi } from 'vitest';
import { SessionManager, validateSessionToken } from '../session';
import type { TokenStore } from '../session';

function makeStore(initial: string | null = null) {
  let value = initial;
  const store: TokenStore = {
    load: vi.fn(async () => value),
    save: vi.fn(async (t: string) => {
      value = t;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
  };
  return { store, get: () => value };
}

function makeSession(initial: string | null, valid: (t: string) => boolean) {
  const s = makeStore(initial);
  const validate = vi.fn(async (t: string) => valid(t));
  const session = new SessionManager({ store: s.store, validate });
  const ready = vi.fn();
  const expired = vi.fn();
  session.on('ready', ready);
  session.on('expired', expired);
  return { session, ...s, validate, ready, expired };
}

describe('validateSessionToken', () => {
  it('sends the cookie and UA to /api/mfe and returns res.ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await validateSessionToken('T', fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://play.sonos.com/api/mfe');
    expect((init.headers as Record<string, string>)['Cookie']).toBe('__Secure-next-auth.session-token=T');
  });

  it('is false for a non-2xx response and for a network error', async () => {
    expect(
      await validateSessionToken('T', (async () => new Response('', { status: 401 })) as unknown as typeof fetch)
    ).toBe(false);
    expect(
      await validateSessionToken('T', (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch)
    ).toBe(false);
  });
});

describe('SessionManager.restore', () => {
  it('needs login when nothing is stored, without validating', async () => {
    const c = makeSession(null, () => true);
    expect(await c.session.restore()).toBe('needs-login');
    expect(c.validate).not.toHaveBeenCalled();
    expect(c.ready).not.toHaveBeenCalled();
  });

  it('adopts a valid stored token and fires ready once', async () => {
    const c = makeSession('GOOD', () => true);
    expect(await c.session.restore()).toBe('authed');
    expect(c.session.getToken()).toBe('GOOD');
    expect(c.session.isAuthed).toBe(true);
    expect(c.ready).toHaveBeenCalledTimes(1);
  });

  it('clears an invalid stored token and asks for login', async () => {
    const c = makeSession('STALE', () => false);
    expect(await c.session.restore()).toBe('needs-login');
    expect(c.session.getToken()).toBeNull();
    expect(c.get()).toBeNull();
    expect(c.ready).not.toHaveBeenCalled();
  });

  it('treats a storage read failure as needing login', async () => {
    const s = makeStore();
    (s.store.load as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('keystore locked'));
    const session = new SessionManager({ store: s.store, validate: async () => true });
    expect(await session.restore()).toBe('needs-login');
  });
});

describe('SessionManager.submit', () => {
  it('validates, persists and fires ready for a fresh token', async () => {
    const c = makeSession(null, (t) => t === 'NEW');
    expect(await c.session.submit('NEW')).toBe(true);
    expect(c.get()).toBe('NEW');
    expect(c.ready).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid token without persisting or firing', async () => {
    const c = makeSession(null, () => false);
    expect(await c.session.submit('BAD')).toBe(false);
    expect(c.get()).toBeNull();
    expect(c.session.getToken()).toBeNull();
    expect(c.ready).not.toHaveBeenCalled();
  });

  it('does not re-fire ready or re-validate when the same token is submitted again', async () => {
    const c = makeSession(null, () => true);
    await c.session.submit('T');
    await c.session.submit('T');
    expect(c.ready).toHaveBeenCalledTimes(1);
    expect(c.validate).toHaveBeenCalledTimes(1);
  });

  it('adopts a rotated token without firing ready a second time', async () => {
    const c = makeSession(null, () => true);
    await c.session.submit('A');
    await c.session.submit('B');
    expect(c.session.getToken()).toBe('B');
    expect(c.get()).toBe('B');
    expect(c.ready).toHaveBeenCalledTimes(1);
  });
});

describe('SessionManager.expire', () => {
  it('drops the token, clears storage and fires expired', async () => {
    const c = makeSession('GOOD', () => true);
    await c.session.restore();
    await c.session.expire();
    expect(c.session.getToken()).toBeNull();
    expect(c.session.isAuthed).toBe(false);
    expect(c.get()).toBeNull();
    expect(c.expired).toHaveBeenCalledTimes(1);
  });

  it('is idempotent, so concurrent 401s only fire once', async () => {
    const c = makeSession('GOOD', () => true);
    await c.session.restore();
    await Promise.all([c.session.expire(), c.session.expire()]);
    expect(c.expired).toHaveBeenCalledTimes(1);
  });

  it('allows ready to fire again after re-login', async () => {
    const c = makeSession('GOOD', () => true);
    await c.session.restore();
    await c.session.expire();
    await c.session.submit('AGAIN');
    expect(c.ready).toHaveBeenCalledTimes(2);
  });

  it('does nothing when never authed', async () => {
    const c = makeSession(null, () => true);
    await c.session.expire();
    expect(c.expired).not.toHaveBeenCalled();
  });

  it('unsubscribes listeners', async () => {
    const c = makeSession(null, () => true);
    const extra = vi.fn();
    const off = c.session.on('ready', extra);
    off();
    await c.session.submit('T');
    expect(extra).not.toHaveBeenCalled();
  });
});
