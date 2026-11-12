import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDemoRuntime } from '..';
import { artUrl } from '../../../test/fixtures/art';
import { FROZEN_NOW } from '../../../test/fixtures/time';

afterEach(() => vi.useRealTimers());

describe('installDemoRuntime', () => {
  it('leaves the real localStorage alone and restores it on undo', () => {
    localStorage.setItem('real', 'kept');
    const realStorage = window.localStorage;
    const undo = installDemoRuntime();
    expect(window.localStorage).not.toBe(realStorage);
    expect(localStorage.getItem('real')).toBeNull();
    localStorage.setItem('demo', '1');
    sessionStorage.setItem('demo', '1');
    undo();
    expect(window.localStorage).toBe(realStorage);
    expect(localStorage.getItem('real')).toBe('kept');
    expect(localStorage.getItem('demo')).toBeNull();
    expect(sessionStorage.getItem('demo')).toBeNull();
    localStorage.clear();
  });

  it('keeps the memory storage behaving like Storage', () => {
    const undo = installDemoRuntime();
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.length).toBe(2);
    expect(localStorage.key(1)).toBe('b');
    localStorage.removeItem('a');
    expect(localStorage.getItem('a')).toBeNull();
    localStorage.clear();
    expect(localStorage.length).toBe(0);
    undo();
  });

  it('runs the clock from the fixtures instant and restores the real Date', () => {
    vi.useFakeTimers();
    const FakeDate = Date;
    const undo = installDemoRuntime();
    expect(Date.now()).toBe(FROZEN_NOW);
    vi.advanceTimersByTime(5_000);
    expect(Date.now()).toBe(FROZEN_NOW + 5_000);
    expect(new Date().getTime()).toBe(FROZEN_NOW + 5_000);
    expect(new Date(2020, 0, 1).getFullYear()).toBe(2020);
    expect(new Date('2021-05-05T00:00:00Z').toISOString()).toBe('2021-05-05T00:00:00.000Z');
    undo();
    expect(Date).toBe(FakeDate);
  });

  it('serves artwork and lyrics, passes data: URLs and refuses an external host', async () => {
    const realFetch = window.fetch;
    const undo = installDemoRuntime();
    expect(window.fetch).not.toBe(realFetch);
    const art = await fetch(artUrl('album:x'));
    expect(art.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await art.text()).toContain('<svg');
    const lrc = await (await fetch('https://lrclib.net/api/get?duration=180')).json();
    expect(lrc.syncedLyrics).toBeTruthy();
    expect(await (await fetch('data:text/plain,hello')).text()).toBe('hello');
    await expect(fetch('https://truetunes.tnapps.co.uk/sonos/groups')).rejects.toThrow(/Blocked by the demo/);
    await expect(fetch('https://example.com/')).rejects.toThrow(/Blocked/);
    undo();
    expect(window.fetch).toBe(realFetch);
  });

  it('refuses a WebSocket to another host and restores the constructor', () => {
    const real = window.WebSocket;
    const undo = installDemoRuntime();
    expect(() => new WebSocket('wss://truetunes.tnapps.co.uk/sonos/ws')).toThrow(/Blocked/);
    undo();
    expect(window.WebSocket).toBe(real);
  });

  it('refuses this origin’s gateway paths, including /pubsub, for fetch and for WebSocket', async () => {
    const undo = installDemoRuntime();
    try {
      for (const path of [
        '/sonos/api/x',
        '/fn/attribution',
        '/img?url=x',
        '/pubsub/ws',
        '/pubsub/ws?username=A',
        '/pubsub',
      ]) {
        await expect(fetch(path)).rejects.toThrow(/Blocked by the demo/);
        await expect(fetch(`${window.location.origin}${path}`)).rejects.toThrow(/Blocked by the demo/);
      }
      for (const path of ['/pubsub/ws', '/pubsub/ws?username=A%20B', '/sonos/ws']) {
        const url = `${window.location.origin.replace(/^http/, 'ws')}${path}`;
        expect(() => new WebSocket(url)).toThrow(/Blocked/);
        expect(() => new WebSocket(path, ['json.webpubsub.azure.v1'])).toThrow(/Blocked/);
      }
    } finally {
      undo();
    }
  });
});
