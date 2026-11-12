import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UpdateSource } from '../types';
import { BASE, fakeAuth, makeBridge, text } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('fetchImage', () => {
  const bytes = new Uint8Array([104, 105, 255, 0, 1]);
  const b64 = btoa(String.fromCharCode(...bytes));
  const image =
    (type = 'image/png') =>
    () =>
      new Response(bytes, { status: 200, headers: { 'content-type': type } });

  it('sends a play.sonos.com image through the gateway with the bearer', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/art/x.png', image());
    const r = await h.bridge.fetchImage('https://play.sonos.com/api/art/x.png?size=300');
    expect(r).toEqual({ data: b64, mimeType: 'image/png' });
    expect(h.fake.calls[0].url).toBe(`${BASE}/sonos/api/art/x.png?size=300`);
    expect(h.fake.calls[0].headers['authorization']).toBe('Bearer tok-1');
  });

  it('sends any other image through /img, encoded, with the bearer', async () => {
    const h = makeBridge();
    const url = 'https://i.ytimg.com/vi/abc/hq.jpg?a=1&b=2';
    h.fake.on('GET', '/img', image('image/jpeg; charset=x'));
    const r = await h.bridge.fetchImage(url);
    expect(r).toEqual({ data: b64, mimeType: 'image/jpeg' });
    expect(h.fake.calls[0].url).toBe(`${BASE}/img?url=${encodeURIComponent(url)}`);
    expect(h.fake.calls[0].query.get('url')).toBe(url);
    expect(h.fake.calls[0].headers['authorization']).toBe('Bearer tok-1');
  });

  it('treats lookalike hosts as other hosts', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/img', image());
    await h.bridge.fetchImage('https://play.sonos.com.evil.test/a.png');
    await h.bridge.fetchImage('http://play.sonos.com/a.png');
    await h.bridge.fetchImage('https://user:pw@play.sonos.com/a.png');
    expect(h.fake.calls.map((c) => c.path.split('?')[0])).toEqual(['/img', '/img', '/img']);
  });

  it('defaults the type to image/jpeg', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/img', () => new Response(bytes, { status: 200 }));
    expect(await h.bridge.fetchImage('https://a.test/x')).toEqual({ data: b64, mimeType: 'image/jpeg' });
  });

  it('refuses a URL that is not http(s)', async () => {
    const h = makeBridge();
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:image/png;base64,AA',
      '',
      undefined as unknown as string,
    ]) {
      expect(await h.bridge.fetchImage(bad)).toEqual({ error: 'Invalid URL' });
    }
    expect(h.fake.calls).toHaveLength(0);
  });

  it('answers the status, a network failure, or no token as an error', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/img', () => text('', 502));
    expect(await h.bridge.fetchImage('https://a.test/x')).toEqual({ error: '502 ' });
    h.fake.on('GET', '/img', () => Promise.reject(new TypeError('offline')));
    expect(await h.bridge.fetchImage('https://a.test/x')).toEqual({ error: 'offline' });
    const signedOut = makeBridge({ auth: fakeAuth({ token: null }) });
    expect(await signedOut.bridge.fetchImage('https://a.test/x')).toEqual({ error: 'No Entra token' });
    expect(signedOut.fake.calls).toHaveLength(0);
  });
});

describe('Genius is not available on the web', () => {
  it('answers each lookup with its no-result value and never calls out', async () => {
    const h = makeBridge();
    expect(await h.bridge.geniusDescription('t', 'a')).toBeNull();
    expect(await h.bridge.geniusArtist('a', 'hint')).toBeNull();
    expect(await h.bridge.geniusAlbumYear('al', 'a')).toBeNull();
    expect(await h.bridge.geniusArtistAlbums('a')).toEqual([]);
    expect(await h.bridge.geniusAlbumAbout('al', 'a')).toBeNull();
    expect(h.fake.calls).toHaveLength(0);
  });
});

