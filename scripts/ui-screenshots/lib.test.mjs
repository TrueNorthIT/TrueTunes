import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedStories, buildComment, groupBoxes, MARKER, placePointer, POINTER } from './lib.mjs';

function mask(w, h, rects) {
  const m = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 1;
  return m;
}

test('groupBoxes: nearby pixels share a box with a margin, distant ones get their own', () => {
  // Two specks 10px apart (one box), and one far away.
  const boxes = groupBoxes(
    mask(400, 300, [
      [10, 10, 12, 12],
      [22, 10, 24, 12],
      [300, 200, 349, 219],
    ]),
    400,
    300
  );
  assert.deepEqual(boxes, [
    { x: 294, y: 194, w: 62, h: 32 },
    { x: 4, y: 4, w: 27, h: 15 },
  ]);
});

test('groupBoxes: margins clamp to the image and the count is capped', () => {
  const specks = Array.from({ length: 10 }, (_, i) => [i * 40, 0, i * 40, 0]);
  const boxes = groupBoxes(mask(400, 20, specks), 400, 20, { max: 3 });
  assert.equal(boxes.length, 3);
  for (const b of boxes) assert.ok(b.x >= 0 && b.y === 0 && b.x + b.w <= 400);
  assert.deepEqual(groupBoxes(new Uint8Array(100), 10, 10), []);
});

test('placePointer: fingertip on the right edge of the box, mirrored when he would fall off', () => {
  const box = { x: 100, y: 300, w: 200, h: 100 };
  const p = placePointer(box, 1280, 800);
  assert.equal(p.mirror, false);
  assert.equal(p.x + POINTER.tipX * p.scale, 300); // fingertip x = box right edge
  assert.equal(p.y + POINTER.tipY * p.scale, 350); // fingertip y = box middle

  const m = placePointer({ x: 1000, y: 300, w: 250, h: 100 }, 1280, 800);
  assert.equal(m.mirror, true);
  assert.equal(m.x + POINTER.w * m.scale - POINTER.tipX * m.scale, 1000); // mirrored fingertip on the left edge

  assert.equal(placePointer({ x: 0, y: 0, w: 10, h: 2 }, 1280, 800).scale, 0.2); // clamped
});

test('affectedStories: walks the import graph, preview-only files affect everything, pages first', () => {
  const stats = {
    modules: [
      {
        name: './renderer/src/components/common/TrackRow.tsx',
        reasons: [
          { moduleName: './renderer/src/components/common/TrackRow.stories.tsx' },
          { moduleName: './renderer/src/pages/AlbumPage.tsx' },
          { moduleName: './renderer/src/components/common/ContextMenu.stories.tsx' },
        ],
      },
      {
        name: './renderer/src/pages/AlbumPage.tsx',
        reasons: [{ moduleName: './renderer/src/pages/AlbumPage.stories.tsx' }],
      },
      { name: './renderer/src/styles/global.css', reasons: [{ moduleName: './renderer/.storybook/preview.tsx' }] },
    ],
  };
  const entry = (id, title, file) => ({
    type: 'story',
    id,
    title,
    name: id,
    importPath: `./renderer/src/${file}.stories.tsx`,
    componentPath: `./renderer/src/${file}.tsx`,
  });
  const index = {
    entries: {
      // ContextMenu's story renders a TrackRow but isn't TrackRow's own story, so it ranks after it.
      c: entry('c', 'Common/ContextMenu', 'components/common/ContextMenu'),
      a: entry('a', 'Common/TrackRow', 'components/common/TrackRow'),
      p: entry('p', 'Pages/Album', 'pages/AlbumPage'),
      x: entry('x', 'Common/Other', 'components/common/Other'),
    },
  };
  const ids = (changed) => affectedStories(changed, [{ stats, index }]).map((s) => s.id);
  assert.deepEqual(ids(['renderer/src/components/common/TrackRow.tsx']), ['p', 'a', 'c']);
  assert.deepEqual(ids(['README.md', 'src/main.ts']), []);
  assert.deepEqual(ids(['renderer/src/styles/global.css']).sort(), ['a', 'c', 'p', 'x']);
  assert.deepEqual(ids(['renderer/src/components/common/Other.stories.tsx']), ['x']);
});

test('buildComment: marker first, before/after for changes, one column for new, a list for unchanged', () => {
  const s = (id, status) => ({ id, title: 'Common/TrackRow', name: id, status });
  const body = buildComment({
    results: [s('changed', 'changed'), s('added', 'new'), s('same', 'unchanged')],
    more: 2,
    sha: 'abc1234',
    base: 'main',
    url: (f) => `u/${f}`,
    pointer: { story: s('changed', 'changed') },
  });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /!\[Biggest change: Common\/TrackRow › changed\]\(u\/pointer\.png\)/);
  assert.match(body, /\| !\[before\]\(u\/changed-before\.png\) \| !\[after\]\(u\/changed-after\.png\) \|/);
  assert.match(body, /#### Common\/TrackRow › added \(new\)\n\n\| After \(this PR\) \|/);
  assert.doesNotMatch(body, /added-before/);
  assert.match(body, /\*\*No visual change:\*\* Common\/TrackRow › same/);
  assert.match(body, /5 stories are affected at abc1234/);
  assert.match(body, /and 2 more affected stories/);
});
