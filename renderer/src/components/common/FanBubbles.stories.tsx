import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { championOf, covers, portrait } from '../../../.storybook/fixtures';
import { ChampionContext } from '../../lib/champion';
import { ArtCard } from './ArtCard';
import { FanBubbles } from './FanBubbles';

// Faces with a photo; everyone else shows their initial on their own colour.
const photos = new Set(['Long Alex', 'Priya Shah', 'Tom Ellis']);
const imageFor = (user: string) => (photos.has(user) ? portrait : null);

const two = [
  { user: 'Long Alex', count: 12 },
  { user: 'Sam', count: 5 },
];
const many = [
  { user: 'Long Alex', count: 31 },
  { user: 'Priya Shah', count: 18 },
  { user: 'Sam', count: 9 },
  { user: 'Tom Ellis', count: 6 },
  { user: 'Zoe Whitaker', count: 3 },
  { user: 'Joe Pitts', count: 2 },
  { user: 'Maya Rowan', count: 1 },
  { user: 'Aisha Khan', count: 1 },
];

/** The bubbles as Home shows them: on a pick card (ArtCard), right of the art, clear of the caption and the +. */
const meta = {
  title: 'Common/FanBubbles',
  component: FanBubbles,
  args: { people: two, size: 'large', imageFor, viewer: null },
  render: (args) => (
    <div style={{ width: args.size === 'large' ? '34em' : '22em' }}>
      <ArtCard
        size={args.size}
        label={args.people.length > 1 ? 'Long Alex & Sam love The Smiths' : 'Sam loves The Smiths'}
        title="There Is a Light That Never Goes Out"
        sub="The Smiths"
        imageUrl={covers.ocean}
        openLabel="Open album The Queen Is Dead"
        onOpen={fn()}
        onAdd={fn()}
        aside={<FanBubbles {...args} />}
      />
    </div>
  ),
} satisfies Meta<typeof FanBubbles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two fans: Long Alex's bubble has about 1.5× the radius of Sam's (12 plays against 5, area ∝ plays). */
export const Large: Story = {};
export const Medium: Story = { args: { size: 'medium' } };
/** Eight fans: the five biggest, then "+3". Everyone is in the accessible name. */
export const ManyFans: Story = { args: { people: many } };
export const ManyFansMedium: Story = { args: { people: many, size: 'medium' } };
export const OneFan: Story = { args: { people: [{ user: 'Sam', count: 3 }] } };
/** An older server sends no counts: the names from the reason, all one size. */
export const NoCounts: Story = { args: { people: [{ user: 'Long Alex' }, { user: 'Sam' }, { user: 'Priya Shah' }] } };
/** The viewer is "you" in the tooltip and the accessible name. */
export const IncludesViewer: Story = { args: { viewer: 'Sam' } };
/** Last week's Queuedle champion keeps their gold ring and crown in the cloud. */
export const Champion: Story = {
  args: { people: many },
  decorators: [
    (Story) => (
      <ChampionContext.Provider value={championOf('Long Alex')}>
        <Story />
      </ChampionContext.Provider>
    ),
  ],
};
/** As under prefers-reduced-motion: every bubble holds still. */
export const ReducedMotion: Story = { args: { people: many, animate: false } };
