import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { PersonChip } from './PersonChip';

const meta = {
  title: 'Common/PersonChip',
  component: PersonChip,
  args: { name: 'Priya Shah', selected: false, onClick: fn() },
} satisfies Meta<typeof PersonChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithPhoto: Story = { args: { imageUrl: portrait } };
export const Selected: Story = { args: { selected: true } };
export const SelectedWithColour: Story = { args: { selected: true, colour: 'var(--series-2)' } };
export const You: Story = { args: { suffix: ' (you)', selected: true, colour: 'var(--series-1)', disabled: true } };
export const Disabled: Story = { args: { disabled: true, title: 'Up to 7 at once' } };
export const LongName: Story = { args: { name: 'Fergus Westlake-Montgomery the Third of Leeds' } };
