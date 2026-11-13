// What the browser really does with the phone shell's layout, as plain rows for the diagnostics page.
// The owner's installed iPhone shows a gap under the tab bar that emulated insets do not reproduce, so this reads the
// phone's own numbers. Measurements only: no tokens, no URLs.

export type Row = [label: string, value: string];

const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const wh = (w: number, h: number) => `${Math.round(w * 10) / 10} x ${Math.round(h * 10) / 10}`;

/** A hidden element with the given inline styles, measured and removed. */
function probe<T>(css: Partial<CSSStyleDeclaration>, read: (el: HTMLElement) => T, parent: HTMLElement): T {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', ...css });
  parent.appendChild(el);
  try {
    return read(el);
  } finally {
    el.remove();
  }
}

function rect(label: string, el: Element | null | undefined): Row {
  if (!el) return [label, 'not found'];
  const r = el.getBoundingClientRect();
  return [label, `top ${px(r.top)}, bottom ${px(r.bottom)}, height ${px(r.height)}`];
}

export function measureLayout(): { rows: Row[]; derived: string[] } {
  const root = document.documentElement;
  const rows: Row[] = [];
  const vv = window.visualViewport;
  const nav = navigator as Navigator & { standalone?: boolean };

  rows.push(['screen', `${wh(screen.width, screen.height)} at ${window.devicePixelRatio}x`]);
  rows.push(['window inner', wh(window.innerWidth, window.innerHeight)]);
  rows.push(['documentElement client', wh(root.clientWidth, root.clientHeight)]);
  rows.push([
    'visualViewport',
    vv
      ? `${wh(vv.width, vv.height)}, offsetTop ${px(vv.offsetTop)}, pageTop ${px(vv.pageTop)}, scale ${vv.scale}`
      : 'not available',
  ]);
  rows.push([
    'standalone',
    `display-mode ${window.matchMedia('(display-mode: standalone)').matches}, navigator.standalone ${String(nav.standalone)}`,
  ]);

  // The one place raw env() is allowed: these are the browser's own values, not our tokens.
  const env = probe(
    {
      padding:
        'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
    },
    (el) => {
      const c = getComputedStyle(el);
      return `top ${c.paddingTop}, right ${c.paddingRight}, bottom ${c.paddingBottom}, left ${c.paddingLeft}`;
    },
    root
  );
  rows.push(['env(safe-area-inset-*)', env]);

  const cs = getComputedStyle(root);
  for (const t of [
    '--safe-top',
    '--safe-bottom',
    '--safe-top-extra',
    '--phone-top',
    '--dock-h',
    '--dock-pad',
    '--player-h',
    '--status-h',
  ]) {
    // a token is a length expression: measure what it resolves to
    const v = probe({ height: `var(${t})` }, (el) => el.getBoundingClientRect().height, root);
    rows.push([t, `${px(v)} (${cs.getPropertyValue(t).trim() || 'unset'})`]);
  }

  // Lengths as the browser resolves them. An absolute probe on the root takes `100%` of the initial containing block.
  for (const len of ['100vh', '100dvh', '100svh', '100lvh', '100%']) {
    const h = probe(
      { top: '0', left: '0', width: '1px', height: len },
      (el) => el.getBoundingClientRect().height,
      root
    );
    rows.push([`height ${len}`, px(h)]);
  }

  const q = (sel: string) => document.querySelector(sel);
  const dock = q('[data-diag="dock"]');
  const tabs = q('[data-diag="tabs"]');
  const lastLabel = tabs?.lastElementChild?.lastElementChild ?? null;
  rows.push(rect('#root', q('#root')));
  rows.push(rect('shell', q('[data-diag="shell"]')));
  rows.push(rect('dock', dock));
  rows.push(rect('mini player', q('[data-diag="mini"]')));
  rows.push(rect('tab bar', tabs));
  rows.push(rect('last tab label', lastLabel));
  for (const [name, el] of [
    ['dock', dock],
    ['tab bar', tabs],
  ] as const) {
    if (!el) continue;
    const c = getComputedStyle(el);
    rows.push([`${name} style`, `padding-bottom ${c.paddingBottom}, bottom ${c.bottom}`]);
  }

  const bottom = window.innerHeight;
  const derived = [
    lastLabel
      ? `gap under the tab labels: ${px(bottom - lastLabel.getBoundingClientRect().bottom)}`
      : 'gap under the tab labels: no tab bar on this page',
    dock
      ? `dock bottom to viewport bottom: ${px(bottom - dock.getBoundingClientRect().bottom)}`
      : 'dock bottom to viewport bottom: no dock on this page',
  ];
  return { rows, derived };
}
