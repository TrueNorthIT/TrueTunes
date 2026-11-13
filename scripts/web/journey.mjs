// Drives the web app's /demo route in a real browser (Chromium, phone-sized by default) through the main
// journeys. /demo is a pretend office in memory, so this is safe anywhere, production included: the run fails if
// the page makes a single request to /sonos, /fn, /img, the relay or any other host.
//
//   node scripts/web/journey.mjs --local                      build first: npm run build:web && (cd server && npm run build)
//   node scripts/web/journey.mjs https://truetunes.tnapps.co.uk
//   options: --width 390 --height 844 --shots <dir>
//            --device "iPhone 14"   Playwright's descriptor for it: WebKit, 390x844 at 3x, touch, Safari's user agent
//                                   (npx playwright install webkit first; CI installs only Chromium, the default)
//            --cpu 6                Chromium only: slow the page's CPU 6x, to shake out steps that only pass on a fast machine
//            --safe-area           give the page an iPhone 14's insets (47px top, 34px bottom) through the
//                                   --safe-top / --safe-bottom tokens, which no desktop browser has of its own
//
// At phone size the app shows the phone shell and every step is a tap; at 1280 wide it shows the desktop layout
// and the steps that only exist on the phone (the tab bar, the row menus, the tap-target and type-size checks)
// are skipped.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const deviceName = opt('--device', null);
const device = deviceName ? devices[deviceName] : null;
if (deviceName && !device) {
  console.error(`unknown device "${deviceName}" (see Playwright's device list, for example "iPhone 14")`);
  process.exit(2);
}
const width = Number(opt('--width', device?.viewport.width ?? 390));
const height = Number(opt('--height', device?.viewport.height ?? 844));
const shots = opt('--shots', null);
const safeArea = args.includes('--safe-area');
const cpu = Number(opt('--cpu', 1));
const local = args.includes('--local');
let base = args.find((a) => /^https?:\/\//.test(a))?.replace(/\/+$/, '');
if (!local && !base) {
  console.error(
    'usage: node scripts/web/journey.mjs (--local | <base url>) [--width n] [--height n] [--device name] [--safe-area] [--shots dir]'
  );
  process.exit(2);
}

/** The demo's signed-in viewer (renderer/src/test/fixtures/people.ts): what they queue carries this name. */
const VIEWER = 'Wren Calloway';
/** An album nobody in the demo has queued, so its first track is new to the queue. */
const SEARCH_FOR = 'Slack Water';

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

const touch = device ? !!device.hasTouch : width < 800;
const browser = await (device?.defaultBrowserType === 'webkit' ? webkit : chromium).launch();
const context = await browser.newContext(
  device
    ? { ...device, viewport: { width, height } }
    : { viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch }
);
const page = await context.newPage();
if (cpu > 1 && browser.browserType().name() === 'chromium') {
  // A slow phone, or a laptop with other work running: timing a step must not depend on a fast machine.
  await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
}
if (safeArea) {
  // A stylesheet with !important: setting the properties inline on the root did nothing (the phone shell's own
  // rules win), so the run looked like it had insets and had none. The first step checks the layout moved.
  await page.addInitScript(() => {
    const add = () => {
      if (document.getElementById('journey-safe-area') || !document.documentElement) return;
      const s = document.createElement('style');
      s.id = 'journey-safe-area';
      s.textContent = ':root { --safe-top: 47px !important; --safe-bottom: 34px !important; }';
      document.documentElement.appendChild(s);
    };
    add(); // the document may not have a root yet in a fresh frame
    document.addEventListener('readystatechange', add);
  });
}

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
let skipped = 0;
let step = 0;
async function journey(name, run) {
  step++;
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(err.message ?? err).split('\n').slice(0, 6).join('\n      ')}`);
  }
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({
      path: path.join(shots, `${String(step).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`),
    });
  }
}
/** A step that only exists in the phone shell. */
const phoneJourney = (name, run) =>
  phone ? journey(name, run) : (skipped++, console.log(`SKIP  ${name} (not the phone shell)`));

/** The transport's own button, by its label: other buttons say "Play" too (Queuedle) or mention pausing (the DJ). */
const transport = (label) => page.locator(`button[aria-label="${label}"]`);
const expectVisible = (locator, timeout = 8000) => locator.first().waitFor({ state: 'visible', timeout });
const expectGone = (locator, timeout = 8000) => locator.first().waitFor({ state: 'detached', timeout });
/**
 * A finger on a phone, the mouse on a desktop. In WebKit the target must be visible first, then the tap skips
 * Playwright's "stable" wait: that wait runs on animation frames, and headless WebKit on Windows stops delivering
 * them while the page is busy (measured: a rAF loop ran 1 frame in 2s on the queue page), so it never finishes.
 */
const press = async (locator, options) => {
  const target = locator.first();
  const act = (o) => (touch ? target.tap(o) : target.click(o));
  if (browser.browserType().name() !== 'webkit') return act(options);
  // Normally: Playwright's own checks, so a control that is covered or still moving fails the step.
  // Only if the stable wait itself never completes: wait for it to be visible, then tap without it.
  try {
    return await act({ ...options, timeout: 6000 });
  } catch (err) {
    if (!/stable/.test(String(err.message))) throw err;
    await expectVisible(target);
    return act({ ...options, force: true });
  }
};
const hash = () => page.evaluate(() => location.hash);
async function goTo(route) {
  await page.evaluate((r) => {
    location.hash = r;
  }, route);
  await page.waitForFunction((r) => location.hash === `#${r}`, route, { timeout: 5000 });
  await settle();
}
/** Let a page load its data and finish its entrance: nothing in the demo is slower than this. */
const settle = () => page.waitForTimeout(900);
async function expectHash(pattern) {
  await page.waitForFunction((src) => new RegExp(src).test(location.hash), pattern.source, { timeout: 8000 });
}
const tab = (route) => page.locator(`nav[aria-label="Main"] a[href="#${route}"]`);
const menuItem = (name) => page.getByRole('menuitem', { name, exact: true });
/** How many tracks the queue's header says it holds (the chip beside "Queue"). */
async function queueCount() {
  const label = await page.locator('[aria-label$=" tracks"]').first().getAttribute('aria-label', { timeout: 8000 });
  return Number.parseInt(label ?? '', 10);
}
/** The queue's list is virtual: bring its end (or its start) into the window. */
async function scrollQueue(to) {
  // The scroller is found from any mounted row (the playing row itself is unmounted while the list is scrolled away
  // from it), and the step then waits for the virtual list to catch up: it re-renders its window a moment after
  // the scroll (about 400ms with the CPU slowed 6x), and a script that reads rows before that finds none.
  await page.evaluate((where) => {
    for (let el = document.querySelector('[data-index]'); el; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) {
        el.scrollTo(0, where === 'end' ? el.scrollHeight : 0);
        // Playwright's WebKit does not always dispatch the scroll event for a script's scrollTo (the list really
        // moves; only the event is missing, so the virtual list is never told and keeps its old window).
        // A finger's scroll in Safari always does, so this stands in for it.
        el.dispatchEvent(new Event('scroll'));
        return;
      }
    }
    throw new Error('no scrolling queue list found');
  }, to);
  await page.waitForFunction(
    (where) => {
      const rows = [...document.querySelectorAll('[data-index]')];
      if (!rows.length) return false;
      let el = rows[0];
      while (el && !(/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) el = el.parentElement;
      if (!el) return false;
      const byIndex = rows.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
      const atTarget =
        where === 'end'
          ? el.scrollTop + el.clientHeight >= el.scrollHeight - 2 &&
            byIndex[byIndex.length - 1].getBoundingClientRect().bottom >= rows[0].parentElement.getBoundingClientRect().bottom - 2
          : el.scrollTop === 0 && Number(byIndex[0].dataset.index) === 0;
      // The list can grow after the first scroll (the queue re-fetches when its version changes, and the DJ's
      // rows arrive), so the end moves further away: scroll again rather than wait for a position that is gone.
      if (!atTarget) {
        el.scrollTo(0, where === 'end' ? el.scrollHeight : 0);
        el.dispatchEvent(new Event('scroll'));
      }
      // ...and nothing is still moving: the same rows in the same places on two looks in a row.
      const sig = `${atTarget}|${byIndex.map((r) => r.dataset.index + ':' + Math.round(r.getBoundingClientRect().top)).join()}`;
      const steady = window.__queueSig === sig;
      window.__queueSig = sig;
      return atTarget && steady;
    },
    to,
    { polling: 150, timeout: 10000 }
  ).catch(async (err) => {
    const sig = await page.evaluate(() => window.__queueSig);
    throw new Error(`the queue did not settle at its ${to}: ${String(sig).slice(0, 200)}\n${err.message}`);
  });
}
/** The queue rows on screen, top to bottom, by title (each row's ⋯ is named for its track). */
const queueOrder = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="More for "]')]
      .map((b) => ({ title: b.getAttribute('aria-label').slice('More for '.length), y: b.getBoundingClientRect().top }))
      .sort((a, b) => a.y - b.y)
      .map((r) => r.title)
  );
