// What the True Tunes web app's host must do for someone who is NOT signed in: serve the app shell with the
// right cache headers, and refuse everything else. Safe to run against production: it only reads, and every
// request it makes to /sonos, /fn, /img and the relays is one that must be refused.
//
//   node scripts/web/checks.mjs https://truetunes.tnapps.co.uk          gateway only (no web app deployed yet)
//   node scripts/web/checks.mjs https://truetunes.tnapps.co.uk --app    also the app shell and its assets
//   node scripts/web/checks.mjs https://truetunes.tnapps.co.uk --pwa    also the manifest and service worker
import WebSocket from 'ws';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('usage: node scripts/web/checks.mjs <base url> [--app] [--pwa]');
  process.exit(2);
}
const withApp = process.argv.includes('--app') || process.argv.includes('--pwa');
const withPwa = process.argv.includes('--pwa');

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const get = (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });

/** The HTTP status an upgrade to `path` is refused with, or 'open' if the server accepted it. */
function upgrade(path, protocols, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}${path}`, protocols, { headers });
    ws.on('open', () => {
      ws.close();
      resolve('open');
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', (err) => resolve(`error: ${err.message}`));
  });
}

// ── always: the API paths refuse a caller with no sign-in ──
{
  const res = await get('/healthz');
  check('GET /healthz answers 200', res.status === 200, String(res.status));
}
for (const [what, path] of [
  ['a Sonos API call', '/sonos/api/groups/v1/households/x/groups'],
  ['Sonos’s own session endpoint (never forwarded)', '/sonos/api/auth/session'],
  ['a Functions call', '/fn/stats?period=week'],
  [
    'an image on a listed host',
    `/img?url=${encodeURIComponent('https://www.gstatic.com/images/branding/product/1x/youtube_music_48dp.png')}`,
  ],
]) {
  const none = await get(path);
  check(`${what} with no token is refused with 401`, none.status === 401, String(none.status));
  const forged = await get(path, { headers: { Authorization: 'Bearer not.a.token' } });
  check(`${what} with a made-up token is refused with 401`, forged.status === 401, String(forged.status));
  const body = await none.text();
  check(`${what}: the refusal is the gateway’s own`, /sign-in required/.test(body), body.slice(0, 60));
}
for (const path of ['/fn/sonos-session', '/fn/Sonos-Session', '/fn/sonos%2Dsession', '/fn/x/../sonos-session']) {
  const res = await get(path, { headers: { Authorization: 'Bearer not.a.token' } });
  check(`${path} is 404 (the Sonos session is not forwarded)`, res.status === 404, String(res.status));
}
for (const url of [
  'https://example.com/a.png',
  'http://www.gstatic.com/a.png',
  'https://www.gstatic.com.example.com/a.png',
]) {
  const res = await get(`/img?url=${encodeURIComponent(url)}`);
  check(`the image path refuses ${url} with 403`, res.status === 403, String(res.status));
}
check(
  'the relay refuses an upgrade with no token (401)',
  (await upgrade('/sonos/ws', ['v1.api.smartspeaker.audio'])) === 401
);
check(
  'the relay refuses a made-up token offered as a subprotocol (401)',
  (await upgrade('/sonos/ws', ['v1.api.smartspeaker.audio', 'bearer.not.a.token'])) === 401
);
check(
  'the relay refuses a made-up token in the Authorization header (401)',
  (await upgrade('/sonos/ws', ['v1.api.smartspeaker.audio'], { Authorization: 'Bearer not.a.token' })) === 401
);
check(
  'the pubsub relay refuses an upgrade with no token (401)',
  (await upgrade('/pubsub/ws?username=check', ['json.webpubsub.azure.v1'])) === 401
);
check(
  'the pubsub relay refuses a made-up token offered as a subprotocol (401)',
  (await upgrade('/pubsub/ws?username=check', ['json.webpubsub.azure.v1', 'bearer.not.a.token'])) === 401
);
check('no other path upgrades (404)', (await upgrade('/other', ['v1.api.smartspeaker.audio'])) === 404);
check('/pubsub/nope does not upgrade (404)', (await upgrade('/pubsub/nope', ['json.webpubsub.azure.v1'])) === 404);
for (const path of ['/sonos/nope', '/pubsub/nope', '/assets/nope-000.js', '/.env', '/%2e%2e/package.json']) {
  const res = await fetch(`${base}${path}`);
  check(`${path} is 404, not the app shell`, res.status === 404, String(res.status));
}

// ── the app shell ──
if (withApp) {
  const res = await get('/');
  const html = await res.text();
  check('GET / is the app shell (200, HTML)', res.status === 200 && /<div id="root">/.test(html), String(res.status));
  check(
    'the shell is served no-cache',
    res.headers.get('cache-control') === 'no-cache',
    res.headers.get('cache-control') ?? ''
  );
  check(
    'the shell cannot be framed',
    /frame-ancestors 'none'/.test(res.headers.get('content-security-policy') ?? ''),
    res.headers.get('content-security-policy') ?? ''
  );
  check('the shell carries its Content-Security-Policy', /http-equiv="Content-Security-Policy"/.test(html));
  for (const path of ['/demo', '/auth/redirect']) {
    const r = await get(path);
    check(`${path} is the app shell too`, r.status === 200 && /<div id="root">/.test(await r.text()), String(r.status));
  }
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  check('the shell names hashed assets', assets.length > 0, `${assets.length} found`);
  for (const path of assets) {
    const r = await get(path, { headers: { 'Accept-Encoding': 'br' } });
    await r.arrayBuffer();
    check(
      `${path} is cached for a year, immutable`,
      r.status === 200 && r.headers.get('cache-control') === 'public, max-age=31536000, immutable',
      `${r.status} ${r.headers.get('cache-control')}`
    );
  }
}

// ── installability ──
if (withPwa) {
  const res = await get('/manifest.webmanifest');
  check('the manifest is served no-cache', res.status === 200 && res.headers.get('cache-control') === 'no-cache');
  const manifest = await res.json().catch(() => ({}));
  check('the manifest has a name and a standalone display', !!manifest.name && manifest.display === 'standalone');
  check('the manifest starts at / in scope /', manifest.start_url === '/' && manifest.scope === '/');
  const sizes = (manifest.icons ?? []).map((i) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`);
  check(
    'the manifest has 192 and 512 icons and a maskable one',
    ['192x192', '512x512'].every((s) => sizes.some((x) => x.startsWith(s))) &&
      sizes.some((x) => x.includes('maskable')),
    sizes.join(', ')
  );
  for (const icon of manifest.icons ?? []) {
    const r = await get(icon.src);
    check(
      `icon ${icon.src} loads as an image`,
      r.status === 200 && /^image\//.test(r.headers.get('content-type') ?? '')
    );
  }
  const sw = await get('/sw.js');
  check('the service worker is served no-cache', sw.status === 200 && sw.headers.get('cache-control') === 'no-cache');
  check('the service worker is JavaScript', /javascript/.test(sw.headers.get('content-type') ?? ''));
}

console.log(failed ? `\n${failed} check(s) failed against ${base}` : `\nAll checks passed against ${base}`);
process.exit(failed ? 1 : 0);
