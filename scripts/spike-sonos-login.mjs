// SPIKE: sign in to play.sonos.com with no browser window.
// Usage: node scripts/spike-sonos-login.mjs [path-to-.env]
// Never prints credentials or tokens, only hosts, paths and status codes.
import { readFileSync } from 'node:fs';

const BASE = 'https://play.sonos.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ── .env ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(process.argv[2] ?? '.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])
);
const pick = (re) => Object.keys(env).find((k) => /SONOS/i.test(k) && re.test(k));
const userKey = pick(/USER|EMAIL|LOGIN/i);
const passKey = pick(/PASS/i);
console.log('[env] username key:', userKey, '| password key:', passKey);

// ── cookie jar (per host) ───────────────────────────────────────────────────
const jar = new Map(); // host -> Map(name -> value)
function store(url, res) {
  const host = new URL(url).host;
  if (!jar.has(host)) jar.set(host, new Map());
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.get(host).set(pair.slice(0, i).trim(), pair.slice(i + 1));
  }
}
const cookies = (url) =>
  [...(jar.get(new URL(url).host) ?? [])].map(([k, v]) => `${k}=${v}`).join('; ');

const safe = (url) => {
  const u = new URL(url);
  return `${u.host}${u.pathname}${u.search ? '?' + [...u.searchParams.keys()].join('&') : ''}`;
};

async function req(url, init = {}) {
  const res = await fetch(url, {
    redirect: 'manual',
    ...init,
    headers: { 'User-Agent': UA, Accept: '*/*', Cookie: cookies(url), ...init.headers },
  });
  store(url, res);
  console.log(`  ${init.method ?? 'GET'} ${safe(url)} -> ${res.status}`);
  return res;
}

/** Follow redirects by hand so cookies land in the right host's jar. */
async function follow(url, max = 15) {
  let res = await req(url);
  while (res.status >= 300 && res.status < 400 && max-- > 0) {
    url = new URL(res.headers.get('location'), url).href;
    res = await req(url);
  }
  return { res, url };
}

const form = (o) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o),
});
const json = (o) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(o),
});

// ── 1. next-auth: csrf + start the Okta sign-in ─────────────────────────────
console.log('[1] next-auth csrf + signin');
const { csrfToken } = await (await req(`${BASE}/api/auth/csrf`)).json();
const signin = await req(
  `${BASE}/api/auth/signin/okta`,
  form({ csrfToken, callbackUrl: `${BASE}/en-us/web-app`, json: 'true' })
);
const authorizeUrl = (await signin.json()).url;

// ── 2. the IdP's authorize page ─────────────────────────────────────────────
console.log('[2] authorize');
const { res: page, url: pageUrl } = await follow(authorizeUrl);
const html = await page.text();
console.log('  landed on', safe(pageUrl), '| html bytes:', html.length);

if (process.env.PROBE) {
  // What kind of login page is it? Print structure hints only.
  for (const re of [/stateToken/, /idx\/introspect/, /okta-signin|OktaSignIn/, /api\/v1\/authn/, /<form[^>]*>/g, /name="[^"]+"/g, /<script[^>]+src="[^"]+"/g]) {
    const m = html.match(re);
    console.log('  hint', re.source, '->', m ? [...new Set(m)].slice(0, 12) : null);
  }
  process.exit(0);
}

// ── 3. Okta Classic primary auth, bound to this authorize transaction ───────
console.log('[3] okta authn');
const idp = new URL(pageUrl).origin;
const rawState = html.match(/["']?stateToken["']?\s*[:=]\s*["']([^"']+)["']/)?.[1];
if (!rawState) throw new Error('no stateToken in the login page');
// The page embeds it as a JS string literal (- for "-").
const stateToken = rawState.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const authn = await req(`${idp}/api/v1/authn`, json({ username: env[userKey], password: env[passKey], stateToken }));
const data = await authn.json();
console.log('  status:', data.status ?? data.errorSummary, '| links:', Object.keys(data._links ?? {}));
if (data.status !== 'SUCCESS') {
  if (data._embedded?.factors) console.log('  factors:', data._embedded.factors.map((x) => x.factorType));
  throw new Error('okta did not report SUCCESS');
}

// ── 4. back through the next-auth callback ──────────────────────────────────
console.log('[4] redirect back to next-auth');
const { url: finalUrl } = await follow(data._links.next.href);
const token = jar.get('play.sonos.com')?.get('__Secure-next-auth.session-token');
console.log('  finished at', safe(finalUrl), '| session cookie:', token ? `yes (${token.length} chars)` : 'NO');
if (!token) process.exit(1);

// ── 5. same check the app uses (validateSessionToken) ───────────────────────
console.log('[5] validate against /api/mfe');
const mfe = await fetch(`${BASE}/api/mfe`, {
  headers: {
    Cookie: `__Secure-next-auth.session-token=${token}`,
    'User-Agent': UA,
    Accept: '*/*',
    Referer: `${BASE}/en-us/web-app`,
  },
});
console.log('  /api/mfe ->', mfe.status, mfe.ok ? 'HEADLESS LOGIN WORKS' : 'token rejected');
process.exit(mfe.ok ? 0 : 1);
