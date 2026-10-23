import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfficeChip } from './OfficeChip';

const meta = {
  title: 'Common/OfficeChip',
  component: OfficeChip,
  args: { count: 27 },
} satisfies Meta<typeof OfficeChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Often: Story = {};
export const Once: Story = { args: { count: 1 } };
/** Nothing below one: renders nothing. */
export const Never: Story = { args: { count: 0 } };
export const Unknown: Story = { args: { count: undefined } };
