import type { Meta, StoryObj } from '@storybook/react-vite';
import { covers } from '../../../.storybook/fixtures';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import { PhoneMiniPlayer } from './PhoneMiniPlayer';
import { TabBar } from './TabBar';
import styles from '../../styles/PhoneShell.module.css';

// The phone shell's dock: the mini player over the tab bar, on one sheet of the frosted shell material, as
// PhoneShell lays them out. Nothing here reaches Sonos: play/pause goes to the Storybook fake.

type NowPlaying = ReturnType<typeof useNowPlaying>;

const playing = {
  displayTrack: 'Golden Hour',
  displayArtist: 'Maya Rowan',
  cachedArt: covers.sunset,
  dominantColor: '214, 122, 74',
  isPlaying: true,
} as NowPlaying;

interface DockProps {
  np: NowPlaying;
  active: React.ComponentProps<typeof TabBar>['active'];
  moreWaiting?: string | null;
  isAuthed?: boolean;
}

function Dock({ np, active, moreWaiting, isAuthed = true }: DockProps) {
  return (
    <div className={styles.dock}>
      <PhoneMiniPlayer np={np} isAuthed={isAuthed} />
      <TabBar active={active} moreWaiting={moreWaiting} />
    </div>
  );
}

const meta = {
  title: 'Phone/Dock',
  component: Dock,
  parameters: { platform: 'web', shell: 'phone', frame: 'bare' },
  globals: { viewport: { value: 'iphone14' } },
  args: { np: playing, active: '/' },
  decorators: [
    (Story) => (
      <div style={{ height: '100dvh', background: 'var(--bg)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
export const Paused: Story = { args: { np: { ...playing, isPlaying: false }, active: '/queue' } };
export const LongTitle: Story = {
  args: {
    np: {
      ...playing,
      displayTrack: 'The Night We Drove the Long Way Round the Harbour and Back Again (Live at the Royal Albert Hall)',
      displayArtist: 'Maya Rowan, The Northern Lights Orchestra and Friends',
    },
    active: '/search',
  },
};
export const NoArt: Story = { args: { np: { ...playing, cachedArt: null, dominantColor: null }, active: '/discover' } };
export const NothingPlaying: Story = {
  args: {
    np: { ...playing, displayTrack: '', displayArtist: '', cachedArt: null, dominantColor: null, isPlaying: false },
  },
};
/** A poll or an update is waiting on the More page: a dot on its tab, and the words in its name. */
export const SomethingWaiting: Story = { args: { active: '/more', moreWaiting: 'a poll is waiting' } };
/** The home indicator's inset: the tab bar pads for it, its targets sit above. */
export const WithSafeArea: Story = { parameters: { safeArea: true } };
export const SignedOut: Story = { args: { isAuthed: false } };
