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
// The avatar initial (aria-hidden) counts as visible text to axe, so the label "Queued by X, open profile" looks like a mismatch. It is not: the visible words are all in the label.
export const NoPhoto: Story = {
  args: { imageUrl: null },
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
};
export const LongName: Story = { args: { user: 'Alexandria Montgomery-Featherstonehaugh' } };
export const CustomPrefix: Story = { args: { prefix: 'Added by ' } };
