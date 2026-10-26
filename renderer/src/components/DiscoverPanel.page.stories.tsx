import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters, LiveShell } from '../../.storybook/pageStory';
import { DiscoverPanel } from './DiscoverPanel';

// Acts the office loves, with the songs it has never played.

const meta = { title: 'Pages/Discover', parameters: pageParameters('/discover') } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <LiveShell>{(s) => <DiscoverPanel queueItems={s.queueItems} />}</LiveShell>
    </PageProviders>
  ),
};
