import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PillButton } from './PillButton';

const meta = {
  title: 'Common/PillButton',
  component: PillButton,
  args: { children: 'Add to queue', onClick: fn() },
} satisfies Meta<typeof PillButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};
export const Primary: Story = { args: { variant: 'primary', children: 'Play next' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Delete playlist' } };
export const Disabled: Story = { args: { disabled: true } };
export const Submit: Story = { args: { variant: 'primary', type: 'submit', children: 'Create' } };
