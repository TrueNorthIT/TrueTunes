// Revisit flow with the REAL query hooks and the REAL QueuedleSummary (only the
// interactive play screens are stubbed). Covers leaving the Queuedle page and
// coming back: the page must show "Your answers", not just the
// "You've already played today" footer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueuedlePanel } from '../QueuedlePanel';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('../QueuedleIntro', () => ({
  QueuedleIntro: ({ onStart }: { onStart: () => void }) => <button onClick={onStart}>Start</button>,
}));
vi.mock('../QueuedleQuestionCard', () => ({
  QueuedleQuestionCard: ({ onPick, onNext }: { onPick: (s: 'left' | 'right') => void; onNext: () => void }) => (
    <div>
      <button onClick={() => onPick('left')}>Pick Left</button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));
vi.mock('../QueuedleBonusScreen', () => ({
  QueuedleBonusScreen: ({ onSubmit }: { onSubmit: () => void }) => <button onClick={onSubmit}>Submit Bonus</button>,
}));
vi.mock('../QueuedleBonusResults', () => ({
  QueuedleBonusResults: ({ onContinue }: { onContinue: () => void }) => <button onClick={onContinue}>See Score</button>,
}));
vi.mock('../QueuedleRankChange', () => ({
  QueuedleRankChange: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Continue Rank</button>
  ),
}));

const GAME_ID = '2026-10-20';

function question(index: number, winner: 'left' | 'right' = 'left'): GameQuestion {
  const item = (id: string, name: string, topQueuer: string): GameItem => ({
    id,
    name,
    category: 'track',
    subtitle: '',
    imageUrl: undefined,
    count: 5,
    topQueuer,
    queuerCandidates: [],
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
    bonusOptions: [
      { name: 'alice', pct: 60 },
      { name: 'bob', pct: 40 },
    ],
  })),
};

const playedEntry = { userName: 'Rich', mainScore: 2, bonusScore: 1, total: 3 } as GameScoreDoc;

const fullScore: GameMyScoreResult = {
  score: { mainScore: 2, bonusScore: 1, guesses: { main: ['left', 'right'], bonus: ['alice', 'bob'] } },
};

