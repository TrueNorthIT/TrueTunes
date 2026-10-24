import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Guard: the built app's CSP runs no script it doesn't name. Each inline script in index.html
// needs its hash in script-src, so editing the mini-player script without updating it fails here
// rather than silently in the packaged app.

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? [];

describe('renderer CSP', () => {
  it('allows each inline script by its hash', () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = createHash('sha256').update(script).digest('base64');
      expect(directive('script-src')).toContain(`'sha256-${hash}'`);
    }
  });

  it('allows no eval or arbitrary inline script', () => {
    expect(directive('script-src')).not.toContain("'unsafe-eval'");
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
  });

  it('connects only to named https hosts (a subdomain wildcard at most)', () => {
    const sources = directive('connect-src');
    expect(sources).toContain("'self'");
    for (const s of sources.filter((x) => x !== "'self'")) expect(s).toMatch(/^https:\/\/(\*\.)?[a-z0-9.-]+$/);
  });
});
