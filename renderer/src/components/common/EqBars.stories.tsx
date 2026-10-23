import type { Meta, StoryObj } from '@storybook/react-vite';
import { EqBars } from './EqBars';

const meta = {
  title: 'Common/EqBars',
  component: EqBars,
  parameters: { docs: { description: { component: 'Animated "this is playing" marker; it takes the text colour.' } } },
} satisfies Meta<typeof EqBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Coloured: Story = {
  decorators: [
    (Story) => (
      <div style={{ color: 'var(--on-art)' }}>
        <Story />
      </div>
    ),
  ],
};
