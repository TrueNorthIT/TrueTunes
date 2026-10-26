import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { championOf, covers } from '../../../.storybook/fixtures';
import { ChampionContext } from '../../lib/champion';
import type { BubbleArrangement } from '../../lib/bubbleArrangements';
import { ArtCard } from './ArtCard';
import { FanBubbles } from './FanBubbles';

// Exploration: seven ways to arrange the faces a pick is for, each on Home's large pick card, with two, four and
// eight fans, at 1.3× the shipped face size (the lead card is big; at 1× the faces read as specks). The caption line ("… love The Smiths" + ⓘ) is hidden until a face is hovered.

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 600 600">${body}</svg>`
  )}`;
/** A stand-in head-and-shoulders photo: background, skin and shirt colours vary so the faces tell apart. */
const face = (bg: string, skin: string, hair: string, shirt: string) =>
  svg(
    `<rect width="600" height="600" fill="${bg}"/><path d="M90 600 Q300 360 510 600Z" fill="${shirt}"/>` +
      `<circle cx="300" cy="250" r="110" fill="${skin}"/><path d="M190 240 Q300 100 410 240 Q400 150 300 130 Q200 150 190 240Z" fill="${hair}"/>`
  );
const photos: Record<string, string> = {
  'Long Alex': face('#3d6b8f', '#f1d0b4', '#4a3222', '#1d2b3a'),
  'Priya Shah': face('#8f5a3d', '#c48a63', '#1b1412', '#e8c35a'),
  'Tom Ellis': face('#4f7a52', '#e9c2a0', '#b58a4a', '#33415c'),
  'Zoe Whitaker': face('#9b4a4a', '#f3d4bd', '#d6a85c', '#2d4d6a'),
  'Maya Rowan': face('#5a6f86', '#8d5a3b', '#20160f', '#c46b4a'),
};
const imageFor = (user: string) => photos[user] ?? null;

const two = [
  { user: 'Long Alex', count: 30 },
  { user: 'Sam', count: 12 },
];
const four = [
  { user: 'Priya Shah', count: 24 },
  { user: 'Long Alex', count: 15 },
  { user: 'Sam', count: 8 },
  { user: 'Tom Ellis', count: 4 },
];
const eight = [
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
  [four, 'Priya, Long Alex & 2 others love The Smiths'],
  [eight, 'Long Alex, Priya & 6 others love The Smiths'],
]);

type Args = ComponentProps<typeof FanBubbles> & {
  /** Hide the caption line until a face is hovered. */
  reasonOnHover: boolean;
  /** Who is last week's Queuedle champion (gold ring and crown), if anyone. */
  champion?: string;
};

function Card({ reasonOnHover, champion, ...args }: Args) {
  const card = (
    // Home's lead pick card at a 1280px window: about 640px wide, stretched to its row.
    <div style={{ width: 640, height: 440, display: 'grid' }}>
      <ArtCard
        size="large"
        label={reasons.get(args.people) ?? 'They love The Smiths'}
        info={<span aria-hidden="true">ⓘ</span>}
        title="There Is a Light That Never Goes Out"
        sub="The Smiths"
        imageUrl={covers.ocean}
        openLabel="Open album The Queen Is Dead"
        onOpen={fn()}
        onAdd={fn()}
        reasonOnHover={reasonOnHover}
        aside={<FanBubbles {...args} />}
      />
    </div>
  );
  return champion ? <ChampionContext.Provider value={championOf(champion)}>{card}</ChampionContext.Provider> : card;
}

const meta = {
  title: 'Common/FanBubbles/Layouts',
  component: Card,
  args: { people: two, size: 'large', scale: 1.3, imageFor, viewer: null, reasonOnHover: true },
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

const set = (arrangement: BubbleArrangement) => ({
  two: { args: { arrangement, people: two } } satisfies Story,
  four: { args: { arrangement, people: four, champion: 'Priya Shah' } } satisfies Story,
  eight: { args: { arrangement, people: eight } } satisfies Story,
});

const spiral = set('spiral');
/** 1. Golden spiral: biggest at the eye, the rest further round a φ spiral; the spiral sways a few degrees. */
export const SpiralTwo = spiral.two;
export const SpiralFour = spiral.four;
export const SpiralEight = spiral.eight;

const sunflower = set('sunflower');
/** 2. Sunflower: 137.5° steps out from the biggest face; the head breathes. */
export const SunflowerTwo = sunflower.two;
export const SunflowerFour = sunflower.four;
export const SunflowerEight = sunflower.eight;

const packed = set('packed');
/** 3. Packed cluster: snug round the biggest; the cluster bobs as one. */
export const PackedTwo = packed.two;
export const PackedFour = packed.four;
export const PackedEight = packed.eight;

const orbit = set('orbit');
/** 4. Orbit: the biggest still in the middle, the rest slowly round two rings, the outer one the other way. */
export const OrbitTwo = orbit.two;
export const OrbitFour = orbit.four;
export const OrbitEight = orbit.eight;

const arc = set('arc');
/** 5. Corner arc: the biggest in the top-right corner, the rest swept round it on a quarter circle. */
export const ArcTwo = arc.two;
export const ArcFour = arc.four;
export const ArcEight = arc.eight;

const stack = set('stack');
/** 6. Soft stack: a diagonal pile, biggest in front, parted by a 2px surface ring; it fans out and back. */
export const StackTwo = stack.two;
export const StackFour = stack.four;
export const StackEight = stack.eight;

const constellation = set('constellation');
/** 7. Constellation: faces spread over the upper art, joined by faint tint lines; each drifts on its own. */
export const ConstellationTwo = constellation.two;
export const ConstellationFour = constellation.four;
export const ConstellationEight = constellation.eight;
