import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { ChartHead, ChartRow } from './ChartRow';
import { EqBars } from './EqBars';
import { ArtistLinks } from './TrackLinks';

const meta = {
  title: 'Common/ChartRow',
  component: ChartRow,
  args: {
    rank: 1,
    title: 'Golden Hour',
    artists: <ArtistLinks artist="Maya Rowan" onOpenArtist={fn()} />,
    imageUrl: covers.sunset,
    count: 27,
    onOpen: fn(),
    onAdd: fn(),
    onMouseEnter: fn(),
  },
  // Rows render inside an ordered list, under the column labels.
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '48em' }}>
        <ChartHead />
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <Story />
        </ol>
      </div>
    ),
  ],
} satisfies Meta<typeof ChartRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TwoDigitRank: Story = { args: { rank: 12, count: 1204 } };
export const NoArt: Story = { args: { imageUrl: null } };
export const NoAddButton: Story = { args: { onAdd: undefined } };
export const Selected: Story = { args: { selected: true } };
export const Playing: Story = { args: { playing: true, rankSlot: <EqBars /> } };
export const WithDurationMeta: Story = { args: { meta: '3:42' } };
export const Draggable: Story = { args: { onDragStart: fn() } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Song That Has To Be Truncated Before It Pushes the Row Wider',
    artists: <ArtistLinks artist="A Band With A Very Long Name, Another Featured Artist" onOpenArtist={fn()} />,
  },
};
