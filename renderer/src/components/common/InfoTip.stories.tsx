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

export const WithCounts: Story = {
  args: { fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }], artist: 'Sugababes', viewer: 'Rich' },
};

/** A pick the room has played: the song line leads. */
export const PlayedWithSongCounts: Story = {
  args: {
    kind: 'played',
    artist: 'Justice',
    fans: [{ user: 'Rich', count: 14 }, { user: 'Alex', count: 6 }],
    trackFans: [{ user: 'Rich', count: 3 }, { user: 'Alex', count: 1 }],
  },
};

/** Before the server is redeployed: names only, no counts. */
export const OldServerNamesOnly: Story = {};

export const NobodyCredited: Story = {
  args: { because: 'Like Muse, which the room plays', fans: [], kind: 'played' },
};

export const EightFans: Story = {
  args: {
    because: 'A, B, C, D, E, F, G and others queue Muse',
    fans: Array.from({ length: 8 }, (_, i) => ({ user: `Person${i + 1}`, count: 20 - i * 2 })),
  },
};

export const CustomIcon: Story = {
  args: { icon: <Disc3 size={14} aria-hidden="true" />, fans: [{ user: 'Sam', count: 1 }], kind: 'played' },
};
