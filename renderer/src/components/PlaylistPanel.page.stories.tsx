import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../.storybook/pageStory';
import { ROAD_TRIP_ID } from '../test/fixtures/azure';
import { PlaylistPanel } from './PlaylistPanel';

// An office playlist: cover, members and its tracks.

const meta = {
  title: 'Pages/Playlist',
  parameters: pageParameters(`/playlist/${ROAD_TRIP_ID}`, { pattern: '/playlist/:id' }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <PlaylistPanel />
    </PageProviders>
  ),
};
