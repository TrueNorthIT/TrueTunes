import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  core: { disableTelemetry: true },
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    // Run from the repo root; the renderer's own Vite config carries its plugins and the @ alias.
    options: { builder: { viteConfigPath: 'renderer/vite.config.ts' } },
  },
  // The renderer's root is renderer/, but the bundled font lives in the repo root's node_modules.
  viteFinal: (config) => ({
    ...config,
    server: {
      ...config.server,
      fs: { ...config.server?.fs, allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    },
  }),
};

export default config;
