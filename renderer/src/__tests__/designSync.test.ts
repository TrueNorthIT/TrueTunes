import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guard: the tokens in global.css / depth.css and the tokens named in DESIGN.md stay in step.
//  - Every custom property declared in the CSS is named (as a backticked `--name`) in DESIGN.md.
//  - Every backticked `--name` in DESIGN.md is declared in the CSS, bar the exemptions below.
//  - Every front matter radius, type and colour entry has a CSS token behind it.
// Fix a failure by documenting the token in DESIGN.md (the "Token Index" section), not by exempting it.

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = ['renderer/src/styles/global.css', 'renderer/src/styles/depth.css'].map((f) => strip(read(f))).join('\n');
const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const md = read('DESIGN.md').replace(/\r\n/g, '\n');
const front = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? '';
const body = md.slice(front.length);
const documented = new Set<string>();
for (const span of body.matchAll(/`([^`]+)`/g))
  for (const n of span[1].matchAll(/--[a-z][\w-]*/g)) documented.add(n[0]);

// Named in DESIGN.md but deliberately not declared in the global token files: set at runtime or local to one surface.
const DOC_ONLY = new Set([
  '--wash', // runtime artwork accent, passed in by useDominantColor
  '--panel-color', // runtime artwork accent on the shell body
  '--right', // Queuedle's mint, local to Queuedle.module.css
]);

// Declared but not worth documenting: internal helper variables. Keep this empty if you can.
const CSS_ONLY = new Set<string>([]);

/** The front matter's block under `key:`, as { entry: true } for its two-space-indented children. */
const frontKeys = (key: string) => {
  const block = new RegExp(`^${key}:\\n((?:  .*\\n?)*)`, 'm').exec(front + '\n')?.[1] ?? '';
  return [...block.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]);
};

// Front matter names are semantic; these are their CSS tokens. null = composed in place from --tint, no token.
const COLOUR_TOKEN: Record<string, string | null> = {
  label: '--label',
  tint: '--tint',
  'after-hours-navy': '--bg',
  'raised-navy': '--bg-1',
  wall: '--surface',
  'wall-lit': '--surface-hi',
  'tint-fill': '--row-hover',
  'tint-chip': null,
  separator: '--separator',
  border: '--border',
  'border-strong': '--border-2',
  'frosted-navy': '--material-bg',
  'label-secondary': '--label-2',
  'label-tertiary': '--text-3',
  'title-rest': '--title-rest',
  'on-art': '--on-art',
  'on-art-secondary': '--on-art-2',
  'caption-scrim': '--scrim-art',
  danger: '--danger',
};
const TYPE_TOKEN: Record<string, string> = { 'body-prose': '--fs-prose' }; // others are --fs-<name>

describe('DESIGN.md and the CSS tokens agree', () => {
  it('documents every declared token', () => {
    expect([...declared].filter((n) => !documented.has(n) && !CSS_ONLY.has(n))).toEqual([]);
  });

  it('declares every token DESIGN.md names', () => {
    expect([...documented].filter((n) => !declared.has(n) && !DOC_ONLY.has(n))).toEqual([]);
  });

  it('has a CSS radius behind every front matter radius', () => {
    expect(frontKeys('rounded').filter((k) => !declared.has(`--r-${k}`))).toEqual([]);
  });

  it('has a CSS type token behind every front matter type role', () => {
    expect(frontKeys('typography').filter((k) => !declared.has(TYPE_TOKEN[k] ?? `--fs-${k}`))).toEqual([]);
  });

  it('maps every front matter colour to a CSS token', () => {
    const unmapped = frontKeys('colors').filter((k) => !(k in COLOUR_TOKEN));
    const missing = Object.entries(COLOUR_TOKEN).filter(
      ([k, v]) => frontKeys('colors').includes(k) && v && !declared.has(v)
    );
    expect({ unmapped, missing }).toEqual({ unmapped: [], missing: [] });
  });
});
