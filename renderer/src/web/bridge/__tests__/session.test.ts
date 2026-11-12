import { describe, it, expect, vi, afterEach } from 'vitest';
import { FakeWebSocket, USER, fakeAuth, json, makeBridge, startReady, tick, text } from './helpers';

afterEach(() => vi.useRealTimers());

describe('start and the auth state', () => {
  it('claims the name, checks the gateway, then announces auth and opens the relay', async () => {
    const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
    const authed = vi.fn();
    h.bridge.onAuthReady(authed);
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    expect(authed).toHaveBeenCalledTimes(1);
    const paths = h.fake.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths.slice(0, 3)).toEqual(['POST /fn/profile/claim', 'GET /sonos/api/mfe', 'GET /fn/attribution']);
  });

  it('fires auth failed, not ready, when the gateway refuses, and opens no relay', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 502));
    const authed = vi.fn();
    const failed = vi.fn();
    h.bridge.onAuthReady(authed);
    h.bridge.onAuthFailed(failed);
    h.bridge.start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    await tick();
    expect(authed).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('fires auth failed when the gateway is unreachable', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => Promise.reject(new TypeError('offline')));
    const failed = vi.fn();
    h.bridge.onAuthFailed(failed);
    h.bridge.start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalled());
  });

  it('retrySonosAuth tries again and, on success, clears the failure and starts the relay', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 502));
    const failed = vi.fn();
    h.bridge.onAuthFailed(failed);
    h.bridge.start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    await tick();

    h.fake.on('GET', '/sonos/api/mfe', () => json({}));
    const authed = vi.fn();
    h.bridge.onAuthReady(authed);
    await h.bridge.retrySonosAuth();
    expect(authed).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // a subscriber arriving now is not told about the old failure
    const late = vi.fn();
    h.bridge.onAuthFailed(late);
    await tick();
    expect(late).not.toHaveBeenCalled();
  });

  it('retrySonosAuth keeps failing quietly: it resolves and fires failed again', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 502));
    h.bridge.start();
    await vi.waitFor(() => expect(h.fake.to('/sonos/api/mfe')).toHaveLength(1));
    await tick();
    const failed = vi.fn();
    h.bridge.onAuthFailed(failed);
    await tick();
    failed.mockClear();
    await expect(h.bridge.retrySonosAuth()).resolves.toBeUndefined();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('late subscribers hear ready and failed as they stand', async () => {
    const h = makeBridge();
    await startReady(h);
    const authed = vi.fn();
    const failed = vi.fn();
    h.bridge.onAuthReady(authed);
    h.bridge.onAuthFailed(failed);
    await tick();
    expect(authed).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });

  it('auth expired un-readies the state for late subscribers', async () => {
    const h = makeBridge();
    await startReady(h);
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 401));
    await h.bridge.fetch({ operationId: 'getMfe' });
    const authed = vi.fn();
    h.bridge.onAuthReady(authed);
    await tick();
    expect(authed).not.toHaveBeenCalled();
  });

  it('start is safe to call again once it has succeeded and does not repeat the work', async () => {
    const h = makeBridge();
    await startReady(h);
    const calls = h.fake.calls.length;
    h.bridge.start();
    h.bridge.start();
    await tick();
    expect(h.fake.calls.length).toBe(calls);
  });

  it('start after stop reconnects', async () => {
    const h = makeBridge();
    await startReady(h);
    h.bridge.stop();
    h.bridge.start();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
  });
});