const queueRow = (title) => page.locator('div[draggable]', { hasText: title });

/**
 * What must hold on every page. Sideways: the document is no wider than the window, and nothing in it is either,
 * unless it sits in a container that scrolls sideways (a shelf, a wide chart in its card) or is a drawing (inside
 * an svg, a progress bar or anything aria-hidden, which clip their own artwork).
 * In the phone shell also: every control a finger can reach is at least 44px in its smaller dimension, no control
 * is invisible (the desktop reveals some on hover; a phone must show them), and no text is under 13px.
 * Not measured: a control marked data-tap-ok, whose 44px target is an ::after around it (text links on a line,
 * the ⓘ); a checkbox or radio in a label, where the label is the target; a link inside a sentence.
 */
function auditInPage(phoneShell) {
  const vw = window.innerWidth;
  const describe = (e) => {
    const cls = String(e.className?.baseVal ?? e.className ?? '')
      .split(' ')
      .filter(Boolean)
      .map((c) => c.replace(/^_/, '').replace(/_[a-z0-9]+_\d+$/i, ''))
      .slice(0, 2)
      .join('.');
    const label = e.getAttribute?.('aria-label') ?? (e.textContent ?? '').trim().slice(0, 30);
    return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${label}"`;
  };
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    return true;
  };
  const opacity = (e) => {
    let o = 1;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const scrollsSideways = (e) => {
    for (let n = e.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth) return true;
    }
    return false;
  };
  const problems = [];

  if (document.documentElement.scrollWidth > vw)
    problems.push(`sideways: the page is ${document.documentElement.scrollWidth}px wide in a ${vw}px window`);
  const wide = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.tagName === 'IMG' || e.closest('svg, [aria-hidden="true"], [role="progressbar"], [role="img"]')) continue;
    if (!shown(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.width > vw + 1 || r.right > vw + 1 || r.left < -1) && !scrollsSideways(e) && !wide.some((w) => w.contains(e))) {
      wide.push(e);
      problems.push(`sideways: ${describe(e)} runs from ${Math.round(r.left)} to ${Math.round(r.right)}`);
    }
  }
  if (!phoneShell) return problems;

  const controls =
    'button, a[href], input, select, textarea, [role=button], [role=tab], [role=menuitem], [role=slider], [role=link]';
  for (const e of document.querySelectorAll(controls)) {
    if (!shown(e) || e.disabled || e.hasAttribute('data-tap-ok')) continue;
    const style = getComputedStyle(e);
    if (style.pointerEvents === 'none') continue;
    if (opacity(e) < 0.05) {
      problems.push(`hidden control: ${describe(e)}`);
      continue;
    }
    const inSentence =
      style.display === 'inline' &&
      [...e.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (inSentence) continue;
    const target = (e.type === 'checkbox' || e.type === 'radio') && e.closest('label') ? e.closest('label') : e;
    const r = target.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 43.5)
      problems.push(`tap target: ${describe(e)} is ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // Safari zooms the page when a text field under 16px is focused.
  for (const e of document.querySelectorAll('input, textarea, select')) {
    if (!shown(e) || /^(checkbox|radio|range|button|submit|reset|file|hidden|color|image)$/.test(e.type)) continue;
    const size = parseFloat(getComputedStyle(e).fontSize);
    if (size < 15.99) problems.push(`text field under 16px: ${describe(e)} is ${size}px`);
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (!n.textContent.trim() || !p || seen.has(p) || p.closest('svg, script, style') || !shown(p)) continue;
    seen.add(p);
    const size = parseFloat(getComputedStyle(p).fontSize);
    if (size < 12.99) problems.push(`small text: ${describe(p)} is ${size}px`);
  }
  return problems;
}
async function audit(where) {
  // A page fades in as it opens (and a sheet rises): measure it once it has arrived, not part-way.
  if (phone)
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      return !main || getComputedStyle(main).opacity === '1';
    });
  await settle();
  // Rows can still be fading in (slower in WebKit than in Chromium): look again for up to 3 seconds.
  let problems = await page.evaluate(auditInPage, phone);
  for (let i = 0; i < 6 && problems.some((p) => p.startsWith('hidden control')); i++) {
    await page.waitForTimeout(500);
    problems = await page.evaluate(auditInPage, phone);
  }
  if (problems.length)
    throw new Error(
      `${where}: ${problems.length} problem(s)\n${[...new Set(problems)].slice(0, 8).join('\n')}${problems.length > 8 ? '\n…' : ''}`
    );
}

// ── the journeys ──
let phone = false;
/** A step that failed part-way can leave Now playing or a menu open: start the next one from a page with tabs. */
async function backToTheTabs() {
  if (!phone) return;
  await page.keyboard.press('Escape');
  if (!(await tab('/').isVisible())) await goTo('/');
}

await journey('open the demo and see what is playing', async () => {
  await page.goto(`${base}/demo`, { waitUntil: 'load' });
  await expectVisible(page.getByText('Demo', { exact: true }));
  await expectVisible(page.getByText('Crooked Shoreline'), 15000);
  phone = await page.evaluate(() => document.documentElement.dataset.shell === 'phone');
  if (touch && width < 800 && !phone) throw new Error('a phone-sized window did not get the phone shell');
  console.log(`      ${phone ? 'phone shell' : 'desktop layout'}, ${browser.browserType().name()}, ${width}x${height}`);
  if (safeArea && phone) {
    // The flag must really move the layout: measure the tab bar's gap to the screen's bottom and the top of the
    // page's first content with the insets on, switch them off, measure again, switch them back on.
    const measure = () =>
      page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Main"]');
        const first = document.querySelector('main *');
        return {
          top: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
          bottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom').trim(),
          navGap: Math.round(window.innerHeight - nav.getBoundingClientRect().bottom),
          contentTop: Math.round(first.getBoundingClientRect().top),
        };
      });
    const withInsets = await measure();
    await page.evaluate(() => (document.getElementById('journey-safe-area').media = 'not all'));
    await page.waitForTimeout(300);
    const without = await measure();
    await page.evaluate(() => (document.getElementById('journey-safe-area').media = 'all'));
    await page.waitForTimeout(300);
    console.log(`      insets on ${JSON.stringify(withInsets)}, off ${JSON.stringify(without)}`);
    if (withInsets.top !== '47px' || withInsets.bottom !== '34px')
      throw new Error(`--safe-area did not set the insets: ${JSON.stringify(withInsets)}`);
    if (withInsets.navGap === without.navGap && withInsets.contentTop === without.contentTop)
      throw new Error('--safe-area changed nothing in the layout: the tab bar and the content sit where they do without it');
  }
});

await journey('pause and resume', async () => {
  await press(transport('Pause'));
  await expectVisible(transport('Play'));
  await press(transport('Play'));
  await expectVisible(transport('Pause'));
});

await journey('change the volume', async () => {
  const slider = page.locator('input[aria-label="Volume"]');
  if (phone) {
    // The mini player opens Now playing, where the volume is one long slider.
    await press(page.locator('section[aria-label="Mini player"] button'));
    await expectHash(/^#\/now-playing$/);
    await expectVisible(slider);
    const before = Number(await slider.inputValue());
    const box = await slider.boundingBox();
    await press(slider, { position: { x: box.width * 0.8, y: box.height / 2 } });
    await page.waitForFunction((was) => Number(document.querySelector('input[aria-label="Volume"]').value) > was + 20, before);
    const set = Number(await slider.inputValue());
    // Leave and come back: the page then shows what the (pretend) speakers say, not what was dragged.
    await press(page.locator('button[aria-label="Close the player"]'));
    await expectVisible(page.locator('section[aria-label="Mini player"]'));
    await page.waitForTimeout(400);
    await press(page.locator('section[aria-label="Mini player"] button'));
    await expectVisible(slider);
    const now = Number(await slider.inputValue());
    if (now !== set) throw new Error(`the volume was set to ${set} and came back as ${now}`);
    await settle();
    await audit('Now playing');
    await press(page.locator('button[aria-label="Close the player"]'));
    await expectVisible(page.locator('section[aria-label="Mini player"]'));
  } else {
    await page.locator('button[aria-label="Mute"]').hover();
    await expectVisible(slider);
    const before = Number(await slider.inputValue());
    for (let i = 0; i < 5; i++) await page.locator('button[aria-label="Volume up"]').click();
    await page.waitForFunction((want) => Number(document.querySelector('input[aria-label="Volume"]').value) === want, before + 5);
    await page.mouse.move(10, 300);
  }
});

let queuedTitle = '';
let countBefore = 0;

await journey('search the catalogue and see results', async () => {
  await backToTheTabs();
  if (phone) {
    await press(tab('/queue'));
    await expectHash(/^#\/queue$/);
  }
  countBefore = await queueCount();
  if (phone) {
    await press(tab('/search'));
    await expectHash(/^#\/search/);
    // Opening the tab must not pop the keyboard: nothing has focus until the field is tapped.
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    if (focused === 'INPUT') throw new Error('the search field took focus when the Search tab opened');
  }
  const field = page.locator('[data-search-input]');
  await press(field);
  await field.pressSequentially(SEARCH_FOR, { delay: 20 });
  await expectHash(/^#\/search\?q=/);
  await expectVisible(page.locator('main').getByText(SEARCH_FOR, { exact: true }), 10000);
  if (phone) {
    // The keyboard is up: the dock steps aside, and comes back when the field is left.
    await expectGone(page.locator('nav[aria-label="Main"]:visible'));
    await field.press('Enter');
    await expectVisible(tab('/search'));
  }
  await settle();
  await audit('Search results');
});

await journey('open an album from the results', async () => {
  // The top result is the album itself: its card is one button.
  await press(page.locator(`main button[data-search-stop][aria-label*="${SEARCH_FOR}"]`));
  await expectHash(/^#\/album\//);
  await expectVisible(page.locator('main li button[aria-label^="Add "][aria-label$=" to queue"]'), 10000);
  await settle();
  await audit('Album');
});

await journey(`queue a track from it and see the queue grow, with ${VIEWER}'s name on it`, async () => {
  const add = page.locator('main li button[aria-label^="Add "][aria-label$=" to queue"]').first();
  queuedTitle = (await add.getAttribute('aria-label')).slice('Add '.length, -' to queue'.length);
  await press(add);
  if (phone) {
    await press(tab('/queue'));
    await expectHash(/^#\/queue$/);
  }
  await expectVisible(page.locator(`[aria-label="${countBefore + 1} tracks"]`));
  await page.waitForTimeout(300);
  await scrollQueue('end');
  await expectVisible(queueRow(queuedTitle));
  await expectVisible(queueRow(queuedTitle).locator(`button[aria-label="Queued by ${VIEWER}"]`));
});

await phoneJourney('move a queue row from its menu and see the order change', async () => {
  await scrollQueue('start');
  await page.waitForTimeout(400);
  // Two rows that are up next: the two after whatever is playing.
  const order = await queueOrder();
  const playing = await page.evaluate(() =>
    document.querySelector('[data-playing="true"] button[aria-label^="More for "]').getAttribute('aria-label').slice(9)
  );
  const at = order.indexOf(playing);
  const [first, second] = [order[at + 1], order[at + 2]];
  if (!first || !second) throw new Error(`fewer than two rows are up next (${order.join(', ')})`);
  await press(page.locator(`button[aria-label="More for ${first}"]`));
  await expectVisible(page.getByRole('menu'));
  await audit('The row menu (bottom sheet)');
  await press(menuItem('Move down'));
  await expectGone(page.getByRole('menu'));
  await page.waitForFunction(
    ([a, b]) => {
      const y = (t) => document.querySelector(`button[aria-label="More for ${t}"]`)?.getBoundingClientRect().top;
      return y(b) < y(a);
    },
    [first, second]
  );
  // And back to the front of the line with Play next.
  await press(page.locator(`button[aria-label="More for ${first}"]`));
  await press(menuItem('Play next'));
  await expectGone(page.getByRole('menu'));
  await page.waitForFunction(
    ([a, b]) => {
      const y = (t) => document.querySelector(`button[aria-label="More for ${t}"]`)?.getBoundingClientRect().top;
      return y(a) < y(b);
    },
    [first, second]
  );
});

await phoneJourney('a long press opens the same menu', async () => {
  await scrollQueue('start');
  await page.waitForTimeout(400);
  // A row in clear view: the list's own first row, above the fold and nowhere near the dock.
  const [title] = await queueOrder();
  const target = queueRow(title).getByText(title, { exact: true }).first();
  const box = await target.boundingBox();
  const point = { x: Math.round(box.x + 8), y: Math.round(box.y + box.height / 2) };
  if (browser.browserType().name() === 'chromium') {
    // A real finger held still: Chromium's own touch events, which become the pointer events the app listens for.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expectVisible(page.getByRole('menu'), 3000);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    // WebKit has no such driver here: send the pointer events a held finger makes.
    await target.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y });
    await expectVisible(page.getByRole('menu'), 3000);
    await target.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y });
  }
  // Lifting the finger must not close it (the click a touch trails is swallowed) or open anything else.
  await page.waitForTimeout(500);
  await expectVisible(page.getByRole('menu'));
  if ((await hash()) !== '#/queue') throw new Error(`the long press navigated to ${await hash()}`);
  await page.keyboard.press('Escape');
  await expectGone(page.getByRole('menu'));
});

