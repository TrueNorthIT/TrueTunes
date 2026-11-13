import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MoreButton } from './MoreButton';

// The ⋯ that opens a row's menu where there is no right-click: a full 44px tap target in the + button's family.
const meta = {
  title: 'Common/MoreButton',
  component: MoreButton,
  args: { label: 'More for Golden Hour', onClick: fn() },
} satisfies Meta<typeof MoreButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
