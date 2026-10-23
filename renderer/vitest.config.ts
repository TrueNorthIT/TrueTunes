import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  // root is renderer/, but node_modules (e.g. the face detector's wasm) live at the repo root, as in vite.config.ts
  server: { fs: { allow: [path.resolve(__dirname, '..')] } },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.stories.tsx', 'src/test/**'],
      reporter: ['text', 'json', 'json-summary', 'html'],
    },
    projects: [
      // The jsdom suite.
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          pool: 'threads',
          setupFiles: ['./src/test/setup.ts'],
          css: { modules: { classNameStrategy: 'non-scoped' } },
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      // Every story rendered in real Chromium; a story that throws on render fails, named by its title.
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(__dirname, '.storybook') })],
        test: {
          name: 'stories',
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
