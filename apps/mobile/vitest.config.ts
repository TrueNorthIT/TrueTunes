import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/sonos/**/__tests__/**/*.test.{ts,tsx}',
            'src/office/**/__tests__/**/*.test.{ts,tsx}',
            'src/core/**/__tests__/**/*.test.{ts,tsx}',
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
