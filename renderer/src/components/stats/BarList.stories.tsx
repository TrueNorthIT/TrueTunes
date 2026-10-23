import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarList } from './BarList';

const meta = {
  title: 'Stats/BarList',
  component: BarList,
  args: {
    rows: [
      { key: 'a', name: 'Priya Shah', value: 41.2, label: '41.2 h', sub: '612 songs', colour: 'var(--series-1)' },
      { key: 'b', name: 'Tom Ellis', value: 30.5, label: '30.5 h', sub: '455 songs' },
      { key: 'c', name: 'Fergus Westlake-Montgomery', value: 12, label: '12.0 h', sub: '188 songs' },
      { key: 'd', name: 'Aisha Khan', value: 0.4, label: '0.4 h', sub: '6 songs' },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Ranked: Story = { args: { ranked: true } };
export const FixedMax: Story = {
  args: {
    max: 100,
    rows: [
      { key: 'a', name: 'Priya Shah', value: 12, label: '12%', colour: 'var(--series-1)' },
      { key: 'b', name: 'Tom Ellis', value: 4, label: '4%' },
    ],
  },
};
