import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../.storybook/pageStory';
import { LeaderboardPanel } from './LeaderboardPanel';

// The office leaderboard: people, tracks, artists and albums for the period, plus Queuedle standings.

const meta = { title: 'Pages/Leaderboard', parameters: pageParameters('/leaderboard') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <LeaderboardPanel />
    </PageProviders>
  ),
};
