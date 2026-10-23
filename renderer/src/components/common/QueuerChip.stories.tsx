import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { QueuerChip } from './QueuerChip';

const meta = {
  title: 'Common/QueuerChip',
  component: QueuerChip,
  args: { user: 'Priya Shah', imageUrl: portrait, onOpen: fn() },
} satisfies Meta<typeof QueuerChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoPhoto: Story = { args: { imageUrl: null } };
export const LongName: Story = { args: { user: 'Alexandria Montgomery-Featherstonehaugh' } };
export const CustomPrefix: Story = { args: { prefix: 'Added by ' } };
