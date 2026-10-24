import { defineConfig, type Plugin } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import path from 'path';

/**
 * The dev server injects inline scripts (React Fast Refresh) and talks HMR over a websocket, which the
 * built app's CSP in index.html rightly refuses. Dev only: the build keeps the strict policy.
 */
const devCsp = (): Plugin => ({
  name: 'dev-csp',
  apply: 'serve',
  // Only inside the meta tag's content="...": index.html's explanatory comment uses the same words.
  transformIndexHtml: (html) =>
    html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, (meta) =>
      meta
        .replace(/script-src [^;"]*/, "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
        .replace(/connect-src /, 'connect-src ws://localhost:5173 ')
    ),
});

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), devCsp()],
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    cssTarget: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
    // root is renderer/, but node_modules (e.g. bundled fonts) live at the repo root
    fs: { allow: [path.resolve(__dirname, '..')] },
    // Vite 8 turns this on by default when an AI agent starts the dev server. With the HMR socket down, each failed
    // forward is itself an unhandled rejection that gets forwarded again: an endless "send was called before
    // connect" loop in the console. Off, so the dev server behaves the same however it was started.
    forwardConsole: false,
  },
});
