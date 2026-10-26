import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../.storybook/pageStory';
import { LeaderboardPanel } from './LeaderboardPanel';

// The office leaderboard: people, tracks, artists and albums for the period, plus Queuedle standings.

const meta = { title: 'Pages/Leaderboard', parameters: pageParameters('/leaderboard') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // Real a11y findings in the page, tracked in a GitHub issue, not caused by the mock data: label-content-name-mismatch: the person chips have a title that differs from their visible text.
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <PageProviders>
      <LeaderboardPanel />
    </PageProviders>
  ),
};
