import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, greySilhouette } from '../../../.storybook/fixtures';
import { OfficeChip } from './OfficeChip';
import { PillButton } from './PillButton';
import { TopResultCard } from './TopResultCard';

const meta = {
  title: 'Common/TopResultCard',
  component: TopResultCard,
  args: {
    title: 'Golden Hour',
    meta: 'Song · Maya Rowan · Golden Hour',
    imageUrl: covers.sunset,
    openLabel: 'Open album Golden Hour',
    onOpen: fn(),
    onMouseEnter: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: '28em' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TopResultCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Explicit: Story = { args: { explicit: true } };
export const WithActions: Story = {
  args: {
    children: (
      <>
        <PillButton variant="primary">Play next</PillButton>
        <PillButton>Add to queue</PillButton>
        <OfficeChip count={27} />
      </>
    ),
  },
};
export const NoArt: Story = { args: { imageUrl: null } };
export const GreySilhouette: Story = { args: { imageUrl: greySilhouette, title: 'Maya Rowan', meta: 'Artist' } };
export const LongTitle: Story = {
  args: {
    title: 'The Extraordinarily Long Title of a Song That Is Clamped to Three Lines on the Card, Whatever Else Happens',
  },
};