await phoneJourney('remove a row from the queue and see it gone', async () => {
  const count = await queueCount();
  await scrollQueue('end');
  await press(page.locator(`button[aria-label="More for ${queuedTitle}"]`));
  await press(menuItem('Remove from queue'));
  await expectGone(page.locator(`button[aria-label="More for ${queuedTitle}"]`));
  await expectVisible(page.locator(`[aria-label="${count - 1} tracks"]`));
});

await phoneJourney('open the Leaderboard from More', async () => {
  await press(tab('/more'));
  await expectHash(/^#\/more$/);
  await audit('More');
  await press(page.getByRole('button', { name: 'Leaderboard', exact: true }));
  await expectHash(/^#\/leaderboard$/);
  await expectVisible(page.getByRole('heading', { name: 'Leaderboard' }), 20000);
  // Back is the round button at the top left, and returns to More.
  await press(page.locator('button[aria-label="Back"]'));
  await expectHash(/^#\/more$/);
});

await journey(`every page: nothing scrolls sideways${phone ? ', every target is 44px, no text under 13px' : ''}`, async () => {
  const routes = [
    ['Home', '/'],
    ['Search, empty', '/search'],
    ['Search', '/search?q=velvet'],
    ['Discover', '/discover'],
    ['Leaderboard', '/leaderboard'],
    ['Music stats', '/leaderboard/stats'],
    ['Queuedle', '/queuedle'],
    ['Queuedle stats', '/queuedle/stats'],
    ['Lyrics', '/lyrics'],
    ['Profile', '/profile/Tamsin%20Okoro-Vale'],
    ['Playlist', '/playlist/pl-focus'],
    ...(phone
      ? [
          ['Queue', '/queue'],
          ['Now playing', '/now-playing'],
          ['More', '/more'],
        ]
      : []),
  ];
  const failures = [];
  const check = async (name) => {
    await audit(name).catch((err) => failures.push(err.message));
    if (shots) await page.screenshot({ path: path.join(shots, `page-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
  };
  for (const [name, route] of routes) {
    await goTo(route);
    await check(name);
  }
  // The album, the artist and the shelf pages open with the item they were tapped from, so they are tapped to.
  await goTo('/search?q=velvet');
  await press(page.locator('main button[aria-label$=", open album"]'));
  await expectHash(/^#\/album\//);
  await settle();
  await check('Album');
  await press(page.locator('main').getByRole('button', { name: 'The Velvet Anchors', exact: true }));
  await expectHash(/^#\/artist\//);
  await page.waitForTimeout(1500);
  await check('Artist');
  await goTo('/');
  const tile = page.locator('main button[class*="tileMain"]').first();
  await page.evaluate(() => {
    const scroller = [...document.querySelectorAll('main *')].find(
      (e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)
    );
    scroller?.scrollTo(0, scroller.scrollHeight);
  });
  await tile.scrollIntoViewIfNeeded();
  await press(tile);
  await expectHash(/^#\/container\//);
  await settle();
  await check('Shelf (container)');
  if (failures.length) throw new Error(failures.join('\n'));
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
const what = `${width}x${height}${deviceName ? ` (${deviceName}, ${browser.browserType().name()})` : ''}${safeArea ? ' with safe areas' : ''}`;
console.log(
  failed
    ? `\n${failed} journey step(s) failed at ${what} against ${base}`
    : `\nAll journey steps passed at ${what} against ${base}${skipped ? ` (${skipped} phone-only step(s) skipped)` : ''}`
);
process.exit(failed ? 1 : 0);