let client: QueryClient;
function renderPanel() {
  return render(
    <QueryClientProvider client={client}>
      <QueuedlePanel />
    </QueryClientProvider>
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
  sonos.fetchUsers.mockResolvedValue([]);
  sonos.fetchMyScore.mockImplementation(opts.myScore ?? (() => Promise.resolve({})));
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('Queuedle revisit shows the question breakdown', () => {
  it('after finishing, leaving the page and coming back (same QueryClient, localStorage kept)', async () => {
    stubServer({ game: gameWith(1), myScore: () => Promise.resolve({}) });
    vi.mocked(window.sonos.submitGameScore).mockResolvedValue({ score: { mainScore: 1, bonusScore: 1 } } as never);
    // Six clicks through a whole game: the default delay:0 puts a real setTimeout
    // between every pointer sub-event, and under a loaded CPU each of those waits
    // for a scheduler slice. delay:null drops them (~600ms -> ~400ms alone).
    const user = userEvent.setup({ delay: null });

    const first = renderPanel();
    await act(async () => {
      await Promise.resolve();
    });
    await user.click(await screen.findByText('Start'));
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await user.click(await screen.findByText('See Score'));
    await user.click(await screen.findByText('Continue Rank'));
    first.unmount();

    // The server now has the score; the my-score cached before submission must not stick.
    vi.mocked(window.sonos.fetchMyScore).mockResolvedValue({
      score: { mainScore: 1, bonusScore: 1, guesses: { main: ['left'], bonus: ['alice'] } },
    });
    vi.mocked(window.sonos.fetchGameLeaderboard).mockResolvedValue({
      gameId: GAME_ID,
      scores: [{ ...playedEntry, mainScore: 1, bonusScore: 1, total: 2 }],
    });
    renderPanel();

    expect(await screen.findByText('Your answers')).toBeInTheDocument();
    expect(screen.getByText(/already played today/)).toBeInTheDocument();
  });

  it('local entry without guesses + server guesses', async () => {
    localStorage.setItem(`queuedle-played:${GAME_ID}`, JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    renderPanel();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
  });

  it('local guesses [] do not block the server guesses', async () => {
    localStorage.setItem(`queuedle-played:${GAME_ID}`, JSON.stringify({ mainScore: 2, bonusScore: 1, guesses: [] }));
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    renderPanel();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
  });

  it('short local guesses (fewer than questions) fall back to the server guesses', async () => {
    localStorage.setItem(
      `queuedle-played:${GAME_ID}`,
      JSON.stringify({ mainScore: 2, bonusScore: 1, guesses: ['left'] })
    );
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    renderPanel();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
  });

  it('a failed my-score fetch is retried and the breakdown appears', async () => {
    localStorage.setItem(`queuedle-played:${GAME_ID}`, JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    const myScore = vi.fn().mockResolvedValueOnce({ error: 'unauthorised' }).mockResolvedValue(fullScore);
    stubServer({ leaderboard: [playedEntry], myScore });
    renderPanel();
    expect(await screen.findByText(/already played today/)).toBeInTheDocument();
    expect(await screen.findByText('Your answers', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(myScore).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('a stale empty my-score cached before the user played is refetched on remount', async () => {
    localStorage.setItem(`queuedle-played:${GAME_ID}`, JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve({}) });
    const first = renderPanel();
    await screen.findByText(/already played today/);
    await waitFor(() => expect(window.sonos.fetchMyScore).toHaveBeenCalled());
    first.unmount();

    vi.mocked(window.sonos.fetchMyScore).mockResolvedValue(fullScore);
    renderPanel();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
  });

  it('no local entry but on the leaderboard: breakdown from server guesses', async () => {
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    renderPanel();
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
  });

  it('upgrades the local entry with the guesses once fetched from the server', async () => {
    localStorage.setItem(`queuedle-played:${GAME_ID}`, JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    renderPanel();
    await screen.findByText('Your answers');
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(`queuedle-played:${GAME_ID}`)!).guesses).toEqual(['left', 'right'])
    );
  });

  it('short server guesses: no crash and no partial review', async () => {
    stubServer({
      leaderboard: [playedEntry],
      myScore: () =>
        Promise.resolve({
          score: { mainScore: 2, bonusScore: 1, total: 3, guesses: { main: ['left'], bonus: ['alice'] } },
        }),
    });
    renderPanel();
    expect(await screen.findByText(/already played today/)).toBeInTheDocument();
    await waitFor(() => expect(window.sonos.fetchMyScore).toHaveBeenCalled());
    expect(screen.queryByText('Your answers')).not.toBeInTheDocument();
  });

  it("shows my bonus picks with right/wrong marks next to the others' percentages", async () => {
    stubServer({
      leaderboard: [playedEntry],
      myScore: () =>
        Promise.resolve({
          score: {
            mainScore: 2,
            bonusScore: 1,
            total: 3,
            guesses: { main: ['left', 'left'], bonus: ['alice', 'zed'] },
          },
        }),
    });
    renderPanel();
    await screen.findByText('Your answers');
    expect(await screen.findByText(/✓ alice/)).toBeInTheDocument();
    expect(screen.getByText(/✗ zed/)).toBeInTheDocument();
    expect(screen.getAllByText(/alice 60% · bob 40%/)).toHaveLength(2);
  });

  it('a past day from the calendar shows the review for that gameId', async () => {
    const pastId = '2026-10-19';
    const todayGame = gameWith(2);
    const pastGame = { ...gameWith(2), id: pastId };
    stubServer({ leaderboard: [playedEntry], myScore: () => Promise.resolve(fullScore) });
    vi.mocked(window.sonos.fetchDailyGame).mockImplementation(async (d?: string) =>
      d === pastId ? pastGame : todayGame
    );
    vi.mocked(window.sonos.fetchGameDates).mockResolvedValue({
      dates: [{ gameId: pastId, status: 'ready', userPlayed: true }],
    } as never);
    vi.mocked(window.sonos.fetchGameLeaderboard).mockImplementation(async (d?: string) => ({
      gameId: d ?? GAME_ID,
      scores: [playedEntry],
    }));
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByText('Past games'));
    await user.click(await screen.findByRole('button', { name: /19/ }));
    expect(await screen.findByText('Your answers')).toBeInTheDocument();
    expect(window.sonos.fetchMyScore).toHaveBeenCalledWith(pastId, 'Rich');
  });
});
