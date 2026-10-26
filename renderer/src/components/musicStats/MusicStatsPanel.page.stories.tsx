import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../../.storybook/pageStory';
import { MusicStatsPanel } from './MusicStatsPanel';

// Every queue so far: busy hours, airtime, variety, discoverers and each person's taste.

const meta = { title: 'Pages/Music stats', parameters: pageParameters('/leaderboard/stats') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <MusicStatsPanel />
    </PageProviders>
  ),
};
