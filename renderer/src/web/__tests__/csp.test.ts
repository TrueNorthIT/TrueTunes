import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guard for the web app's one-origin rule: the page may call its own origin (the gateway) and only the named
// third-party hosts that let a browser read them. A new host is a deliberate change here, not a drive-by.

const html = readFileSync(join(__dirname, '..', '..', '..', 'web', 'index.html'), 'utf8');
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? [];

describe('web app CSP', () => {
  it('runs no inline script and no eval', () => {
    expect([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]).toHaveLength(0);
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('connects only to its own origin and the hosts that allow a browser', () => {
    expect(directive('connect-src').sort()).toEqual(
      [
        "'self'",
        // the relay, spelled out: older Safari does not take 'self' to cover wss
        'wss://truetunes.tnapps.co.uk',
        // lyrics
        'https://lrclib.net',
        // artwork CDNs that send Access-Control-Allow-Origin
        'https://i.ytimg.com',
        'https://yt3.googleusercontent.com',
        'https://lh3.googleusercontent.com',
        'https://i.scdn.co',
        'https://mosaic.scdn.co',
        'https://*.mzstatic.com',
        // profile and playlist images
        'https://truetunesfoywo62izs34i.blob.core.windows.net',
        // sign-in and presence
        'https://login.microsoftonline.com',
        'https://graph.microsoft.com',
      ].sort()
    );
  });

  it('does not name the hosts the app must reach through the gateway', () => {
    for (const host of ['play.sonos.com', 'api.ws.sonos.com', 'azurewebsites.net', 'webpubsub.azure.com', 'genius.com'])
      expect(csp).not.toContain(host);
  });

  it('falls back to its own origin for everything else, and cannot be re-based or posted from', () => {
    expect(directive('default-src')).toEqual(["'self'"]);
    expect(directive('base-uri')).toEqual(["'none'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('form-action')).toEqual(["'none'"]);
  });
});
