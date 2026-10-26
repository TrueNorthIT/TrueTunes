import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { QueueActionsProvider } from '../../hooks/useQueueActions';
import { covers, portrait } from '../../../.storybook/fixtures';
import { QueuedlePanel } from './QueuedlePanel';

// The real Queuedle page, fed from fixtures through the fake bridge: nothing here can submit a real score or
// touch the office speakers. A game in progress is restored from saved progress, exactly as the app resumes one.

const GAME_ID = '2026-10-26';
const ME = 'Sam Okafor';

const people = [
  'Kade Andrew Hennessy',
  'Priya Ramanathan-Whitfield',
  'Jo Lee',
  'Marguerite Okonkwo-Fairbairn',
  'Tom Briggs',
  'Anneliese van der Berg',
  'Dev Patel',
  'Rosalind Achterberg',
];
const photos: Record<string, string> = { 'Jo Lee': portrait, 'Tom Briggs': portrait, 'Dev Patel': portrait };

const art = [covers.sunset, covers.ocean, covers.forest, covers.neon];

/** Eleven contenders: the winner of each round stays on to face the next. */
const items: GameItem[] = [
  ['track', 'Everything In Its Right Place (Live at the Hollywood Bowl, 2001)', 'Radiohead'],
  ['artist', 'Florence + the Machine', ''],
  ['album', 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars', 'David Bowie'],
  ['track', 'Mr. Brightside', 'The Killers'],
  ['artist', 'Godspeed You! Black Emperor', ''],
  ['album', 'Random Access Memories', 'Daft Punk'],
  ['track', 'Dancing On My Own', 'Robyn'],
  ['artist', 'Fleetwood Mac', ''],
  ['album', 'To Pimp a Butterfly', 'Kendrick Lamar'],
  ['track', 'Last Nite', 'The Strokes'],
  ['artist', 'Khruangbin', ''],
].map(([category, name, subtitle], i) => {
  const candidates = [0, 1, 2, 3].map((k) => people[(i * 3 + k) % people.length]).slice(0, i % 3 === 2 ? 3 : 4);
  return {
    category: category as GameItemCategory,
    id: `item-${i}`,
    name,
    subtitle,
    imageUrl: category === 'artist' ? portrait : art[i % art.length],
    ...(category === 'track' && { uri: `track-${i}`, serviceId: 'svc', accountId: 'acc' }),
    count: 40 + ((i * 37) % 90),
    topQueuer: candidates[i % candidates.length],
    queuerCandidates: candidates,
  };
});

const questions: GameQuestion[] = Array.from({ length: 10 }, (_, i) => {
  const [a, b] = [items[i], items[i + 1]];
  const winner: 'left' | 'right' = a.count >= b.count ? 'left' : 'right';
  return { index: i, left: a, right: b, winner, carryover: i === 0 ? undefined : 'left' };
});
// Carry the previous winner on the left, with its count, so the chain reads true.
for (let i = 1; i < questions.length; i++) {
  const prev = questions[i - 1];
  const carried = prev.winner === 'left' ? prev.left : prev.right;
  const q = questions[i];
  q.left = carried;
  q.winner = carried.count >= q.right.count ? 'left' : 'right';
  // The bonus asks about the challenger, so the ten cards are ten different things.
  q.bonusItem = 'right';
}

const game: GameDoc = { id: GAME_ID, status: 'ready', generatedAt: 0, lowData: false, questions };
questions[0].bonusItem = questions[0].winner;
const winners = questions.map((q) => (q.bonusItem === 'left' ? q.left : q.right));

const scores: GameScoreDoc[] = people.slice(0, 5).map((userName, i) => ({
  id: `s${i}`,
  gameId: GAME_ID,
  userName,
  mainScore: 8 - i,
  bonusScore: 5 - i,
  total: 13 - 2 * i,
  completedAt: 0,
}));

type Progress = {
  phase: 'main' | 'bonus';
  currentIdx: number;
  pickedSide: 'left' | 'right' | null;
  mainGuesses: Array<'left' | 'right'>;
  bonusSelections: (string | null)[];
};

const allRight = questions.map((q) => q.winner);
/** Some right, some wrong, for the bonus results. */
const picks = winners.map((w, i) =>
  i % 3 === 1 ? (w.queuerCandidates.find((n) => n !== w.topQueuer) ?? w.topQueuer) : w.topQueuer
);

function stub(progress: Progress | null) {
  return () => {
    const sonos = window.sonos as unknown as Record<string, unknown>;
    const saved = { ...sonos };
    Object.assign(sonos, {
      fetchDailyGame: () => Promise.resolve(game),
      fetchGameLeaderboard: () => Promise.resolve({ gameId: GAME_ID, scores }),
      fetchGameDates: () => Promise.resolve({ dates: [{ gameId: GAME_ID, status: 'ready', userPlayed: false }] }),
      getDisplayName: () => Promise.resolve(ME),
      fetchUsers: () => Promise.resolve(people.map((userId) => ({ userId, lastQueued: 0, imageUrl: photos[userId] }))),
      fetchMyScore: () => Promise.resolve({}),
      fetchGameStats: () => Promise.resolve({ totalPlayers: 0, questions: [] }),
      submitGameScore: () =>
        Promise.resolve({
          ok: true,
          score: { ...scores[0], userName: ME, mainScore: 7, bonusScore: 6, total: 13 },
        }),
    });
    const clear = () => {
      localStorage.removeItem(`queuedle-played:${GAME_ID}`);
      localStorage.removeItem(`queuedle-progress:${GAME_ID}`);
    };
    clear();
    if (progress) {
      localStorage.setItem(`queuedle-progress:${GAME_ID}`, JSON.stringify({ ...progress, savedAt: Date.now() }));
    }
    return () => {
      Object.assign(sonos, saved);
      clear();
    };
  };
}

/** The app's frame: the page beside the docked 380px queue, under the floating nav and over the player. */
function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: 'var(--bg)' }}>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}>{children}</main>
      <aside aria-label="Queue" style={{ width: 380, flex: 'none', background: 'var(--surface)' }} />
    </div>
  );
}

