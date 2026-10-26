import type { Meta, StoryObj } from '@storybook/react-vite';
import home from '../../styles/HomePanel.module.css';
import { WavyProgress } from './WavyProgress';
import styles from './WavyProgress.module.css';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const DURATION_S = 222;

// Dressed as the Now playing card's progress row: tabular times either side, on the lit wall.
const meta = {
  title: 'Player/WavyProgress',
  component: WavyProgress,
  args: { progressPct: 40, paused: false },
  argTypes: { progressPct: { control: { type: 'range', min: 0, max: 100 } } },
  parameters: {
    docs: {
      description: {
        component:
          "The Now playing card's progress: the played part is a slowly travelling sine wave, the rest the flat track. Paused, it eases to a straight line and stops; under reduced motion it is a still, flat line.",
      },
    },
  },
  decorators: [
    (Story, { args }) => (
      <div
        style={{ maxWidth: '40em', padding: '1.4em', borderRadius: 'var(--r-card)', background: 'var(--surface-hi)' }}
      >
        <div className={home.nowProgress}>
          <span className={home.nowTime}>{fmt((args.progressPct / 100) * DURATION_S)}</span>
          <Story />
          <span className={home.nowTime}>{fmt(DURATION_S)}</span>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof WavyProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playing: Story = {};
export const Paused: Story = { args: { paused: true } };
/** What prefers-reduced-motion shows: flat and still even while playing. */
export const ReducedMotion: Story = { args: { className: styles.reduceMotion } };
export const AtStart: Story = { args: { progressPct: 0 } };
/** A short flat line: the wave's height ramps up from nothing over the first wavelength. */
export const JustStarted: Story = { args: { progressPct: 3 } };
/** About one wavelength played: the ramp from flat to full height. */
export const OneWavelength: Story = { args: { progressPct: 7 } };
export const NearlyDone: Story = { args: { progressPct: 97 } };
export const Finished: Story = { args: { progressPct: 100 } };