describe('identity', () => {
  it('uses the stored name without a lookup, claims it, and announces the Entra user', async () => {
    const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
    const user = vi.fn();
    h.bridge.onEntraReady(user);
    h.bridge.start();
    await vi.waitFor(() => expect(user).toHaveBeenCalledWith(USER));
    expect(h.fake.to('/fn/profile/lookup')).toHaveLength(0);
    const [claim] = h.fake.to('/fn/profile/claim', 'POST');
    expect(claim.json()).toEqual({ oid: 'oid-1', displayName: 'Joe' });
    expect(claim.headers['authorization']).toBe('Bearer tok-1');
    expect(await h.bridge.getDisplayName()).toBe('Joe');
  });

  it('otherwise looks the profile up by oid', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/profile/lookup', () => json({ displayName: 'Existing Name' }));
    const user = vi.fn();
    h.bridge.onEntraReady(user);
    h.bridge.start();
    await vi.waitFor(() => expect(user).toHaveBeenCalled());
    expect(h.fake.to('/fn/profile/lookup')[0].query.get('oid')).toBe('oid-1');
    expect(await h.bridge.getDisplayName()).toBe('Existing Name');
    expect(h.storage.getItem('tt.displayName')).toBe('Existing Name');
    expect(h.fake.to('/fn/profile/claim')[0].json()).toEqual({ oid: 'oid-1', displayName: 'Existing Name' });
  });

  it.each([
    ['404', () => text('', 404)],
    ['a server error', () => text('', 500)],
    ['a network failure', () => Promise.reject(new Error('x'))],
    ['a profile with no name', () => json({})],
  ])('falls back to the Entra name on %s', async (_label, respond) => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/profile/lookup', respond);
    const user = vi.fn();
    h.bridge.onEntraReady(user);
    h.bridge.start();
    await vi.waitFor(() => expect(user).toHaveBeenCalled());
    expect(await h.bridge.getDisplayName()).toBe('Test User');
  });

  it('carries on when the claim fails', async () => {
    const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
    h.fake.on('POST', '/fn/profile/claim', () => Promise.reject(new Error('x')));
    const user = vi.fn();
    h.bridge.onEntraReady(user);
    h.bridge.start();
    await vi.waitFor(() => expect(user).toHaveBeenCalled());
  });

  it('a late onEntraReady subscriber is told, later', async () => {
    const h = makeBridge();
    await startReady(h);
    const user = vi.fn();
    h.bridge.onEntraReady(user);
    expect(user).not.toHaveBeenCalled();
    await tick();
    expect(user).toHaveBeenCalledWith(USER);
  });

  it('getEntraUser is the signed-in user, or null', async () => {
    const h = makeBridge();
    expect(await h.bridge.getEntraUser()).toEqual(USER);
    h.auth.signedIn = null;
    expect(await h.bridge.getEntraUser()).toBeNull();
  });

  it('getDisplayName is null before there is one', async () => {
    expect(await makeBridge().bridge.getDisplayName()).toBeNull();
  });

  describe('setDisplayName', () => {
    it('claims the name and stores it', async () => {
      const h = makeBridge();
      expect(await h.bridge.setDisplayName('Newname')).toBeNull();
      expect(h.fake.to('/fn/profile/claim')[0].json()).toEqual({ oid: 'oid-1', displayName: 'Newname' });
      expect(await h.bridge.getDisplayName()).toBe('Newname');
      expect(h.storage.getItem('tt.displayName')).toBe('Newname');
    });

    it('refuses a name another account owns', async () => {
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      h.fake.on('POST', '/fn/profile/claim', () => text('', 409));
      expect(await h.bridge.setDisplayName('Taken')).toEqual({ error: 'taken' });
      expect(await h.bridge.getDisplayName()).toBe('Joe');
    });

    it('lets a claim failure through, as the desktop does', async () => {
      const h = makeBridge();
      h.fake.on('POST', '/fn/profile/claim', () => Promise.reject(new Error('x')));
      expect(await h.bridge.setDisplayName('Name')).toBeNull();
    });

    it('an empty name skips the claim', async () => {
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      expect(await h.bridge.setDisplayName('')).toBeNull();
      expect(h.fake.calls).toHaveLength(0);
      expect(await h.bridge.getDisplayName()).toBe('');
    });
  });

  it('entraSignOut forgets the name and signs out of the browser cache', async () => {
    const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
    await h.bridge.entraSignOut();
    expect(h.auth.signOutCalls).toBe(1);
    expect(h.storage.getItem('tt.displayName')).toBeNull();
    expect(await h.bridge.getDisplayName()).toBeNull();
  });

  it('entraReLogin asks for the account picker', async () => {
    const h = makeBridge();
    await h.bridge.entraReLogin();
    expect(h.auth.signInCalls).toEqual([{ selectAccount: true }]);
  });

  it('entraReLogin swallows a failure like the desktop', async () => {
    const auth = fakeAuth();
    auth.signIn = () => Promise.reject(new Error('blocked'));
    await expect(makeBridge({ auth }).bridge.entraReLogin()).resolves.toBeUndefined();
  });
});

