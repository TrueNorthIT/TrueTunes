// Before/after screenshots of the stories a change affects, for the PR comment (.github/workflows/ui-screenshots.yml).
//   node scripts/ui-screenshots/run.mjs --base <storybook build> --head <storybook build> --changed <file list>
//     --out <dir> --sha <short sha> --base-name <branch> --url <image URL prefix>
// Both builds come from `storybook build --stats-json`. Writes the images and comment.md to --out, or nothing when no
// story is affected. Shots are taken at 1280x800 and cropped to what the story shows. Static builds only, served from
// disk: no Electron, nothing reaches Sonos.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { affectedStories, buildComment, cropBox, groupBoxes, placePointer, MAX_STORIES, POINTER } from './lib.mjs';

const { values: args } = parseArgs({
  options: Object.fromEntries(
    ['base', 'head', 'changed', 'out', 'sha', 'base-name', 'url'].map((k) => [k, { type: 'string' }])
  ),
});
const WIDTH = 1280;
const HEIGHT = 800;
const BOX = [255, 59, 48]; // red outline round each changed area

const changed = readFileSync(args.changed, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const load = (dir) => ({
  dir,
  stats: JSON.parse(readFileSync(join(dir, 'preview-stats.json'), 'utf8')),
  index: JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')),
});
const builds = { base: load(args.base), head: load(args.head) };
const affected = affectedStories(changed, [builds.head, builds.base]);
if (!affected.length) {
  console.log('No story is affected by this change.');
  process.exit(0);
}
const top = affected.slice(0, MAX_STORIES);
mkdirSync(args.out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  // Dates and times (toLocaleDateString) format the same on every runner.
  locale: 'en-GB',
  timezoneId: 'Europe/London',
});
// Relative times ("3 min ago") and dated charts render the same on every run.
await context.clock.setFixedTime(new Date('2026-01-15T12:00:00Z'));
// Each build is its own origin, served straight from disk; everything else is refused.
await context.route('**/*', (route) => {
  const url = new URL(route.request().url());
  const build = { 'base.storybook': builds.base, 'head.storybook': builds.head }[url.hostname];
  const file = build && join(build.dir, decodeURIComponent(url.pathname));
  if (file && extname(file) && existsSync(file)) return route.fulfill({ path: file });
  return route.fulfill({ status: 404 });
});
const page = await context.newPage();

async function shoot(which, { id, title }) {
  await page.goto(`http://${which}.storybook/iframe.html?id=${id}&viewMode=story`);
  await page
    .waitForFunction(
      () =>
        document.body.classList.contains('sb-show-errordisplay') ||
        window.__STORYBOOK_PREVIEW__?.storyRenders?.some((r) => ['finished', 'errored', 'aborted'].includes(r.phase)),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => console.warn(`${which} ${id}: no render-finished signal in 15s; screenshotting anyway`));
  // Page stories keep loading from the mock backend after the first render (and Home has a 1.5 s timer).
  if (/^Pages\//.test(title)) {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    // A lazy image off screen never loads, so its decode() never settles: wait for the visible ones, at most 5 s.
    const onScreen = (i) => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const images = [...document.images].filter((i) => i.loading !== 'lazy' || onScreen(i));
    await Promise.race([
      Promise.all(images.map((i) => i.decode().catch(() => {}))),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  return PNG.sync.read(await page.screenshot({ animations: 'disabled', caret: 'hide' }));
}

function drawBoxes(png, boxes) {
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const i = (y * png.width + x) * 4;
    [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]] = [...BOX, 255];
  };
  for (const { x, y, w, h } of boxes)
    for (let t = 0; t < 3; t++) {
      for (let i = x; i < x + w; i++) (set(i, y + t), set(i, y + h - 1 - t));
      for (let j = y; j < y + h; j++) (set(x + t, j), set(x + w - 1 - t, j));
    }
}

const has = (which, id) => builds[which].index.entries[id]?.type === 'story';
const save = (name, png) => writeFileSync(join(args.out, name), PNG.sync.write(png));
const results = [];
for (const s of top) {
  const started = Date.now();
  const shots = [has('base', s.id) && (await shoot('base', s)), has('head', s.id) && (await shoot('head', s))];
  // Both cropped to the same rectangle round whatever either one shows.
  const crop = cropBox(shots.filter(Boolean));
  const [before, after] = shots.map((png) => {
    if (!png) return png;
    const out = new PNG({ width: crop.w, height: crop.h });
    PNG.bitblt(png, out, crop.x, crop.y, crop.w, crop.h, 0, 0);
    return out;
  });
  if (before && after) {
    const { width: w, height: h } = after;
    const diff = new Uint8Array(w * h * 4);
    const count = pixelmatch(before.data, after.data, diff, w, h, { threshold: 0.1, diffMask: true });
    // diffMask paints changed pixels red and anti-aliasing yellow; only the red ones count.
    const mask = new Uint8Array(w * h).map((_, i) => diff[i * 4 + 3] && !diff[i * 4 + 1]);
    const boxes = count ? groupBoxes(mask, w, h) : [];
    if (!boxes.length) results.push({ ...s, status: 'unchanged' });
    else {
      drawBoxes(after, boxes);
      save(`${s.id}-before.png`, before);
      save(`${s.id}-after.png`, after);
      results.push({ ...s, status: 'changed', count, boxes, w, h, crop, bg: [...after.data.subarray(0, 3)] });
    }
  } else if (after) {
    save(`${s.id}-after.png`, after);
    results.push({ ...s, status: 'new' });
  } else {
    save(`${s.id}-before.png`, before);
    results.push({ ...s, status: 'deleted' });
  }
  console.log(`${results.at(-1).status.padEnd(9)} ${s.id} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

// The opener: the biggest change, with the pointing man beside its biggest box.
const biggest = results.filter((r) => r.status === 'changed').sort((a, b) => b.count - a.count)[0];
if (biggest) {
  const { w, h, bg, crop } = biggest;
  // He goes on the right unless he'd run off the right of the full-width screenshot; the canvas then grows (in the
  // page's background colour) to fit all of him round the cropped picture.
  const p = placePointer(biggest.boxes[0], WIDTH - crop.x, h);
  const man = { x: p.x, y: p.y, w: POINTER.w * p.scale, h: POINTER.h * p.scale };
  const ox = Math.max(0, -man.x);
  const oy = Math.max(0, -man.y);
  const width = Math.ceil(Math.max(w, man.x + man.w) + ox);
  const height = Math.ceil(Math.max(h, man.y + man.h) + oy);
  const img = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<body style="margin:0;background:rgb(${bg})">` +
      `<img src="${img(join(args.out, `${biggest.id}-after.png`))}" style="position:absolute;left:${ox}px;top:${oy}px">` +
      `<img src="${img(fileURLToPath(new URL(`../../${POINTER.file}`, import.meta.url)))}"` +
      ` style="position:absolute;left:${man.x + ox}px;top:${man.y + oy}px;width:${man.w}px;` +
      `${p.mirror ? 'transform:scaleX(-1)' : ''}"></body>`
  );
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.screenshot({ path: join(args.out, 'pointer.png') });
}
await browser.close();

const body = buildComment({
  results,
  more: affected.length - top.length,
  sha: args.sha,
  base: args['base-name'],
  url: (f) => `${args.url}${f}?raw=true`,
  pointer: biggest && { story: biggest },
});
writeFileSync(join(args.out, 'comment.md'), body);
console.log(`${results.length} screenshotted, ${affected.length - top.length} more affected; wrote ${args.out}`);
