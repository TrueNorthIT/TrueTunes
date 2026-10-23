import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AddButton } from './AddButton';

// The art and corner looks sit over imagery, so they get a dark card behind them.
const meta = {
  title: 'Common/AddButton',
  component: AddButton,
  args: { label: 'Add Golden Hour to queue', onClick: fn() },
  decorators: [(Story) => <div style={{ display: 'inline-block', padding: '1em', borderRadius: '1em', background: 'var(--bg-1)' }}><Story /></div>],
} satisfies Meta<typeof AddButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Quiet: Story = {};
export const Art: Story = { args: { variant: 'art' } };
export const Corner: Story = { args: { variant: 'corner' } };
