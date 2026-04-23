import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname),
  define: {
    // FeedbackDialog reads this at module load time; provide a dummy so tests
    // don't throw 'VITE_GITHUB_PAT is not set' when the real .env is absent (CI).
    'import.meta.env.VITE_GITHUB_PAT': JSON.stringify('test-token-placeholder'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'threads',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
