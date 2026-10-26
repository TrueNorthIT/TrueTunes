// Before/after screenshots of the stories a change affects, for the PR comment (.github/workflows/ui-screenshots.yml).
//   node scripts/ui-screenshots/run.mjs --base <storybook build> --head <storybook build> --changed <file list>
//     --out <dir> --sha <short sha> --base-name <branch> --url <image URL prefix>
// Both builds come from `storybook build --stats-json`. Writes the images and comment.md to --out, or nothing when no
// story is affected. Static builds only, served from disk: no Electron, nothing reaches Sonos.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { affectedStories, buildComment, groupBoxes, placePointer, MAX_STORIES, POINTER } from './lib.mjs';

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

async function shoot(which, id) {
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
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
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
  const before = has('base', s.id) && (await shoot('base', s.id));
  const after = has('head', s.id) && (await shoot('head', s.id));
  if (before && after) {
    const { width: w, height: h } = after;
    const diff = new Uint8Array(w * h * 4);
    const count = pixelmatch(before.data, after.data, diff, w, h, { threshold: 0.1, diffMask: true });
    if (!count) {
      results.push({ ...s, status: 'unchanged' });
      continue;
    }
    // diffMask paints changed pixels red and anti-aliasing yellow; only the red ones count.
    const mask = new Uint8Array(w * h).map((_, i) => diff[i * 4 + 3] && !diff[i * 4 + 1]);
    const boxes = groupBoxes(mask, w, h);
    drawBoxes(after, boxes);
    save(`${s.id}-before.png`, before);
    save(`${s.id}-after.png`, after);
    results.push({ ...s, status: 'changed', count, boxes });
  } else if (after) {
    save(`${s.id}-after.png`, after);
    results.push({ ...s, status: 'new' });
  } else {
    save(`${s.id}-before.png`, before);
    results.push({ ...s, status: 'deleted' });
  }
  console.log(`${results.at(-1).status.padEnd(9)} ${s.id}`);
}

// The opener: the biggest change, with the pointing man beside its biggest box.
const biggest = results.filter((r) => r.status === 'changed').sort((a, b) => b.count - a.count)[0];
if (biggest) {
  const box = biggest.boxes[0];
  const p = placePointer(box, WIDTH, HEIGHT);
  const img = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  await page.setContent(
    `<body style="margin:0"><img src="${img(join(args.out, `${biggest.id}-after.png`))}" style="display:block">` +
      `<img src="${img(fileURLToPath(new URL('../../.github/ui-screenshots/pointer.png', import.meta.url)))}"` +
      ` style="position:absolute;left:${p.x}px;top:${p.y}px;width:${POINTER.w * p.scale}px;` +
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