describe('attribution', () => {
  it('loads the map at start and replays it to a late subscriber', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/attribution', () =>
      json({ 'spotify:1': { user: 'Ann', timestamp: 5, trackName: 'T', artist: 'A' } })
    );
    const early = vi.fn();
    h.bridge.onAttributionMap(early);
    await startReady(h);
    const map = { 'spotify:1': { user: 'Ann', timestamp: 5, trackName: 'T', artist: 'A' } };
    await vi.waitFor(() => expect(early).toHaveBeenCalledWith(map));
    const late = vi.fn();
    h.bridge.onAttributionMap(late);
    expect(late).not.toHaveBeenCalled();
    await tick();
    expect(late).toHaveBeenCalledWith(map);
  });

  it('an unavailable or empty answer is an empty map', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/attribution', () => text('', 404));
    const cb = vi.fn();
    h.bridge.onAttributionMap(cb);
    await startReady(h);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({}));
    h.fake.on('GET', '/fn/attribution', () => text('', 500));
    cb.mockClear();
    await h.bridge.refreshAttribution();
    expect(cb).toHaveBeenCalledWith({});
    h.fake.on('GET', '/fn/attribution', () => Promise.reject(new Error('x')));
    await h.bridge.refreshAttribution();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('refreshAttribution reloads and emits', async () => {
    const h = makeBridge();
    await startReady(h);
    const cb = vi.fn();
    h.bridge.onAttributionMap(cb);
    await tick();
    cb.mockClear();
    h.fake.on('GET', '/fn/attribution', () => json({ a: { user: 'B', timestamp: 1, trackName: 't', artist: 'r' } }));
    await h.bridge.refreshAttribution();
    expect(cb).toHaveBeenCalledWith({ a: { user: 'B', timestamp: 1, trackName: 't', artist: 'r' } });
  });

  describe('publishQueued', () => {
    const item = {
      eventType: 'track' as const,
      uri: 'spotify:9',
      trackName: 'Song',
      artist: 'Band',
      serviceId: 's',
      accountId: 'a',
      artistId: 'ar',
      album: 'Alb',
      albumId: 'al',
      imageUrl: 'https://img.test/x.jpg',
    };

    it('tells local listeners, logs the event, and updates the map late subscribers see', async () => {
      vi.useFakeTimers({ now: 1_700_000_000_000 });
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      h.fake.on('POST', '/fn/log-event', () => json({}));
      const events = vi.fn();
      h.bridge.onAttributionEvent(events);
      await h.bridge.publishQueued(item);
      expect(events).toHaveBeenCalledWith({
        type: 'queued',
        eventType: 'track',
        user: 'Joe',
        uri: 'spotify:9',
        trackName: 'Song',
        artist: 'Band',
        artistId: 'ar',
        album: 'Alb',
        albumId: 'al',
        imageUrl: 'https://img.test/x.jpg',
        timestamp: 1_700_000_000_000,
      });
      await vi.advanceTimersByTimeAsync(0);
      const [post] = h.fake.to('/fn/log-event', 'POST');
      expect(post.json()).toEqual({
        type: 'queued',
        eventType: 'track',
        user: 'Joe',
        uri: 'spotify:9',
        trackName: 'Song',
        artist: 'Band',
        serviceId: 's',
        accountId: 'a',
        artistId: 'ar',
        album: 'Alb',
        albumId: 'al',
        imageUrl: 'https://img.test/x.jpg',
        timestamp: 1_700_000_000_000,
      });
      expect(post.headers['authorization']).toBe('Bearer tok-1');
      expect(post.headers['content-type']).toBe('application/json');

      const late = vi.fn();
      h.bridge.onAttributionMap(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(late).toHaveBeenCalledWith({
        'spotify:9': { user: 'Joe', timestamp: 1_700_000_000_000, trackName: 'Song', artist: 'Band' },
      });
    });

    it('an album event is logged but leaves the map alone', async () => {
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      h.fake.on('POST', '/fn/log-event', () => json({}));
      const late = vi.fn();
      await h.bridge.publishQueued({ ...item, eventType: 'album', uri: 'spotify:album:1' });
      await vi.waitFor(() => expect(h.fake.to('/fn/log-event')).toHaveLength(1));
      h.bridge.onAttributionMap(late);
      await tick();
      expect(late).not.toHaveBeenCalled();
    });

    it('retries the log 1 s then 2 s later, three attempts in all', async () => {
      vi.useFakeTimers();
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      h.fake.on('POST', '/fn/log-event', () => text('', 500));
      await h.bridge.publishQueued(item);
      await vi.advanceTimersByTimeAsync(0);
      expect(h.fake.to('/fn/log-event')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(h.fake.to('/fn/log-event')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.fake.to('/fn/log-event')).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1999);
      expect(h.fake.to('/fn/log-event')).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.fake.to('/fn/log-event')).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.fake.to('/fn/log-event')).toHaveLength(3);
    });

    it('stops retrying once a log lands, and survives a network error', async () => {
      vi.useFakeTimers();
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      let n = 0;
      h.fake.on('POST', '/fn/log-event', () => (++n === 1 ? Promise.reject(new Error('x')) : json({})));
      await h.bridge.publishQueued(item);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(h.fake.to('/fn/log-event')).toHaveLength(2);
    });

    it('with no uri nothing is logged, but listeners still hear the event', async () => {
      const h = makeBridge({ storage: { 'tt.displayName': 'Joe' } });
      const events = vi.fn();
      h.bridge.onAttributionEvent(events);
      await h.bridge.publishQueued({ ...item, uri: '' });
      expect(events).toHaveBeenCalledTimes(1);
      expect(h.fake.calls).toHaveLength(0);
    });

    it('credits an empty user when there is no display name', async () => {
      const h = makeBridge();
      h.fake.on('POST', '/fn/log-event', () => json({}));
      const events = vi.fn();
      h.bridge.onAttributionEvent(events);
      await h.bridge.publishQueued(item);
      expect(events.mock.calls[0][0].user).toBe('');
    });

    it('an unsubscribed event listener is not called', async () => {
      const h = makeBridge();
      h.fake.on('POST', '/fn/log-event', () => json({}));
      const events = vi.fn();
      h.bridge.onAttributionEvent(events)();
      await h.bridge.publishQueued(item);
      expect(events).not.toHaveBeenCalled();
    });
  });
});
