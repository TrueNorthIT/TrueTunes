// Repeatable renderer performance baseline over CDP (port 9333). Measures, never changes anything.
//   node scripts/perf-trace.mjs [out.json] [searchTerm]
//   node scripts/perf-trace.mjs perf-before.json love
// Reloads the renderer (playback is unaffected) with a React DevTools hook stub so React commits, re-rendered
// components and render time (dev-build actualDuration) can be counted, then runs a fixed scenario:
//   1. idle on Home for 10 s (and, if nothing is playing, 10 synthetic playback ticks: the same renderer-only state
//      update usePlayback's 1 s timer makes; it never reaches Sonos)
//   2. navigations Home → Search → Discover → Leaderboard → album → artist → container → playlist → Home
//   3. wheel-scroll the queue, the search results and the leaderboard
// Data vs render: React Query fetch spans (IPC → main → network) are timed in the page; a trivial IPC ping every
// 100 ms shows main-process stalls. All numbers come from the React *development* build, which renders slower than
// the packaged app, so compare runs with each other rather than with production.
// SAFETY: the app drives the office speakers. This script only sets the URL hash (history.pushState), wheels and
// hovers over scrollable lists, and reads the DOM. Never add clicks or key presses to it.
import { writeFileSync } from 'node:fs';

const [out = 'perf-trace.json', searchTerm = 'love'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing (as scripts/screenshot.mjs) ──────────────────────────────────
const targets = await (await fetch('http://localhost:9333/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5173') && !t.url.includes('#/mini'));
if (!page) throw new Error('App not found on CDP port 9333; is `npm run dev` running?');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((r, j) => {
    pending.set(++id, (m) => (m.error ? j(new Error(`${method}: ${m.error.message}`)) : r(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const call = (fn, ...args) => evaluate(`(${fn})(...${JSON.stringify(args)})`);

// ── In-page instrumentation, installed before any app script runs ─────────────
function instrument() {
  const P = (window.__perf = { commits: [], longtasks: [], loafs: [], resources: [], pings: [], frames: [], qc: null, open: {} });
  const PERFORMED_WORK = 1;
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]); // function, class, forwardRef, memo, simple memo
  const nameOf = (f) => {
    const t = f.type;
    if (typeof t === 'function') return t.displayName || t.name || 'Anonymous';
    if (t && typeof t === 'object') {
      const inner = t.render || t.type;
      return t.displayName || inner?.displayName || inner?.name || null;
    }
    return null;
  };
  // Components whose function ran in this commit. Subtrees React skipped keep the previous commit's child pointer
  // (fiber.child === fiber.alternate.child), so the walk only enters re-processed subtrees.
  const rendered = (root) => {
    const counts = {};
    const stack = [root.current];
    while (stack.length) {
      const f = stack.pop();
      if (COMPONENT_TAGS.has(f.tag) && (!f.alternate || f.flags & PERFORMED_WORK)) {
        const n = nameOf(f);
        if (n) counts[n] = (counts[n] || 0) + 1;
      }
      if (f.sibling) stack.push(f.sibling);
      if (f.child && (!f.alternate || f.child !== f.alternate.child)) stack.push(f.child);
    }
    return counts;
  };
  const findQueryClient = (root) => {
    const stack = [root.current];
    while (stack.length) {
      const f = stack.pop();
      const c = f.memoizedProps?.client;
      if (c && typeof c.getQueryCache === 'function') return c;
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return null;
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    checkDCE() {},
    inject(r) { const rid = this.renderers.size + 1; this.renderers.set(rid, r); return rid; },
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_rid, root) {
      try {
        const t = performance.now();
        P.commits.push({ t, dur: root.current.actualDuration ?? 0, counts: rendered(root) });
        if (!P.qc && (P.qc = findQueryClient(root))) {
          P.qc.getQueryCache().subscribe((e) => {
            if (e.type !== 'updated') return;
            const a = e.action.type, h = e.query.queryHash;
            if (a === 'fetch') P.open[h] = performance.now();
            else if ((a === 'success' || a === 'error') && P.open[h] != null) {
              P.resources.push({ kind: 'query', key: h.slice(0, 90), start: P.open[h], end: performance.now() });
              delete P.open[h];
            }
          });
        }
      } catch { /* never break the app */ }
    },
  };
  const observe = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch { /* unsupported */ } };
  observe('longtask', (e) => P.longtasks.push({ start: e.startTime, dur: e.duration }));
  observe('long-animation-frame', (e) => P.loafs.push({
    start: e.startTime, dur: e.duration, blocking: e.blockingDuration,
    scripts: e.scripts.map((s) => ({ dur: s.duration, layout: s.forcedStyleAndLayoutDuration, fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^.*\/src\//, 'src/').replace(/\?.*$/, ''), inv: s.invoker })),
  }));
  observe('resource', (e) => {
    if (e.initiatorType === 'fetch' && !e.name.startsWith(location.origin)) P.resources.push({ kind: 'image', key: e.name.slice(0, 90), start: e.startTime, end: e.responseEnd });
  });
  setInterval(() => {
    const s = performance.now();
    window.sonos?.getVersion().then(() => P.pings.push({ t: s, ms: performance.now() - s }));
  }, 100);
  const frame = (t) => { P.frames.push(t); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

// ── Page-side measuring helpers (evaluated per step) ──────────────────────────
// Everything a window [t0, t1] contains, summarised.
function summarise(t0, t1) {
  const P = window.__perf;
  const inW = (t) => t >= t0 && t <= t1;
  const commits = P.commits.filter((c) => inW(c.t));
  const lts = P.longtasks.filter((l) => inW(l.start));
  const frames = P.frames.filter(inW);
  const gaps = frames.slice(1).map((f, i) => f - frames[i]);
  const VSYNC_60HZ = 1000 / 60; // dropped frames are counted against 60 Hz whatever the display runs at
  const counts = {};
  for (const c of commits) for (const [k, v] of Object.entries(c.counts)) counts[k] = (counts[k] || 0) + v;
  const scripts = {};
  for (const l of P.loafs.filter((l) => inW(l.start))) for (const s of l.scripts) {
    const k = `${s.fn || '(anon)'} ${s.url} [${s.inv}]`;
    const a = (scripts[k] ??= { ms: 0, n: 0, layout: 0 });
    a.ms += s.dur; a.n++; a.layout += s.layout || 0;
  }
  const res = P.resources.filter((r) => r.start >= t0 && r.start <= t1);
  const union = (list) => {
    let total = 0, end = -Infinity;
    for (const r of [...list].sort((a, b) => a.start - b.start)) {
      const s = Math.max(r.start, end), e = Math.min(r.end, t1);
      if (e > s) total += e - s;
      end = Math.max(end, r.end);
    }
    return total;
  };
  const queries = res.filter((r) => r.kind === 'query'), images = res.filter((r) => r.kind === 'image');
  const pings = P.pings.filter((p) => inW(p.t));
  const overlapsLongTask = (p) => P.longtasks.some((l) => l.start < p.t + p.ms && l.start + l.dur > p.t);
  const r1 = (x) => Math.round(x * 10) / 10;
  return {
    ms: Math.round(t1 - t0),
    commits: commits.length,
    renderMs: r1(commits.reduce((s, c) => s + c.dur, 0)),
    longTasks: lts.length,
    longestTaskMs: Math.round(Math.max(0, ...lts.map((l) => l.dur))),
    longTaskMs: Math.round(lts.reduce((s, l) => s + l.dur, 0)),
    frames: frames.length,
    droppedFrames: gaps.reduce((s, g) => s + Math.max(0, Math.round(g / VSYNC_60HZ) - 1), 0),
    p95FrameMs: r1([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)] ?? 0),
    maxFrameMs: r1(Math.max(0, ...gaps)),
    queries: queries.length,
    queryWaitMs: Math.round(union(queries)),
    slowestQuery: queries.sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 3).map((q) => `${Math.round(q.end - q.start)}ms ${q.key}`),
    images: images.length,
    imagesDoneMs: images.length ? Math.round(Math.max(...images.map((i) => i.end)) - t0) : 0,
    ipcPingP50: r1([...pings.map((p) => p.ms)].sort((a, b) => a - b)[Math.floor(pings.length / 2)] ?? 0),
    ipcPingMax: r1(Math.max(0, ...pings.map((p) => p.ms))),
    mainStalls: pings.filter((p) => p.ms > 50 && !overlapsLongTask(p)).map((p) => Math.round(p.ms)),
    topComponents: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15),
    topScripts: Object.entries(scripts).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6).map(([k, v]) => `${Math.round(v.ms)}ms x${v.n}${v.layout > 1 ? ` (forced layout ${Math.round(v.layout)}ms)` : ''} ${k}`),
  };
}

// Navigate like the app does (pushState + popstate, carrying router state) and wait for the route to settle:
// at least one commit, no React Query fetch started since t0 still running, no skeleton/spinner in <main>,
// holding for 150 ms, and the route's panel component has rendered. firstContentMs = first frame after the route committed with no skeleton/spinner showing;
// clickToContentMs = first frame after the last commit before everything settled. toContent splits that span
// into React Query wait (IPC → main → play.sonos.com, as wall time) and React render time.
async function navigate(hash, state, panel) {
  const P = window.__perf;
  const t0 = performance.now();
  history.pushState({ usr: state ?? null, key: Math.random().toString(36).slice(2, 10), idx: (history.state?.idx ?? 0) + 1 }, '', hash);
  dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  const arrived = () => P.commits.some((c) => c.t > t0 && c.counts[panel]);
  const busy = () =>
    P.qc.getQueryCache().getAll().some((q) => q.state.fetchStatus === 'fetching' && P.open[q.queryHash] >= t0) ||
    !!document.querySelector('main [class*="skeleton"], main [class*="spinner"]') ||
    !arrived();
  const shown = () => arrived() && !document.querySelector('main [class*="skeleton"], main [class*="spinner"]');
  let quietSince = null, timedOut = false, firstShown = null;
  for (;;) {
    await new Promise((r) => setTimeout(r, 25));
    const now = performance.now();
    if (firstShown === null && shown()) firstShown = P.commits.filter((c) => c.t > t0).at(-1).t;
    if (busy()) quietSince = null;
    else if (quietSince === null) quietSince = now;
    else if (now - quietSince >= 150) break;
    if (now - t0 > 20000) { timedOut = true; break; }
  }
  const lastCommit = P.commits.filter((c) => c.t > t0 && c.t <= (quietSince ?? performance.now())).at(-1)?.t ?? t0;
  const paint = P.frames.find((f) => f > lastCommit) ?? lastCommit;
  const firstPaint = firstShown === null ? null : P.frames.find((f) => f > firstShown) ?? firstShown;
  const firstCommit = P.commits.find((c) => c.t > t0 && c.counts[panel]);
  const c = summarise(t0, paint);
  await new Promise((r) => setTimeout(r, 1500)); // let trailing images/effects land inside the window
  const s = summarise(t0, performance.now());
  return {
    hash, timedOut, arrived: arrived(), hashNow: location.hash,
    firstCommitMs: firstCommit ? Math.round(firstCommit.t - t0) : null,
    firstContentMs: firstPaint === null ? null : Math.round(firstPaint - t0),
    clickToContentMs: Math.round(paint - t0),
    toContent: { queryWaitMs: c.queryWaitMs, renderMs: c.renderMs, longTaskMs: c.longTaskMs, commits: c.commits, queries: c.queries },
    queryTimeline: P.resources.filter((r) => r.kind === 'query' && r.start >= t0 && r.start <= paint).map((r) => `${Math.round(r.start - t0)}→${Math.round(r.end - t0)} ${r.key.slice(0, 70)}`),
    ...s,
  };
}

// The scrollable element to wheel over: 'queue' or the main panel. Returns its centre (viewport CSS px) or null.
function scrollTarget(which) {
  const scrollable = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 20;
  const scope = which === 'queue' ? document.querySelector('[aria-label="Resize queue"]')?.parentElement : document.querySelector('main');
  if (!scope) return null;
  const el = [scope, ...scope.querySelectorAll('*')].filter(scrollable).sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
  if (!el) return null;
  el.scrollTop = 0;
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + Math.min(r.height / 2, 300));
  const hit = document.elementFromPoint(x, y);
  // Only wheel over the list itself, never a slider/seek/volume control.
  if (!hit || !el.contains(hit) || hit.closest('input, [role="slider"], [role="progressbar"], footer')) return null;
  window.__perf.scrollEl = el;
  return { x, y, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, rows: el.querySelectorAll('[draggable], li, [role="row"], button').length };
}

// ── Scenario ──────────────────────────────────────────────────────────────────
const report = { when: new Date().toISOString(), searchTerm, steps: [] };
const log = (...a) => console.error(...a);

await send('Page.enable');
await send('Page.bringToFront').catch(() => {});
await evaluate(`location.hash = '#/'`);
const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${instrument})()` });
await send('Page.reload');
log('reloaded; waiting for Home…');
await sleep(1000);
for (let i = 0; ; i++) {
  const ready = await evaluate(`!!(window.__perf?.qc?.getQueryData(['ytm-home']) && document.querySelector('main') && !document.querySelector('main [class*="skeleton"]'))`).catch(() => false);
  if (ready) break;
  if (i > 120) throw new Error('App did not reach Home within 60 s');
  await sleep(500);
}
await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
await evaluate(`window.summarise = ${summarise};`);
await sleep(4000); // let startup fetches and images settle

report.playing = await evaluate(`!!document.querySelector('button[aria-label="Pause"]')`);
report.nowPlaying = await evaluate(`document.querySelector('section[aria-label="Now playing"] button[aria-label^="Open album"]')?.getAttribute('aria-label') ?? null`);
report.queueLength = await evaluate(`Number(document.querySelector('[aria-label$=" tracks"]')?.textContent || 0)`);
// Display refresh interval, from a quiet second of frames.
report.refreshMs = await call(async () => {
  const P = window.__perf;
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 1000));
  const f = P.frames.filter((x) => x >= t0);
  const gaps = f.slice(1).map((x, i) => x - f[i]).sort((a, b) => a - b);
  P.refreshMs = gaps[Math.floor(gaps.length / 2)] || 16.7;
  return Math.round(P.refreshMs * 10) / 10;
});
log(`playing=${report.playing} refresh=${report.refreshMs}ms queue=${report.queueLength}`);

// 1. Idle on Home.
const idle = await call(async (ms) => {
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, ms));
  return summarise(t0, performance.now());
}, 10000);
idle.commitsPerSec = Math.round((idle.commits / (idle.ms / 1000)) * 10) / 10;
report.steps.push({ step: 'idle Home 10s', ...idle });
log('idle done');

// 1b. Not playing: replay the tick's state update 10 times (renderer state only, never Sonos).
if (!report.playing) {
  const tick = await call(async () => {
    const P = window.__perf;
    const rootEl = document.getElementById('root');
    const stack = [rootEl[Object.keys(rootEl).find((k) => k.startsWith('__reactContainer'))]];
    let hook = null;
    while (stack.length && !hook) {
      const f = stack.pop();
      if (f.type?.name === 'MainApp') {
        for (let h = f.memoizedState; h; h = h.next) {
          if (h.memoizedState && typeof h.memoizedState === 'object' && 'positionMs' in h.memoizedState && 'timeLabel' in h.memoizedState && h.queue?.dispatch) { hook = h; break; }
        }
      }
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    if (!hook) return null;
    const original = hook.memoizedState;
    const t0 = performance.now();
    const perTick = [];
    for (let i = 1; i <= 10; i++) {
      const c0 = P.commits.length;
      const s = performance.now();
      hook.queue.dispatch((prev) => {
        const pos = prev.positionMs + 1000, dur = prev.durationMs || 180000;
        return { ...prev, positionMs: pos, timeLabel: `${Math.floor(pos / 60000)}:${String(Math.floor(pos / 1000) % 60).padStart(2, '0')} / 3:00`, progressPct: (pos / dur) * 100 };
      });
      await new Promise((r) => setTimeout(r, 1000));
      const cs = P.commits.slice(c0);
      perTick.push({ commits: cs.length, renderMs: Math.round(cs.reduce((a, c) => a + c.dur, 0) * 10) / 10, lastCommitMs: cs.length ? Math.round(cs.at(-1).t - s) : null });
    }
    const sum = summarise(t0, performance.now());
    hook.queue.dispatch(() => original);
    return { ...sum, perTick };
  });
  if (tick) {
    tick.commitsPerTick = Math.round((tick.commits / 10) * 10) / 10;
    tick.renderMsPerTick = Math.round((tick.renderMs / 10) * 10) / 10;
    report.steps.push({ step: 'synthetic tick x10', ...tick });
  }
  log('synthetic tick done');
}

// 2. Navigations. Real ids come from the data Home already rendered (React Query cache), never from clicks.
const picks = await evaluate(`(() => {
  const y = window.__perf.qc.getQueryData(['ytm-home']);
  const found = {};
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 6) return;
    const t = o.resource?.type;
    if (t === 'ALBUM' && !found.album) found.album = o;
    else if (t === 'CONTAINER' && !found.container) found.container = o;
    else if (t === 'PLAYLIST' && !found.playlist) found.playlist = o;
    if (!t) for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(y, 0);
  return found;
})()`);
const route = (kind, item) => `#/${kind}/${encodeURIComponent(item.resource.id.objectId)}`;
const navs = [
  ['Search', `#/search?q=${encodeURIComponent(searchTerm)}`, null, null, 'SearchPanel'],
  ['Discover', '#/discover', null, null, 'DiscoverPanel'],
  ['Leaderboard', '#/leaderboard', null, null, 'LeaderboardPanel'],
  picks.album && ['Album', route('album', picks.album), { item: picks.album }, picks.album.title, 'AlbumPanel'],
  'artist',
  picks.container && ['Container', route('container', picks.container), { item: picks.container }, picks.container.title, 'ContainerPanel'],
  picks.playlist && ['Playlist', route('album', picks.playlist), { item: picks.playlist }, picks.playlist.title, 'AlbumPanel'],
  ['Home', '#/', null, null, 'HomePanel'],
].filter(Boolean);
for (const n of navs) {
  let [label, hash, state, title, panel] = n === 'artist' ? [] : n;
  if (n === 'artist') {
    // The album page's own artist link target (AlbumPanel.openArtist).
    const artist = picks.album && (await evaluate(`window.__perf.qc.getQueryData(['album', ${JSON.stringify(picks.album.resource.id.objectId)}])?.artistItem ?? null`));
    if (!artist?.resource?.id?.objectId) { report.steps.push({ step: 'nav Artist', skipped: 'album had no artistItem' }); continue; }
    [label, hash, state, title, panel] = ['Artist', route('artist', artist), { item: artist }, artist.title ?? artist.name, 'ArtistPanel'];
  }
  const r = await call(navigate, hash, state, panel);
  report.steps.push({ step: `nav ${label}`, title, ...r });
  log(`nav ${label}: ${r.clickToContentMs}ms${r.timedOut ? ` (timed out; arrived=${r.arrived} hash=${r.hashNow})` : ''}`);
  await sleep(500);
}

// 3. Scroll: wheel down then back up over each list, hovering only.
async function scroll(label, which, hash, panel) {
  if (hash) {
    await call(navigate, hash, null, panel);
    await sleep(1000);
  }
  const t = await call(scrollTarget, which);
  if (!t) { report.steps.push({ step: `scroll ${label}`, skipped: 'no safe scroll target' }); return; }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y });
  const t0 = await evaluate('performance.now()');
  for (const dir of [1, -1]) {
    for (let i = 0; i < 60; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: t.x, y: t.y, deltaX: 0, deltaY: 120 * dir });
      await sleep(40);
    }
  }
  await sleep(500);
  const s = await call((a) => summarise(a, performance.now()), t0);
  report.steps.push({ step: `scroll ${label}`, scrollHeight: t.scrollHeight, viewport: t.clientHeight, ...s });
  log(`scroll ${label}: dropped ${s.droppedFrames}/${s.frames}`);
}
await scroll('queue', 'queue');
await scroll('search results', 'main', `#/search?q=${encodeURIComponent(searchTerm)}`, 'SearchPanel');
await scroll('leaderboard', 'main', '#/leaderboard', 'LeaderboardPanel');
await call(navigate, '#/', null, 'HomePanel');

