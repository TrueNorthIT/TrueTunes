// Process-wide core singleton. Importing this module installs `window.sonos` (the same surface the
// desktop preload exposes) BEFORE any ported hook mounts, so the hooks run unchanged.

import { createCore } from '@truetunes/core/core/createCore';
import { createPlatform } from './createPlatform';

// React Native aliases `window` to the global object; make that explicit for safety.
const g = globalThis as unknown as { window?: unknown; sonos?: unknown };
if (!g.window) g.window = globalThis;

export const core = createCore(createPlatform());
(globalThis as unknown as { window: { sonos: unknown } }).window.sonos = core.bridge;

let startPromise: Promise<'authed' | 'needs-login'> | null = null;
/** Idempotent - safe under React dev double-mounting. */
export function startCore() {
  return (startPromise ??= core.start());
}