describe('app info', () => {
  it('getVersion is the baked-in version', async () => {
    expect(await makeBridge().bridge.getVersion()).toBe('1.2.3');
  });

  it('isNewVersion is true once per version, decided at load', async () => {
    const first = makeBridge();
    expect(await first.bridge.isNewVersion()).toBe(true);
    expect(await first.bridge.isNewVersion()).toBe(true); // still the answer for this page load
    expect(first.storage.getItem('tt.lastSeenVersion')).toBe('1.2.3');

    const { createWebBridge } = await import('../index');
    const reload = createWebBridge(first.env);
    expect(await reload.isNewVersion()).toBe(false);

    const same = makeBridge({ storage: { 'tt.lastSeenVersion': '1.2.3' } });
    expect(await same.bridge.isNewVersion()).toBe(false);
    const older = makeBridge({ storage: { 'tt.lastSeenVersion': '1.2.2' } });
    expect(await older.bridge.isNewVersion()).toBe(true);
    expect(older.storage.getItem('tt.lastSeenVersion')).toBe('1.2.3');
  });

  it('queue width defaults to 380 and round-trips', async () => {
    const h = makeBridge();
    expect(await h.bridge.getQueueDockedWidth()).toBe(380);
    await h.bridge.setQueueDockedWidth(512);
    expect(await h.bridge.getQueueDockedWidth()).toBe(512);
    expect(h.storage.getItem('tt.queueDockedWidth')).toBe('512');
    const junk = makeBridge({ storage: { 'tt.queueDockedWidth': 'junk' } });
    expect(await junk.bridge.getQueueDockedWidth()).toBe(380);
  });

  it('keeps working when storage throws', async () => {
    const h = makeBridge();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(await h.bridge.getQueueDockedWidth()).toBe(380);
    await expect(h.bridge.setQueueDockedWidth(400)).resolves.toBeUndefined();
    expect(await h.bridge.getActiveGroup()).toBeNull();
  });

  describe('openExternal', () => {
    it('opens http and https in a new tab without opener or referrer', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const h = makeBridge();
      await h.bridge.openExternal('https://example.com/a?b=1');
      await h.bridge.openExternal('http://example.com');
      expect(open).toHaveBeenCalledWith('https://example.com/a?b=1', '_blank', 'noopener,noreferrer');
      expect(open).toHaveBeenCalledTimes(2);
    });

    it('refuses everything else', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const h = makeBridge();
      for (const bad of ['file:///c:/x', 'javascript:alert(1)', 'mailto:a@b.c', 'ms-word:x', 'nonsense', '']) {
        await h.bridge.openExternal(bad);
      }
      expect(open).not.toHaveBeenCalled();
    });
  });
});

describe('Electron-only methods', () => {
  it('resolve and do nothing', async () => {
    const h = makeBridge();
    const b = h.bridge;
    await Promise.all([
      b.trackEvent('x', { a: 'b' }),
      b.minimizeWindow(),
      b.maximizeWindow(),
      b.closeWindow(),
      b.openWsMonitor(),
      b.openHttpMonitor(),
      b.openDevTools(),
      b.openMiniPlayer(),
      b.closeMiniPlayer(),
      b.updateNowPlayingSmtc({ title: 't' }),
    ]);
    expect(await b.isWindowMaximized()).toBe(false);
    const cb = vi.fn();
    b.onWindowMaximized(cb)();
    expect(cb).not.toHaveBeenCalled();
    expect(h.fake.calls).toHaveLength(0);
  });

  describe('updates', () => {
    const source = () => {
      const cbs = new Set<(v: string) => void>();
      const src: UpdateSource & { fire(v: string): void; activated: number } = {
        activated: 0,
        onWaiting: (cb) => {
          cbs.add(cb);
          return () => cbs.delete(cb);
        },
        activate: () => {
          src.activated++;
          return Promise.resolve();
        },
        fire: (v) => cbs.forEach((cb) => cb(v)),
      };
      return src;
    };

    it('delegate to the update source', async () => {
      const src = source();
      const h = makeBridge({ updates: src });
      const cb = vi.fn();
      const off = h.bridge.onUpdateDownloaded(cb);
      src.fire('2.0.0');
      expect(cb).toHaveBeenCalledWith('2.0.0');
      await h.bridge.installUpdate();
      expect(src.activated).toBe(1);
      off();
      src.fire('2.0.1');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('are inert without one', async () => {
      const h = makeBridge();
      const cb = vi.fn();
      const off = h.bridge.onUpdateDownloaded(cb);
      await expect(h.bridge.installUpdate()).resolves.toBeUndefined();
      off();
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
