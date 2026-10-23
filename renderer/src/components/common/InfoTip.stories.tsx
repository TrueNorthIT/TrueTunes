import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { Disc3 } from 'lucide-react';
import { PickInfoTip } from './PickInfoTip';

// Each story opens its tooltip so it can be seen; in the app it opens on hover or keyboard focus.
const meta = {
  title: 'Common/InfoTip',
  component: PickInfoTip,
  args: { because: 'Rich and Alex queue HAIM — never played here', kind: 'unheard', trackName: 'Seventeen' },
  decorators: [(Story) => <div style={{ padding: '1em 1em 14em' }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: 'Why this pick' }));
  },
} satisfies Meta<typeof PickInfoTip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCountsAndFit: Story = {
  args: { fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }], score: 0.82, viewer: 'Rich' },
};

/** Before the server is redeployed: names only, no counts, no fit. */
export const OldServerNamesOnly: Story = {};

export const NobodyCredited: Story = {
  args: { because: 'Like Muse, which the room plays', fans: [], score: 0.64, kind: 'played' },
};

export const EightFans: Story = {
  args: {
    because: 'A, B, C, D, E, F, G and others queue Muse',
    fans: Array.from({ length: 8 }, (_, i) => ({ user: `Person${i + 1}`, count: 20 - i * 2 })),
    score: 0.9,
  },
};

export const CustomIcon: Story = {
  args: { icon: <Disc3 size={14} aria-hidden="true" />, fans: [{ user: 'Sam', count: 1 }], score: 0.7, kind: 'played' },
};
