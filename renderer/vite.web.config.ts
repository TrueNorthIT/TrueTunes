// The web app (PWA) build: the same renderer as the Electron app, from its own entry (web/index.html →
// src/web/main.tsx), written to renderer/dist-web for the gateway to serve from its root.
import { defineConfig, type Plugin } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'path';
import { readFileSync } from 'fs';

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

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  // Only VITE_* from the process environment: there is no .env beside web/, and the repo's own .env is not read.
  envDir: path.resolve(__dirname, 'web'),
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), devCsp()],
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
