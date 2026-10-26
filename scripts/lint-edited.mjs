// PostToolUse hook (Edit|Write): lint the file Claude just edited, so design-system and lint errors
// come back in the same turn. Reads the hook JSON on stdin; exit 2 + stderr tells Claude to fix them.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let input = '';
for await (const chunk of process.stdin) input += chunk;

let file;
try {
  file = JSON.parse(input).tool_input?.file_path;
} catch {
  process.exit(0); // not our payload: never block
}
if (!file || !existsSync(file)) process.exit(0);

const fromHere = relative(here, resolve(file));
if (fromHere.startsWith('..') || fromHere.split(sep).includes('node_modules')) process.exit(0);

// Lint from the checkout that owns the file: a worktree under .claude/worktrees/ has its own config, and its own
// binaries unless it has no node_modules yet. The walk stops at `here` at the latest, which has the config.
let root = dirname(resolve(file));
while (!existsSync(join(root, 'eslint.config.mjs'))) root = dirname(root);
const bin = existsSync(join(root, 'node_modules')) ? root : here;
const rel = relative(root, resolve(file));

let cmd;
if (rel.startsWith(`renderer${sep}`) && rel.endsWith('.css')) {
  cmd = [join(bin, 'node_modules/stylelint/bin/stylelint.mjs'), rel];
} else if (/\.tsx?$/.test(rel)) {
  cmd = [join(bin, 'node_modules/eslint/bin/eslint.js'), rel];
} else {
  process.exit(0);
}

const r = spawnSync(process.execPath, cmd, {
  cwd: root,
  encoding: 'utf8',
  // TT_LINT_FAST: eslint.config.mjs skips the slow type-aware promise rules here; CI and `npm run lint` still run them.
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TT_LINT_FAST: '1' },
});
if (r.status === 0) process.exit(0);
process.stderr.write(`Lint failed for ${rel}. Fix these before moving on:\n${r.stdout}${r.stderr}`);
process.exit(2);