const meta = {
  title: 'Queuedle/QueuedlePanel',
  component: QueuedlePanel,
  decorators: [
    (Story) => (
      <AppFrame>
        <Story />
      </AppFrame>
    ),
  ],
} satisfies Meta<typeof QueuedlePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Before the game: the header, the start card and the two rounds explained. */
export const Intro: Story = {
  beforeEach: stub(null),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Queuedle', level: 1 })).toBeVisible();
  },
};

/** Mid-game, round five, waiting for a pick. No header: the round fills the window. */
export const Question: Story = {
  beforeEach: stub({
    phase: 'main',
    currentIdx: 4,
    pickedSide: null,
    mainGuesses: allRight.slice(0, 4),
    bonusSelections: [],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Which has the office queued more?');
    await expect(canvas.queryByRole('heading', { name: 'Queuedle', level: 1 })).toBeNull();
  },
};

/** Round five answered: both counts, the verdict and Next. */
export const QuestionRevealed: Story = {
  beforeEach: stub({
    phase: 'main',
    currentIdx: 4,
    pickedSide: questions[4].winner === 'left' ? 'right' : 'left',
    mainGuesses: [...allRight.slice(0, 4), questions[4].winner === 'left' ? 'right' : 'left'],
    bonusSelections: [],
  }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: 'Next' });
  },
};

/** Round three answered, with a track as the challenger: its + adds it to the queue (here, to the Actions panel). */
export const QuestionRevealedTrack: Story = {
  beforeEach: stub({
    phase: 'main',
    currentIdx: 2,
    pickedSide: questions[2].winner,
    mainGuesses: allRight.slice(0, 3),
    bonusSelections: [],
  }),
  decorators: [
    (Story) => (
      <QueueActionsProvider value={{ addToQueue: fn(), queueNext: fn() }}>
        <Story />
      </QueueActionsProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: `Add ${questions[2].right.name} to queue` });
  },
};

/** Already played today: the scores, the room and your answers, where each track has its +. */
export const Results: Story = {
  beforeEach: () => {
    const restore = stub(null)();
    localStorage.setItem(
      `queuedle-played:${GAME_ID}`,
      JSON.stringify({ mainScore: 7, bonusScore: 6, guesses: allRight })
    );
    return restore;
  },
  decorators: [
    (Story) => (
      <QueueActionsProvider value={{ addToQueue: fn(), queueNext: fn() }}>
        <Story />
      </QueueActionsProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Your answers');
    await expect(canvas.getAllByRole('button', { name: `Add ${items[3].name} to queue` }).length).toBeGreaterThan(0);
  },
};

/** The top queuer round, part answered: ten cards, five by two. */
export const Bonus: Story = {
  beforeEach: stub({
    phase: 'bonus',
    currentIdx: 9,
    pickedSide: 'left',
    mainGuesses: allRight,
    bonusSelections: picks.map((p, i) => (i < 6 ? p : null)),
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('6 of 10 answered');
    await expect(canvas.getByRole('button', { name: 'Submit' })).toBeDisabled();
  },
};

/** The bonus round marked, reached by submitting a finished round (to the fake bridge). */
export const BonusResults: Story = {
  beforeEach: stub({
    phase: 'bonus',
    currentIdx: 9,
    pickedSide: 'left',
    mainGuesses: allRight,
    bonusSelections: picks,
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Submit' }));
    await canvas.findByRole('heading', { name: 'Bonus results' });
  },
};
