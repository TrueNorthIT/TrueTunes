import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { covers, portrait } from '../../../.storybook/fixtures';
import { ImageTile } from './ImageTile';
import { PillButton } from './PillButton';
import { SectionCard, SeeAll } from './SectionCard';
import { UserAvatar } from './UserAvatar';
import avatar from './QueuerChip.module.css';

const tiles = (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1em' }}>
    {[covers.sunset, covers.ocean, covers.forest, covers.neon].map((c, i) => (
      <ImageTile key={i} title={`Album ${i + 1}`} sub="Maya Rowan" imageUrl={c} onOpen={fn()} />
    ))}
  </div>
);

const meta = {
  title: 'Common/SectionCard',
  component: SectionCard,
  args: { title: 'Jump back in', children: tiles },
  decorators: [(Story) => <div style={{ maxWidth: '52em' }}><Story /></div>],
} satisfies Meta<typeof SectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSeeAll: Story = { args: { actions: <SeeAll onClick={fn()} /> } };
export const WithButtonAction: Story = { args: { actions: <PillButton>New playlist</PillButton> } };
export const WithHeadContent: Story = {
  args: {
    title: 'Listening now',
    headContent: (
      <span style={{ display: 'inline-flex', gap: '0.3em' }}>
        {['Priya Shah', 'Tom Ellis', 'Aisha Khan'].map((n, i) => (
          <UserAvatar key={n} name={n} imageUrl={i === 0 ? portrait : null} className={avatar.avatar} />
        ))}
      </span>
    ),
  },
};
export const Featured: Story = { args: { featured: true, wash: '255, 122, 69', title: 'Now playing' } };
export const FeaturedNoWash: Story = { args: { featured: true, title: 'Now playing' } };
export const NoTitle: Story = { args: { title: undefined } };
