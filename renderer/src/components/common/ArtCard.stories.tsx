import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ArtCard } from './ArtCard';
import { ArtistLinks } from './TrackLinks';

const meta = {
  title: 'Common/ArtCard',
  component: ArtCard,
  args: {
    size: 'large',
    label: 'Album of the week',
    title: 'Golden Hour',
    sub: 'Maya Rowan',
    imageUrl: covers.sunset,
    openLabel: 'Open album Golden Hour',
    onOpen: fn(),
    onMouseEnter: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '26em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};
export const Medium: Story = { args: { size: 'medium' } };
export const WithArtistPhoto: Story = { args: { photoUrl: portrait, label: 'Artist' } };
export const WithAddButton: Story = { args: { onAdd: fn() } };
export const WithArtistLinks: Story = {
  args: { sub: <ArtistLinks artist="Maya Rowan, The Quiet Hours" onOpenArtist={fn()} /> },
};
export const NoArt: Story = { args: { imageUrl: null } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of an Album That Will Wrap Onto Several Lines of the Caption',
    sub: 'A Band With A Very Long Name, Featuring Several Other Collaborating Artists',
  },
};
