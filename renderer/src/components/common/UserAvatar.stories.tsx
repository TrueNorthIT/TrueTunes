import type { Meta, StoryObj } from '@storybook/react-vite';
import { championOf, portrait } from '../../../.storybook/fixtures';
import { ChampionContext } from '../../lib/champion';
import { UserAvatar } from './UserAvatar';
import chip from './QueuerChip.module.css';
import card from './PersonCard.module.css';
import mini from '../../styles/MiniPlayer.module.css';
import profile from '../../styles/ProfilePanel.module.css';

const meta = {
  title: 'Common/UserAvatar',
  component: UserAvatar,
  // Sizing and shape come from the caller's class; here, the queuer chip's.
  args: { name: 'Priya Shah', imageUrl: portrait, className: chip.avatar },
  decorators: [
    (Story) => (
      <div style={{ fontSize: 'var(--fs-glyph-sm)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPhoto: Story = {};
/** No photo: the initial on a gradient that is the same every time for a given name. */
export const Initial: Story = { args: { imageUrl: null } };
/** Last week's Queuedle champion: a gold ring inside the edge and a crown, and "Queuedle champion, week of …" as its name. */
export const Champion: Story = {
  decorators: [
    (Story) => (
      <ChampionContext.Provider value={championOf('Priya Shah')}>
        <Story />
      </ChampionContext.Provider>
    ),
  ],
};
export const ChampionInitial: Story = { ...Champion, args: { imageUrl: null } };
/** The same champion at each size the app shows a face: the crown scales with it, and drops out below 24px. */
export const ChampionSizes: Story = {
  ...Champion,
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2em', padding: '0.6em' }}>
      {[mini.queuerAvatar, chip.avatar, card.avatar, `${profile.avatar} ${profile.avatarFace}`].map((c) => (
        <UserAvatar key={c} {...args} className={c} />
      ))}
      <UserAvatar {...args} name="Tom Ellis" imageUrl={null} />
    </div>
  ),
};
export const OtherNames: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: '0.4em' }}>
      {['Aisha Khan', 'Tom Ellis', 'Zoe Whitaker', 'Joe Pitts', 'Maya Rowan'].map((n) => (
        <UserAvatar key={n} {...args} name={n} imageUrl={null} />
      ))}
    </div>
  ),
};
