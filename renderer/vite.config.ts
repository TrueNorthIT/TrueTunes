import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
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
