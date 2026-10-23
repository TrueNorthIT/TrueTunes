import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Guard: every colour in renderer CSS comes from a token declared in global.css / depth.css.
// Write rgba(var(--tint), a) or var(--x) instead. Masks read alpha only, so black/white there is fine.

const SRC = join(__dirname, '..');
const TOKEN_FILES = ['styles/global.css', 'styles/depth.css'];
const RAW_COLOUR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]|\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|silver|navy|teal|maroon|lime|aqua|cyan|magenta)\b/g;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );
}

describe('CSS colour tokens', () => {
  it('has no raw colours outside global.css / depth.css', () => {
    const found: string[] = [];
    for (const file of cssFiles(SRC)) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (TOKEN_FILES.includes(rel)) continue;
      // Blank out comments but keep newlines, so line numbers stay true.
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
      for (const d of text.matchAll(/(?:^|[{;}])\s*([\w-]+)\s*:([^;{}]*)/g)) {
        if (/mask/.test(d[1])) continue; // REQ-C8: masks read alpha only
        for (const c of d[2].matchAll(RAW_COLOUR)) {
          const at = (d.index ?? 0) + d[0].length - d[2].length + (c.index ?? 0);
          const line = text.slice(0, at).split('\n').length;
          found.push(`${rel}:${line} ${d[1]}: ${c[0]}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
