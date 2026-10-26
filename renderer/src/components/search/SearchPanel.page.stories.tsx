import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../../.storybook/pageStory';
import { SearchPanel } from './SearchPanel';

// Results for a query: the top artist, the albums and a run of songs.

const meta = {
  title: 'Pages/Search',
  parameters: pageParameters('/search?q=velvet anchors', { pattern: '/search' }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <SearchPanel />
    </PageProviders>
  ),
};
