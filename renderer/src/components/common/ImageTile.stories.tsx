import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ImageTile } from './ImageTile';

const meta = {
  title: 'Common/ImageTile',
  component: ImageTile,
  args: { title: 'Golden Hour', sub: 'Maya Rowan', imageUrl: covers.sunset, onOpen: fn(), onHover: fn() },
  // A tile fills its container; on Home the grid sets the width.
  decorators: [
    (Story) => (
      <div style={{ width: '12em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Artist: Story = { args: { title: 'Maya Rowan', sub: '412 queued', imageUrl: portrait, circular: true } };
export const Small: Story = { args: { size: 'sm', meta: 'Yesterday' } };
export const WithAddButton: Story = { args: { onAdd: fn() } };
export const NoArt: Story = { args: { imageUrl: null } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of an Album That Will Not Fit on One Line',
    sub: 'A Band With A Very Long Name, Featuring Several Other Collaborating Artists',
    meta: 'Played 3 hours ago',
  },
};
export const TitleOnly: Story = { args: { sub: null } };
