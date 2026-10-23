import type { Meta, StoryObj } from '@storybook/react-vite';
import styles from '../../styles/PlayerBar.module.css';
import { SeekBar } from './SeekBar';

// Dressed as the player bar's progress row. A click or arrow key seeks through the fake bridge, which only logs
// `sonos.seek` and `sonos.refreshPlayback` in the Actions panel.
const meta = {
  title: 'Player/SeekBar',
  component: SeekBar,
  args: {
    progressPct: 40,
    durationMs: 222000,
    elapsedLabel: '1:29',
    durationLabel: '3:42',
    className: styles.progressBar,
    trackClassName: styles.progressTrack,
    fillClassName: styles.progressFill,
  },
  argTypes: { progressPct: { control: { type: 'range', min: 0, max: 100 } } },
  decorators: [
    (Story, { args }) => (
      <div className={styles.progressSection} style={{ maxWidth: '40em' }}>
        <span className={styles.time}>{args.elapsedLabel}</span>
        <Story />
        <span className={styles.time}>{args.durationLabel}</span>
      </div>
    ),
  ],
} satisfies Meta<typeof SeekBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtStart: Story = { args: { progressPct: 0, elapsedLabel: '0:00' } };
export const NearlyDone: Story = { args: { progressPct: 97, elapsedLabel: '3:35' } };
/** No known duration (nothing playing): the bar does nothing when pressed. */
export const NoDuration: Story = { args: { progressPct: 0, durationMs: 0, elapsedLabel: '', durationLabel: '' } };
