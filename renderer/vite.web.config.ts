// The web app (PWA) build: the same renderer as the Electron app, from its own entry (web/index.html →
// src/web/main.tsx), written to renderer/dist-web for the gateway to serve from its root.
import { defineConfig, type Plugin } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'path';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as { version: string };

/** A gateway to send /sonos, /fn and /img to while developing (the relay too). Unset: those calls fail locally. */
const devGateway = process.env['TRUETUNES_DEV_GATEWAY'];

/** As in vite.config.ts: the dev server needs inline scripts and its HMR socket, which the built policy refuses. */
const devCsp = (): Plugin => ({
  name: 'dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, (meta) =>
      meta
        .replace(/script-src [^;"]*/, "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
        .replace(/connect-src /, 'connect-src ws://localhost:5173 ')
    ),
});

/**
 * Writes /sw.js from web/sw.js once the build is on disk, with this build's id, version and file list filled in.
 * The id is a hash of everything the worker will keep, so any change to the app is a new worker, and an unchanged
 * rebuild is not. Build only: the dev server has no service worker.
 */
const serviceWorker = (): Plugin => ({
  name: 'true-tunes-sw',
  apply: 'build',
  closeBundle() {
    const out = path.resolve(__dirname, 'dist-web');
    const html = readFileSync(path.join(out, 'index.html'), 'utf8');
    // Scripts, styles and fonts: an installed version is then complete, and never asks the server for a file
    // that a later deploy has removed. The face detector's model and wasm are fetched (and kept) on first use.
    const assets = readdirSync(path.join(out, 'assets'))
      .filter((name) => /\.(js|css|woff2)$/.test(name))
      .map((name) => `/assets/${name}`)
      .sort();
    const icons = readdirSync(path.join(out, 'icons'))
      .map((name) => `/icons/${name}`)
      .sort();
    const shell = ['/manifest.webmanifest', ...icons, ...assets];
    const template = readFileSync(path.resolve(__dirname, 'web', 'sw.js'), 'utf8');
    // Everything the worker keeps goes into the id: hashed files by name, the manifest and icons by content
    // (their names never change), so a new icon reaches installed apps too.
    const hash = createHash('sha256').update(html).update(template).update(shell.join(' '));
    for (const file of ['/manifest.webmanifest', ...icons]) hash.update(readFileSync(path.join(out, file)));
    const id = hash.digest('hex').slice(0, 12);
    const marker = /\/\*__BUILD__\*\/ \{[^;]*\};/;
    if (!marker.test(template)) throw new Error('web/sw.js has no /*__BUILD__*/ marker');
    writeFileSync(
      path.join(out, 'sw.js'),
      template.replace(marker, `${JSON.stringify({ id, version: pkg.version, shell })};`)
    );
  },
});

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  // Only VITE_* from the process environment: there is no .env beside web/, and the repo's own .env is not read.
  envDir: path.resolve(__dirname, 'web'),
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), devCsp(), serviceWorker()],
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: path.resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, '..')] },
    forwardConsole: false,
    ...(devGateway
      ? {
          proxy: Object.fromEntries(
            ['/sonos', '/fn', '/img'].map((p) => [p, { target: devGateway, changeOrigin: true, ws: true }])
          ),
        }
      : {}),
  },
});
