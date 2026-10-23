import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { portrait } from '../../../.storybook/fixtures';
import { QueuerChip } from './QueuerChip';

const meta = {
  title: 'Common/QueuerChip',
  component: QueuerChip,
  args: { user: 'Priya Shah', imageUrl: portrait, onOpen: fn() },
  // Every story, not just NoPhoto: the avatar loads its photo asynchronously (useImage), so until it lands the
  // aria-hidden initial is on screen and axe counts it as visible text. The label 'Queued by X, open profile'
  // already holds every visible word, so the mismatch is a false positive, and which state axe sees is a race.
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
} satisfies Meta<typeof QueuerChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoPhoto: Story = { args: { imageUrl: null } };
export const LongName: Story = { args: { user: 'Alexandria Montgomery-Featherstonehaugh' } };
export const CustomPrefix: Story = { args: { prefix: 'Added by ' } };
