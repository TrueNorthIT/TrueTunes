// Installability, the service worker's cache, the offline screen and the update flow, in a real browser
// (Chromium) against the gateway's own code serving the built web app. Local only: it swaps in a second
// "build" to prove that a new version waits for the Update button. Uses /demo, so nothing reaches the office.
//
//   npm run build:web && (cd server && npm run build) && node scripts/web/pwa.mjs
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 8900 + (process.pid % 90);
const base = `http://127.0.0.1:${port}`;

// A copy of the build, so the second "version" can be written into it.
const webRoot = path.join(mkdtempSync(path.join(tmpdir(), 'tt-pwa-')), 'web');
cpSync(path.join(repo, 'renderer', 'dist-web'), webRoot, { recursive: true });

let gateway;
async function startGateway() {
  gateway = spawn(process.execPath, [path.join(repo, 'server', 'dist', 'gateway', 'main.js')], {
    env: { ...process.env, PORT: String(port), WEB_ROOT: webRoot },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the local gateway did not start (is server/dist built?)');
}
const stopGateway = () => new Promise((done) => (gateway.once('exit', done), gateway.kill()));

let failed = 0;
async function check(name, run) {
  try {
    const detail = await run();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(err.message ?? err).split('\n')[0]}`);
  }
}
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

/** The demo is up: its now-playing title is on the page (polled in the page, so a reload in between does not matter). */
const seesNowPlaying = () =>
  page.waitForFunction(() => document.body.innerText.includes('Crooked Shoreline'), null, { timeout: 20000 });

await startGateway();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

/** The version the page's controlling service worker reports. */
const controllerVersion = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        navigator.serviceWorker.controller.postMessage('version', [channel.port2]);
        setTimeout(() => resolve('no answer'), 3000);
      })
  );

await check('the service worker registers and takes control of the first visit', async () => {
  await page.goto(`${base}/demo`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  return `version ${await controllerVersion()}`;
});

await check('Chromium finds the app installable (no manifest or installability errors)', async () => {
  const cdp = await context.newCDPSession(page);
  const { errors, url } = await cdp.send('Page.getAppManifest');
  assert(url.endsWith('/manifest.webmanifest'), `no manifest found (${url})`);
  assert(errors.length === 0, `manifest errors: ${JSON.stringify(errors)}`);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  assert(installabilityErrors.length === 0, `installability errors: ${JSON.stringify(installabilityErrors)}`);
  // Detached again: an attached session keeps the page reporting itself online in the offline checks below.
  await cdp.detach();
});

await check('after a session the cache holds only the shell, the manifest, icons and build files', async () => {
  await seesNowPlaying();
  await page.evaluate(() => (location.hash = '#/leaderboard'));
  await page.waitForTimeout(1500);
  const paths = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });
  assert(paths.includes('/index.html'), 'the shell is not cached');
  const stray = paths.filter((p) => !/^\/(index\.html|manifest\.webmanifest|icons\/[^/]+|assets\/[^/]+)$/.test(p));
  assert(stray.length === 0, `unexpected cache entries: ${stray.slice(0, 5).join(', ')}`);
  return `${paths.length} entries`;
});

await check('offline, the app opens to its own offline screen, not the browser’s error page', async () => {
  await context.setOffline(true);
  await page.goto(`${base}/`);
  await page.getByText('You’re offline', { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Try again' }).waitFor();
});

await check('offline, the demo still opens from the cache', async () => {
  await page.goto(`${base}/demo`);
  await seesNowPlaying();
  await context.setOffline(false);
});

// ── a second version ships ──
// Two windows of a brand-new visitor: the first loads before any worker exists (the case where a page gets its
// worker mid-session), the second after. The update must reload both.
const visitor = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const first = await visitor.newPage();
await first.goto(`${base}/demo`);
await first.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const second = await visitor.newPage();
await second.goto(`${base}/demo`);
await second.waitForFunction(() => document.body.innerText.includes('Crooked Shoreline'), null, { timeout: 20000 });
const versionOn = (p) =>
  p.evaluate(
    () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        navigator.serviceWorker.controller.postMessage('version', [channel.port2]);
        setTimeout(() => resolve('no answer'), 3000);
      })
  );
/**
 * Waits for the build with this id to have taken over, then answers the version the page is running under.
 * A waiting worker only takes over once the old one is idle, so this must not message the worker while it
 * waits (that would keep it busy for ever): it watches the caches instead, which the new worker prunes to its
 * own when it activates. Polled, because the page reloads in between and a slow runner takes its time.
 */
async function reaches(p, id, ms = 90000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const names = await p.evaluate(() => caches.keys()).catch(() => null);
    if (names && names.length === 1 && names[0] === `true-tunes-${id}`) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
  return versionOn(p).catch(() => 'unreachable');
}
const before = await versionOn(first);
// Someone is using the app: a key press ends "launching", so the update below must wait for the button.
await first.keyboard.press('Shift');

await stopGateway();
const swPath = path.join(webRoot, 'sw.js');
writeFileSync(
  swPath,
  readFileSync(swPath, 'utf8')
    .replace(/"id":"[0-9a-f]+"/, '"id":"second000000"')
    .replace(/"version":"[^"]+"/, '"version":"99.0.0"')
);
await startGateway();

await check('a new version installs and waits: the page stays on the old one and shows Update', async () => {
  await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await first.getByRole('button', { name: 'Update' }).waitFor({ timeout: 15000 });
  const still = await versionOn(first);
  assert(still === before, `the page moved to ${still} without being asked`);
  const waiting = await first.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  assert(waiting, 'no worker is waiting');
  return `still on ${still}`;
});

await check(
  'the Update button activates the new version and reloads onto it, in a window that began with no worker',
  async () => {
    await first.getByRole('button', { name: 'Update' }).click();
    const now = await reaches(first, 'second000000');
    assert(now === '99.0.0', `expected 99.0.0, the page is on ${now}`);
    await first.waitForFunction(() => document.body.innerText.includes('Crooked Shoreline'), null, { timeout: 20000 });
    const names = await first.evaluate(() => caches.keys());
    assert(names.length === 1 && names[0] === 'true-tunes-second000000', `old caches left behind: ${names.join(', ')}`);
    return `now on ${now}`;
  }
);

await check('the other open window follows onto the new version', async () => {
  const now = await reaches(second, 'second000000');
  assert(now === '99.0.0', `the second window is on ${now}`);
  await second.waitForFunction(() => document.body.innerText.includes('Crooked Shoreline'), null, { timeout: 20000 });
});

// ── a third version ships while the app is closed, and then the app is opened ──
await first.close();
await second.close();
await stopGateway();
writeFileSync(
  swPath,
  readFileSync(swPath, 'utf8')
    .replace('"id":"second000000"', '"id":"third0000000"')
    .replace('"version":"99.0.0"', '"version":"100.0.0"')
);
await startGateway();

await check('opening the app after a deploy takes the new version by itself, with no button', async () => {
  const launch = await visitor.newPage();
  await launch.goto(`${base}/demo`);
  const now = await reaches(launch, 'third0000000');
  assert(now === '100.0.0', `the launched app is on ${now}`);
  await launch.waitForFunction(() => document.body.innerText.includes('Crooked Shoreline'), null, { timeout: 20000 });
  assert(
    (await launch.getByRole('button', { name: 'Update' }).count()) === 0,
    'the Update button is showing after a launch'
  );
  return `launched onto ${now}`;
});

await browser.close();
await stopGateway();
rmSync(path.dirname(webRoot), { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\nAll installability checks passed');
process.exit(failed ? 1 : 0);
