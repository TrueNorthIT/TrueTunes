import type { Meta, StoryObj } from '@storybook/react-vite';
import { portrait } from '../../../.storybook/fixtures';
import { UserAvatar } from './UserAvatar';
import chip from './QueuerChip.module.css';

const meta = {
  title: 'Common/UserAvatar',
  component: UserAvatar,
  // Sizing and shape come from the caller's class; here, the queuer chip's.
  args: { name: 'Priya Shah', imageUrl: portrait, className: chip.avatar },
  decorators: [
    (Story) => (
      <div style={{ fontSize: '2em' }}>
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
export const OtherNames: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: '0.4em' }}>
      {['Aisha Khan', 'Tom Ellis', 'Zoe Whitaker', 'Joe Pitts', 'Maya Rowan'].map((n) => (
        <UserAvatar key={n} {...args} name={n} imageUrl={null} />
      ))}
    </div>
  ),
};
