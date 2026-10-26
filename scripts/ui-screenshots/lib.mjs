// Pure logic for the PR screenshot workflow: which stories a change affects, grouping diff pixels into boxes,
// placing the pointer, and the comment. No I/O here, so lib.test.mjs can cover it.

export const MARKER = '<!-- ui-screenshots -->';
export const MAX_STORIES = 20;

// The pointing man in .github/ui-screenshots/pointer.png: his size and his fingertip (he points left).
export const POINTER = { w: 561, h: 837, tipX: 59, tipY: 251 };

/**
 * Reverse import graph from Storybook's `--stats-json` (preview-stats.json): module -> modules that import it.
 * Paths are repo-relative without the leading "./", as `git diff --name-only` prints them.
 */
export function importersOf(stats) {
  const norm = (p) => p.replace(/^\.\//, '').replace(/\?.*$/, '');
  const importers = new Map();
  for (const m of stats.modules) {
    const name = norm(m.name ?? m.id);
    const set = importers.get(name) ?? new Set();
    for (const r of m.reasons ?? []) if (r.moduleName) set.add(norm(r.moduleName));
    importers.set(name, set);
  }
  return importers;
}

/**
 * Stories affected by the changed files, most relevant first, from both builds (so a deleted story still counts).
 * A changed file reaches a story file through the import graph; a file only the preview reaches (global.css) affects
 * every story. Ranked: pages first, then stories of a directly changed component, then the fewest import hops from a
 * changed file, then by title.
 */
export function affectedStories(changed, builds) {
  const changedSet = new Set(changed);
  const stories = new Map(); // id -> entry
  for (const { stats, index } of builds) {
    const importers = importersOf(stats);
    // Hops from any changed file, walking towards the importers.
    const hops = new Map();
    let frontier = changed.filter((f) => importers.has(f) || isStoryFile(f));
    frontier.forEach((f) => hops.set(f, 0));
    for (let d = 1; frontier.length; d++) {
      const next = [];
      for (const f of frontier)
        for (const i of importers.get(f) ?? [])
          if (!hops.has(i)) {
            hops.set(i, d);
            next.push(i);
          }
      frontier = next;
    }
    // Storybook's config or anything its preview imports (global.css) reaches every story.
    const everything = [...hops.keys(), ...changed].some((f) => /(^|\/)\.storybook\/(preview|main)\.[jt]sx?$/.test(f));
    for (const s of Object.values(index.entries)) {
      if (s.type !== 'story') continue;
      const file = s.importPath.replace(/^\.\//, '');
      const d = hops.get(file) ?? (everything || changedSet.has(file) ? 99 : undefined);
      if (d === undefined) continue;
      // The story's own component changed, or a file it imports directly (its CSS module).
      const component = s.componentPath?.replace(/^\.\//, '');
      const direct = component !== undefined && (hops.get(component) ?? 2) <= 1;
      const prev = stories.get(s.id);
      stories.set(s.id, {
        id: s.id,
        title: s.title,
        name: s.name,
        file,
        hops: Math.min(d, prev?.hops ?? d),
        direct: direct || !!prev?.direct,
      });
    }
  }
  const rank = (s) => (/^Pages\//.test(s.title) ? 0 : s.direct ? 1 : 2);
  return [...stories.values()].sort(
    (a, b) => rank(a) - rank(b) || a.hops - b.hops || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  );
}

const isStoryFile = (f) => /\.stories\.[jt]sx?$/.test(f);

/**
 * Groups changed pixels (mask[y * w + x] truthy) into at most `max` rectangles: changed pixels within `gap` of each
 * other share a box, each box gets `margin` on every side (clamped to the image), and overlapping boxes merge.
 */
export function groupBoxes(mask, w, h, { cell = 8, gap = 24, margin = 6, max = 6 } = {}) {
  const cw = Math.ceil(w / cell);
  const ch = Math.ceil(h / cell);
  const cells = new Map(); // cell index -> pixel bounds inside it
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const k = Math.floor(y / cell) * cw + Math.floor(x / cell);
      const b = cells.get(k);
      if (b) {
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y);
        b.y1 = Math.max(b.y1, y);
      } else cells.set(k, { x0: x, x1: x, y0: y, y1: y });
    }

  // Connected components over cells, where "connected" reaches `gap` pixels.
  const r = Math.ceil(gap / cell);
  const seen = new Set();
  let boxes = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const box = { ...cells.get(start) };
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      const cx = k % cw;
      const cy = (k - cx) / cw;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const n = ny * cw + nx;
          if (seen.has(n) || !cells.has(n)) continue;
          seen.add(n);
          stack.push(n);
          const b = cells.get(n);
          box.x0 = Math.min(box.x0, b.x0);
          box.x1 = Math.max(box.x1, b.x1);
          box.y0 = Math.min(box.y0, b.y0);
          box.y1 = Math.max(box.y1, b.y1);
        }
    }
    boxes.push({
      x0: Math.max(0, box.x0 - margin),
      y0: Math.max(0, box.y0 - margin),
      x1: Math.min(w - 1, box.x1 + margin),
      y1: Math.min(h - 1, box.y1 + margin),
    });
  }

  // Merge overlapping boxes, then the closest pair until there are few enough.
  const union = (a, b) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  });
  const dist = (a, b) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1) + Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  for (;;) {
    let best = null;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const d = dist(boxes[i], boxes[j]);
        if ((d === 0 || boxes.length > max) && (!best || d < best.d)) best = { i, j, d };
      }
    if (!best) break;
    const merged = union(boxes[best.i], boxes[best.j]);
    boxes = boxes.filter((_, k) => k !== best.i && k !== best.j).concat(merged);
  }
  return boxes
    .map(({ x0, y0, x1, y1 }) => ({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
}

/**
 * Where the pointing man goes: right of the box with his fingertip on its right edge, or mirrored on the left when
 * he would run off the image. Scaled to the box, clamped so he stays recognisable without swallowing the picture.
 */
export function placePointer(box, imgW, imgH) {
  // About twice the box's height: 170 to 500px tall.
  const scale = Math.min(0.6, Math.max(0.2, (box.h * 2) / POINTER.h));
  const w = POINTER.w * scale;
  const tipY = Math.min(box.y + box.h / 2, box.y + box.h - 1);
  // Keep his head on the image where the box allows it, but never move the fingertip off the box.
  const top = Math.min(Math.max(tipY - POINTER.tipY * scale, 0), box.y + box.h - 1 - POINTER.tipY * scale);
  const right = box.x + box.w - POINTER.tipX * scale;
  if (right + w <= imgW || box.x < imgW - (box.x + box.w)) return { x: right, y: top, scale, mirror: false };
  return { x: box.x - w + POINTER.tipX * scale, y: top, scale, mirror: true };
}

/**
 * The PR comment. `results` are the screenshotted stories in rank order:
 * { id, title, name, status: 'changed' | 'unchanged' | 'new' | 'deleted' }; `url(file)` makes an image URL.
 */
export function buildComment({ results, more, sha, base, url, pointer }) {
  const label = (s) => `${s.title} › ${s.name}`;
  const shown = results.filter((s) => s.status !== 'unchanged');
  const same = results.filter((s) => s.status === 'unchanged');
  const lines = [MARKER, '### UI screenshots', ''];
  if (pointer) lines.push(`![Biggest change: ${label(pointer.story)}](${url('pointer.png')})`, '');
  const counts = ['changed', 'new', 'deleted', 'unchanged']
    .map((k) => [k, results.filter((s) => s.status === k).length])
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${k === 'unchanged' ? 'with no visual change' : k}`);
  lines.push(
    `${results.length + more} ${results.length + more === 1 ? 'story is' : 'stories are'} affected at ${sha}` +
      `${more ? `; of the ${results.length} most relevant` : ''}: ${counts.join(', ')}.` +
      ' Changed areas are boxed in red.',
    ''
  );
  for (const s of shown) {
    lines.push(`#### ${label(s)}${s.status === 'changed' ? '' : ` (${s.status})`}`, '');
    if (s.status === 'changed')
      lines.push(
        `| Before (${base}) | After (this PR) |`,
        '| --- | --- |',
        `| ![before](${url(`${s.id}-before.png`)}) | ![after](${url(`${s.id}-after.png`)}) |`
      );
    else if (s.status === 'new')
      lines.push('| After (this PR) |', '| --- |', `| ![after](${url(`${s.id}-after.png`)}) |`);
    else lines.push(`| Before (${base}) |`, '| --- |', `| ![before](${url(`${s.id}-before.png`)}) |`);
    lines.push('');
  }
  if (same.length) lines.push(`**No visual change:** ${same.map(label).join(', ')}`, '');
  if (more) lines.push(`…and ${more} more affected ${more === 1 ? 'story' : 'stories'}, not screenshotted.`, '');
  return lines.join('\n');
}
