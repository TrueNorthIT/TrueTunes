import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { EqBars } from './EqBars';
import { ArtistLinks } from './TrackLinks';
import { TrackRow } from './TrackRow';

const artists = <ArtistLinks artist="Maya Rowan, The Quiet Hours" onOpenArtist={fn()} />;

const meta = {
  title: 'Common/TrackRow',
  component: TrackRow,
  args: {
    title: 'Golden Hour',
    artists,
    imageUrl: covers.sunset,
    onOpen: fn(),
    onAdd: fn(),
    onMouseEnter: fn(),
  },
  // Rows render inside a list.
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: '44em' }}>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof TrackRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithReason: Story = { args: { reason: 'Because you queued Deep Water twice this week' } };
export const NoArt: Story = { args: { imageUrl: null } };
export const TitleOnly: Story = { args: { artists: undefined, onOpen: undefined } };
export const NoAddButton: Story = { args: { onAdd: undefined } };
export const Explicit: Story = { args: { explicit: true } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Song That Has To Be Truncated Before It Pushes the Row Wider',
    artists: (
      <ArtistLinks artist="A Band With A Very Long Name, Another Featured Artist, And A Third" onOpenArtist={fn()} />
    ),
    explicit: true,
  },
};
export const Selected: Story = { args: { selected: true } };
export const Playing: Story = { args: { playing: true, lead: <EqBars /> } };
export const AlbumTrack: Story = {
  args: { lead: 3, showArt: false, explicit: true, trailing: '3:42', artists: undefined, aside: 'Deep Water' },
};
export const PlaylistTrack: Story = {
  args: {
    handle: true,
    onDragStart: fn(),
    onRemove: fn(),
    trailing: '3:42',
    attribution: { user: 'Priya Shah', onOpen: fn() },
  },
};
