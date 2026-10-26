import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { championOf, covers, portrait } from '../../../.storybook/fixtures';
import { ChampionContext } from '../../lib/champion';
import { ArtCard } from './ArtCard';
import { FanBubbles } from './FanBubbles';
import { InfoTip } from './InfoTip';

// Faces with a photo; everyone else shows their initial on their own colour.
const photos = new Set(['Long Alex', 'Priya Shah', 'Tom Ellis']);
const imageFor = (user: string) => (photos.has(user) ? portrait : null);

const two = [
  { user: 'Long Alex', count: 12 },
  { user: 'Sam', count: 5 },
];
const four = [
  { user: 'Priya Shah', count: 24 },
  { user: 'Long Alex', count: 15 },
  { user: 'Sam', count: 8 },
  { user: 'Tom Ellis', count: 4 },
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
const reasons = new Map<unknown, string>([
  [two, 'Long Alex & Sam love The Smiths'],
  [four, 'Priya Shah, Long Alex & 2 others love The Smiths'],
  [many, 'Long Alex, Priya Shah & 6 others love The Smiths'],
]);

/**
 * The bubbles as Home shows them: a sunflower head on a pick card (ArtCard), right of the art, clear of the title and
 * the +. The reason line ("… love The Smiths" + ⓘ) waits until the cloud is hovered or the card has focus.
 */
const meta = {
  title: 'Common/FanBubbles',
  component: FanBubbles,
  args: { people: two, size: 'large', imageFor, viewer: null },
  render: (args) => (
    <div style={{ width: args.size === 'large' ? '34em' : '22em' }}>
      <ArtCard
        size={args.size}
        label={reasons.get(args.people) ?? 'Sam loves The Smiths'}
        info={
          <InfoTip label="Why this pick">
            <p>They queue The Smiths most here.</p>
          </InfoTip>
        }
        title="There Is a Light That Never Goes Out"
        sub="The Smiths"
        imageUrl={covers.ocean}
        openLabel="Open album The Queen Is Dead"
        onOpen={fn()}
        onAdd={fn()}
        aside={<FanBubbles {...args} />}
        reasonOnHover
      />
    </div>
  ),
} satisfies Meta<typeof FanBubbles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two fans: Long Alex in the middle with about 1.5× the radius of Sam (12 plays against 5, area ∝ plays). */
export const Large: Story = {};
export const Medium: Story = { args: { size: 'medium' } };
/** Four fans: the biggest in the middle, the rest stepping out round it at 137.5°. */
export const FourFans: Story = { args: { people: four } };
export const FourFansMedium: Story = { args: { people: four, size: 'medium' } };
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
/**
 * The reason shown, as when the cloud is hovered: here by focusing the card, which shows it the same way (a story
 * can't hold a real hover). Tab to the card or its ⓘ and the line fades in.
 */
export const ReasonShown: Story = {
  args: { people: four },
  play: async ({ canvas }) => {
    canvas.getByRole('button', { name: 'Open album The Queen Is Dead' }).focus();
  },
};
/** As under prefers-reduced-motion: the head holds still. */
export const ReducedMotion: Story = { args: { people: many, animate: false } };
