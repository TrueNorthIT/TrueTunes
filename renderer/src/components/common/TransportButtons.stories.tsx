import type { Meta, StoryObj } from '@storybook/react-vite';
import styles from '../../styles/PlayerBar.module.css';
import mini from '../../styles/MiniPlayer.module.css';
import { TransportButtons } from './TransportButtons';

// Previous / play-pause / next as the player bar styles them. Pressing one goes through the fake bridge, which
// only logs `sonos.play`, `sonos.pause`, `sonos.skipPrev` or `sonos.skipNext` in the Actions panel.
const meta = {
  title: 'Player/TransportButtons',
  component: TransportButtons,
  args: {
    disabled: false,
    isPlaying: false,
    btnClassName: styles.ctrl,
    playClassName: styles.playBtn,
    size: 14,
    playSize: 14,
  },
  decorators: [
    (Story) => (
      <div className={styles.transport}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TransportButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = { args: { isPlaying: true } };
/** Not signed in: all three are disabled. */
export const Disabled: Story = { args: { disabled: true } };
/** The mini player and skinny layout use solid glyphs. */
export const Filled: Story = {
  args: { filled: true, isPlaying: false, btnClassName: mini.btn, playClassName: mini.playBtn, size: 15, playSize: 15 },
};
export const FilledPlaying: Story = { args: { ...Filled.args, isPlaying: true } };
