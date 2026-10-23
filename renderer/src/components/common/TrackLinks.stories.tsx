import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ArtistLinks, TitleButton } from './TrackLinks';

const meta = {
  title: 'Common/TrackLinks',
  component: ArtistLinks,
  args: { artist: 'Maya Rowan', onOpenArtist: fn() },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '24em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtistLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleArtist: Story = {};
export const SeveralArtists: Story = { args: { artist: 'Maya Rowan, The Quiet Hours, Snoop Dogg' } };
/** A wrapped credit never starts a line with a comma. */
export const WrappingCredit: Story = {
  args: {
    artist: 'A Band With A Very Long Name, Another Featured Artist With A Long Name, And Yet Another Collaborator',
  },
};
export const Title: Story = {
  render: () => <TitleButton title="Golden Hour" onOpen={fn()} />,
};
