import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers } from '../../../.storybook/fixtures';
import { ImageTile } from './ImageTile';

const meta = {
  title: 'Common/ImageTile',
  component: ImageTile,
  args: { title: 'Golden Hour', sub: 'Maya Rowan', imageUrl: covers.sunset, onOpen: fn() },
  // A tile fills its container; on Home the grid sets the width.
  decorators: [(Story) => <div style={{ width: '12em' }}><Story /></div>],
} satisfies Meta<typeof ImageTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
