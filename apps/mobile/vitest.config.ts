import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/app/**', 'src/ui/**', 'src/platform/**', 'src/spike/**', 'src/types/**'],
      reporter: ['text-summary', 'json-summary', 'json'],
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/sonos/**/__tests__/**/*.test.{ts,tsx}',
            'src/office/**/__tests__/**/*.test.{ts,tsx}',
            'src/core/**/__tests__/**/*.test.{ts,tsx}',
            'plugins/**/__tests__/**/*.test.js',
          ],
        },
      },
      {
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          include: ['src/logic/**/__tests__/**/*.test.{ts,tsx}'],
          setupFiles: ['src/logic/test/setup.ts'],
        },
      },
    ],
  },
});
