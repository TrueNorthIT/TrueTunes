import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { championOf, portrait } from '../../../.storybook/fixtures';
import { ChampionContext } from '../../lib/champion';
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
/** Queued by last week's Queuedle champion: the gold ring and crown come from UserAvatar, the title joins the label. */
export const Champion: Story = {
  decorators: [
    (Story) => (
      <ChampionContext.Provider value={championOf('Priya Shah')}>
        <div style={{ padding: '0.6em' }}>
          <Story />
        </div>
      </ChampionContext.Provider>
    ),
  ],
};