writeFileSync(out, JSON.stringify(report, null, 2));
ws.close();

// ── Compact report ────────────────────────────────────────────────────────────
console.log(`\n${report.when}  playing=${report.playing}  queue=${report.queueLength}  refresh=${report.refreshMs}ms  (React dev build)`);
const rows = report.steps.map((s) => ({
  step: s.step + (s.skipped ? ` (skipped: ${s.skipped})` : ''),
  '1st commit': s.firstCommitMs ?? '',
  '1st content': s.firstContentMs ?? '',
  'click→content': s.clickToContentMs ?? '',
  'data/render': s.toContent ? `${s.toContent.queryWaitMs}/${Math.round(s.toContent.renderMs)}` : '',
  commits: s.commits ?? '',
  'render ms': s.renderMs ?? '',
  'long tasks': s.longTasks !== undefined ? `${s.longTasks} / ${s.longestTaskMs}` : '',
  queries: s.queries ?? '',
  'imgs (done ms)': s.images !== undefined ? `${s.images} (${s.imagesDoneMs})` : '',
  dropped: s.frames ? `${s.droppedFrames}/${s.frames}` : '',
  'p95 frame': s.p95FrameMs ?? '',
  'ipc max': s.ipcPingMax ?? '',
}));
console.table(rows);
const idleStep = report.steps.find((s) => s.step.startsWith('idle'));
console.log(`idle commits/s: ${idleStep.commitsPerSec}`);
const tickStep = report.steps.find((s) => s.step.startsWith('synthetic'));
if (tickStep) console.log(`synthetic tick: ${tickStep.commitsPerTick} commits, ${tickStep.renderMsPerTick} ms render per tick; components per 10 ticks:`, tickStep.topComponents.map(([n, c]) => `${n}×${c}`).join(' '));
for (const s of report.steps.filter((x) => x.topScripts?.length)) console.log(`${s.step} top scripts: ${s.topScripts.join(' | ')}`);
console.log(`\nJSON written to ${out}`);
