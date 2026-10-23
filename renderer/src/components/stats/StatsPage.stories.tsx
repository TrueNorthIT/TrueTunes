import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SectionCard } from '../common/SectionCard';
import { StatsPage } from './StatsPage';

const meta = {
  title: 'Stats/StatsPage',
  component: StatsPage,
  args: {
    title: 'Music stats',
    facts: '12,472 queues · 16 people',
    backLabel: 'Leaderboard',
    onBack: fn(),
    children: <SectionCard title="Busy hours" sub="When the office reaches for the queue.">Chart goes here.</SectionCard>,
  },
} satisfies Meta<typeof StatsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoFacts: Story = { args: { facts: undefined } };
