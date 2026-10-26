import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App';

// The whole app on Home: top nav, the 20-track queue with who queued each, and the player bar with a track loaded
// (paused, so nothing moves). The splash is hidden: it fades out on a timer, and a story is a still.

const meta = {
  title: 'Pages/App shell',
  component: App,
  parameters: { backend: 'mock', frame: 'bare', route: { path: '/', pattern: '/*' } },
  decorators: [
    (Story) => (
      <>
        <style>{'[aria-label="Loading True Tunes"] { display: none; }'}</style>
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
