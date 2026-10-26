import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../.storybook/pageStory';
import { DiscoverPanel } from './DiscoverPanel';

// Acts the office loves, with the songs it has never played.

const meta = { title: 'Pages/Discover', parameters: pageParameters('/discover') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  // Real a11y findings in the page, tracked in a GitHub issue, not caused by the mock data: label-content-name-mismatch: the act buttons have a title that differs from their visible text.
  parameters: { a11y: { test: 'todo' } },
  render: () => (
    <PageProviders>
      <LiveShell>{(s) => <DiscoverPanel queueItems={s.queueItems} />}</LiveShell>
    </PageProviders>
  ),
};
