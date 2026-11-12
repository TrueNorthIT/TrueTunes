// Drives the web app's /demo route in a real browser (Chromium, phone-sized by default) through the main
// journeys. /demo is a pretend office in memory, so this is safe anywhere, production included: the run fails if
// the page makes a single request to /sonos, /fn, /img, the relay or any other host.
//
//   node scripts/web/journey.mjs --local                      build first: npm run build:web && (cd server && npm run build)
//   node scripts/web/journey.mjs https://truetunes.tnapps.co.uk
//   options: --width 390 --height 844 --shots <dir>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const width = Number(opt('--width', 390));
const height = Number(opt('--height', 844));
const shots = opt('--shots', null);
const local = args.includes('--local');
let base = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/+$/, '');
if (!local && !base) {
  console.error('usage: node scripts/web/journey.mjs (--local | <base url>) [--width n] [--height n] [--shots dir]');
  process.exit(2);
}

/** The gateway's own code serving the built web app, on a spare port. No Sonos or Entra settings: every API path refuses. */
async function startLocalGateway() {
  const port = 8700 + Math.floor(process.pid % 200);
  const child = spawn(process.execPath, [path.join(repo, 'server', 'dist', 'gateway', 'main.js')], {
    env: { ...process.env, PORT: String(port), WEB_ROOT: path.join(repo, 'renderer', 'dist-web') },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return { url, stop: () => child.kill() };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('the local gateway did not start (is server/dist built?)');
}

const gateway = local ? await startLocalGateway() : null;
if (gateway) base = gateway.url;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
  hasTouch: width < 800,
  isMobile: width < 800,
});
const page = await context.newPage();

// ── everything the page asks for, to prove the demo stays in its box ──
const origin = new URL(base).origin;
const strayRequests = [];
const pageErrors = [];
page.on('request', (req) => {
  const url = new URL(req.url());
  if (url.protocol === 'data:' || url.protocol === 'blob:') return;
  const apiPath = /^\/(sonos|fn|img)(\/|$)/.test(url.pathname);
  if (url.origin !== origin || apiPath) strayRequests.push(`${req.method()} ${url.origin}${url.pathname}`);
});
page.on('websocket', (ws) => strayRequests.push(`WebSocket ${ws.url()}`));
page.on('pageerror', (err) => pageErrors.push(err.message));

let failed = 0;
let step = 0;
async function journey(name, run) {
  step++;
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(err.message ?? err).split('\n')[0]}`);
  }
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({
      path: path.join(shots, `${String(step).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`),
    });
  }
}
/** The transport's own button, by its label: other buttons say "Play" too (Queuedle) or mention pausing (the DJ). */
const transport = (label) => page.locator(`button[aria-label="${label}"]`);
const expectVisible = (locator, timeout = 8000) => locator.first().waitFor({ state: 'visible', timeout });

await journey('open the demo and see what is playing', async () => {
  await page.goto(`${base}/demo`, { waitUntil: 'load' });
  await expectVisible(page.getByText('Demo', { exact: true }));
  await expectVisible(page.getByText('Crooked Shoreline'), 15000);
});

await journey('pause and resume', async () => {
  await transport('Pause').first().click();
  await expectVisible(transport('Play'));
  await transport('Play').first().click();
  await expectVisible(transport('Pause'));
});

await journey('nothing scrolls sideways', async () => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  if (scrollWidth > innerWidth) throw new Error(`the page is ${scrollWidth}px wide in a ${innerWidth}px window`);
});

await journey('the demo made no request to /sonos, /fn, /img, the relay or another host', async () => {
  if (strayRequests.length)
    throw new Error(`${strayRequests.length} stray request(s): ${[...new Set(strayRequests)].slice(0, 5).join(', ')}`);
});

await journey('no uncaught errors in the page', async () => {
  if (pageErrors.length) throw new Error(pageErrors[0]);
});

await browser.close();
gateway?.stop();
console.log(
  failed
    ? `\n${failed} journey step(s) failed at ${width}x${height} against ${base}`
    : `\nAll journey steps passed at ${width}x${height} against ${base}`
);
process.exit(failed ? 1 : 0);
