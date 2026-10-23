import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { StatsArtistTile } from './StatsArtistTile';

// The artist's own photo comes from a query that the fake bridge never answers, so the tile shows the art the
// queue events carried, as it does while that photo loads.
const meta = {
  title: 'Common/StatsArtistTile',
  component: StatsArtistTile,
  args: {
    a: { artist: 'Maya Rowan', artistId: 'artist-1', serviceId: '51463', accountId: 'account-1', imageUrl: portrait, count: 412 },
    onOpen: fn(),
  },
  decorators: [(Story) => <div style={{ width: '12em' }}><Story /></div>],
} satisfies Meta<typeof StatsArtistTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const NoArt: Story = { args: { a: { artist: 'Maya Rowan', count: 3 } } };
export const LongName: Story = { args: { a: { artist: 'Alexandria Montgomery-Featherstonehaugh and the Orchestra', imageUrl: portrait, count: 1204 } } };
