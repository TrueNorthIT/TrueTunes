import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageProviders, pageParameters } from '../../.storybook/pageStory';
import { ProfilePanel } from './ProfilePanel';

// A colleague's profile: their photo, top tracks, artists and albums, Queuedle rank and playlists.

const meta = {
  title: 'Pages/Profile',
  parameters: pageParameters('/profile/Tamsin%20Okoro-Vale', { pattern: '/profile/:userName' }),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageProviders>
      <ProfilePanel />
    </PageProviders>
  ),
};
