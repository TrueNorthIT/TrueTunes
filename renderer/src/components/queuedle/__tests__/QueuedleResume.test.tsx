import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueuedlePanel } from '../QueuedlePanel';

// Leaving Queuedle part-way through and coming back must resume the game,
// with answered questions still answered, rather than starting it again.

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('../QueuedleIntro', () => ({
  QueuedleIntro: ({ onStart }: { onStart: () => void }) => <button onClick={onStart}>Start</button>,
}));
vi.mock('../QueuedleQuestionCard', () => ({
  QueuedleQuestionCard: ({ question, revealed, pickedSide, onPick, onNext }: {
    question: GameQuestion; revealed: boolean; pickedSide: 'left' | 'right' | null;
    onPick: (s: 'left' | 'right') => void; onNext: () => void;
  }) => (
    <div>
      <span>{`Question ${question.index}`}</span>
      <span>{revealed ? `Revealed ${pickedSide}` : 'Unanswered'}</span>
      <button onClick={() => onPick('left')}>Pick Left</button>
      <button onClick={() => onPick('right')}>Pick Right</button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));
vi.mock('../QueuedleBonusScreen', () => ({
  QueuedleBonusScreen: ({ selections, onSelect, onSubmit }: {
    selections: (string | null)[]; onSelect: (i: number, name: string) => void; onSubmit: () => void;
  }) => (
    <div>
      <span>{`Bonus ${selections.map((s) => s ?? '-').join(',')}`}</span>
      <button onClick={() => onSelect(0, 'alice')}>Choose Alice</button>
      <button onClick={onSubmit}>Submit Bonus</button>
    </div>
  ),
}));
vi.mock('../QueuedleBonusResults', () => ({
  QueuedleBonusResults: ({ onContinue }: { onContinue: () => void }) => <button onClick={onContinue}>See Score</button>,
}));
vi.mock('../QueuedleRankChange', () => ({
  QueuedleRankChange: ({ onContinue }: { onContinue: () => void }) => <button onClick={onContinue}>Continue Rank</button>,
}));

const GAME_ID = '2026-10-20';

function question(index: number, winner: 'left' | 'right' = 'left'): GameQuestion {
  const item = (id: string, name: string, topQueuer: string): GameItem => ({
    id, name, category: 'track', subtitle: '', imageUrl: undefined, count: 5, topQueuer, queuerCandidates: [],
  });
  return {
    index,
    left: item(`l${index}`, `Left ${index}`, 'alice'),
    right: item(`r${index}`, `Right ${index}`, 'bob'),
    winner,
    bonusItem: winner,
  };
}

function gameWith(n: number): GameDoc {
  return {
    id: GAME_ID,
    status: 'ready',
    generatedAt: 0,
    lowData: false,
    questions: Array.from({ length: n }, (_, i) => question(i)),
  };
}

const stats: GameStatsResult = {
  totalPlayers: 4,
  questions: [0, 1].map((i) => ({
    questionIndex: i,
    leftPct: 70,
    rightPct: 30,
    bonusOptions: [{ name: 'alice', pct: 60 }, { name: 'bob', pct: 40 }],
  })),
};

const playedEntry = { userName: 'Rich', mainScore: 2, bonusScore: 1, total: 3 } as GameScoreDoc;

const fullScore: GameMyScoreResult = {
  score: { mainScore: 2, bonusScore: 1, total: 3, guesses: { main: ['left', 'right'], bonus: ['alice', 'bob'] } },
};

let client: QueryClient;
function renderPanel() {
  return render(
    <QueryClientProvider client={client}>
      <QueuedlePanel />
    </QueryClientProvider>,
  );
}

function stubServer(opts: {
  game?: GameDoc;
  leaderboard?: GameScoreDoc[];
  myScore?: () => Promise<GameMyScoreResult>;
}) {
  const sonos = vi.mocked(window.sonos);
  sonos.getDisplayName.mockResolvedValue('Rich');
  sonos.fetchDailyGame.mockResolvedValue(opts.game ?? gameWith(2));
  sonos.fetchGameLeaderboard.mockResolvedValue({ gameId: GAME_ID, scores: opts.leaderboard ?? [] });
  sonos.fetchGameDates.mockResolvedValue({ dates: [] } as never);
  sonos.fetchGameStats.mockResolvedValue(stats);
  sonos.fetchMyScore.mockImplementation(opts.myScore ?? (() => Promise.resolve({})));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});


const KEY = `queuedle-progress:${GAME_ID}`;

async function mountAndSettle() {
  const view = renderPanel();
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('Queuedle resumes a game in progress', () => {
  it('keeps an answered question answered after leaving and coming back', async () => {
    stubServer({ game: gameWith(3) });
    const user = userEvent.setup();

    const first = await mountAndSettle();
    await user.click(await screen.findByText('Start'));
    await user.click(screen.getByText('Pick Right'));
    expect(screen.getByText('Revealed right')).toBeInTheDocument();
    first.unmount();

    await mountAndSettle();
    expect(await screen.findByText('Question 0')).toBeInTheDocument();
    expect(screen.getByText('Revealed right')).toBeInTheDocument();
    expect(screen.queryByText('Start')).not.toBeInTheDocument();

    // A second pick is ignored: the answer stays the one given first.
    await user.click(screen.getByText('Pick Left'));
    expect(screen.getByText('Revealed right')).toBeInTheDocument();
  });

  it('resumes on the next unanswered question', async () => {
    stubServer({ game: gameWith(3) });
    const user = userEvent.setup();

    const first = await mountAndSettle();
    await user.click(await screen.findByText('Start'));
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    first.unmount();

    await mountAndSettle();
    expect(await screen.findByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Unanswered')).toBeInTheDocument();
  });

  it('resumes the bonus round with its selections', async () => {
    stubServer({ game: gameWith(1) });
    const user = userEvent.setup();

    const first = await mountAndSettle();
    await user.click(await screen.findByText('Start'));
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Choose Alice'));
    expect(screen.getByText('Bonus alice')).toBeInTheDocument();
    first.unmount();

    await mountAndSettle();
    expect(await screen.findByText('Bonus alice')).toBeInTheDocument();
  });

  it('forgets the progress once the score is submitted', async () => {
    stubServer({ game: gameWith(1) });
    vi.mocked(window.sonos.submitGameScore).mockResolvedValue({ score: { mainScore: 1, bonusScore: 0 } } as never);
    const user = userEvent.setup();

    await mountAndSettle();
    await user.click(await screen.findByText('Start'));
    await user.click(screen.getByText('Pick Left'));
    expect(localStorage.getItem(KEY)).not.toBeNull();
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await screen.findByText('See Score');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not save anything before the game is started', async () => {
    stubServer({ game: gameWith(2) });
    await mountAndSettle();
    await screen.findByText('Start');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('drops saved progress when the server says the game is already played', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      phase: 'main', currentIdx: 1, pickedSide: null, mainGuesses: ['left'], bonusSelections: [], savedAt: Date.now(),
    }));
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    await mountAndSettle();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
