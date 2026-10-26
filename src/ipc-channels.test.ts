// Run: npm run test:main
// Every channel the preload invokes must have an ipcMain.handle in a module main.ts registers.
// Catches a handler lost when moving code between files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = import.meta.dirname;
const read = (file: string) => readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Channels from ipcMain.handle('…') calls that aren't commented out. */
const handled = (src: string) => [...src.matchAll(/^\s*ipcMain\.handle\(\s*'([^']+)'/gm)].map((m) => m[1]);

test('every channel the preload invokes has a registered handler', () => {
  const invoked = new Set([...read('preload.ts').matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]));
  assert.ok(invoked.size > 50, `parsed only ${invoked.size} channels from preload.ts`);

  // Only modules main.ts actually imports and calls register() on count.
  const main = read('main.ts');
  const registered = new Set(
    [...main.matchAll(/^import \* as (\w+) from '\.\/ipc\/([\w-]+)';/gm)]
      .filter(([, alias]) => new RegExp(`^\\s*${alias}\\.register\\(`, 'm').test(main))
      .map(([, , file]) => file)
  );
  const handlers = new Set([
    ...handled(main),
    ...readdirSync(join(SRC, 'ipc'))
      .filter((f) => f.endsWith('.ts') && registered.has(f.slice(0, -3)))
      .flatMap((f) => handled(read(join('ipc', f)))),
  ]);

  const missing = [...invoked].filter((c) => !handlers.has(c));
  assert.deepEqual(missing, [], `no handler registered for: ${missing.join(', ')}`);
});
