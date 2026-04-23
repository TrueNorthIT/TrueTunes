import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuedlePanel } from '../QueuedlePanel';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockUseDailyGame = vi.fn();
const mockUseSubmitGameScore = vi.fn();
const mockUseGameLeaderboard = vi.fn();
const mockUseGameDates = vi.fn();
vi.mock('../../hooks/useDailyGame', () => ({
  useDailyGame: (date?: string) => mockUseDailyGame(date),
  useSubmitGameScore: () => mockUseSubmitGameScore(),
  useGameLeaderboard: (date?: string) => mockUseGameLeaderboard(date),
  useGameDates: (userName?: string | null) => mockUseGameDates(userName),
}));

vi.mock('../QueuedleIntro', () => ({
  QueuedleIntro: ({ onStart }: { onStart: () => void }) => (
    <div>
      Intro screen
      <button onClick={onStart}>Start</button>
    </div>
  ),
}));
vi.mock('../QueuedleQuestionCard', () => ({
  QueuedleQuestionCard: ({
    question,
    revealed,
    pickedSide,
    onPick,
    onNext,
  }: {
    question: { left: { name: string }; right: { name: string } };
    revealed: boolean;
    pickedSide: string | null;
    onPick: (side: 'left' | 'right') => void;
    onNext: () => void;
  }) => (
    <div>
      <div>Question: {question.left.name} vs {question.right.name}</div>
      {revealed && <div>revealed-{pickedSide}</div>}
      <button onClick={() => onPick('left')}>Pick Left</button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));
vi.mock('../QueuedleBonusScreen', () => ({
  QueuedleBonusScreen: ({
    onSubmit,
    submitting,
  }: {
    onSubmit: () => void;
    submitting: boolean;
  }) => (
    <div>
      {submitting ? 'Bonus screen (submitting)' : 'Bonus screen'}
      <button onClick={onSubmit}>Submit Bonus</button>
    </div>
  ),
}));
vi.mock('../QueuedleBonusResults', () => ({
  QueuedleBonusResults: ({ onContinue }: { onContinue: () => void }) => (
    <div>
      Bonus results
      <button onClick={onContinue}>See Score</button>
    </div>
  ),
}));
vi.mock('../QueuedleSummary', () => ({
  QueuedleSummary: ({ mainScore, bonusScore }: { mainScore: number; bonusScore: number }) => (
    <div>Score: {mainScore + bonusScore}</div>
  ),
}));
vi.mock('../QueuedleCalendar', () => ({
  QueuedleCalendar: ({ dates, selectedDate, onSelectDate }: {
    dates: GameDateEntry[];
    selectedDate: string | null;
    onSelectDate: (id: string) => void;
  }) => (
    <div>
      <div>Calendar (selected: {selectedDate ?? 'none'})</div>
      {dates.map((d) => (
        <button
          key={d.gameId}
          onClick={() => onSelectDate(d.gameId)}
          disabled={d.userPlayed}
        >
          cal-{d.gameId}{d.userPlayed ? '-played' : ''}
        </button>
      ))}
    </div>
  ),
}));

const baseQuestion: GameQuestion = {
  index: 0,
  left:  { id: 'l1', name: 'Song A', category: 'track', subtitle: '', imageUrl: undefined, count: 10, topQueuer: 'alice', queuerCandidates: [] },
  right: { id: 'r1', name: 'Song B', category: 'track', subtitle: '', imageUrl: undefined, count: 8,  topQueuer: 'bob',   queuerCandidates: [] },
  winner: 'left',
  bonusItem: 'left',
};

const baseGame: GameDoc = {
  id: '2024-01-01',
  status: 'ready',
  generatedAt: 0,
  lowData: false,
  questions: [baseQuestion],
};

function flushPromises() {
  return act(async () => { await Promise.resolve(); });
}

async function startGame(user: ReturnType<typeof userEvent.setup>) {
  await flushPromises(); // wait for displayName
  await user.click(await screen.findByText('Start'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('TestUser');
  mockUseDailyGame.mockReturnValue({ data: baseGame, isLoading: false, error: null });
  mockUseSubmitGameScore.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseGameLeaderboard.mockReturnValue({ data: { scores: [] }, isLoading: false });
  mockUseGameDates.mockReturnValue({ data: { dates: [] }, isLoading: false });
});

describe('QueuedlePanel', () => {
  // ── loading / error states ────────────────────────────────────────────────

  it('shows loading state', () => {
    mockUseDailyGame.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<QueuedlePanel />);
    expect(screen.getByText("Loading today's Queuedle…")).toBeInTheDocument();
  });

  it('shows error state when data is null', () => {
    mockUseDailyGame.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<QueuedlePanel />);
    expect(screen.getByText('Failed to load Queuedle.')).toBeInTheDocument();
  });

  it('shows error message from data.error field', () => {
    mockUseDailyGame.mockReturnValue({ data: { error: 'Not available yet' }, isLoading: false, error: null });
    render(<QueuedlePanel />);
    expect(screen.getByText('Not available yet')).toBeInTheDocument();
  });

  it('shows pending message when status is pending', () => {
    mockUseDailyGame.mockReturnValue({ data: { status: 'pending' }, isLoading: false, error: null });
    render(<QueuedlePanel />);
    expect(screen.getByText(/still brewing/)).toBeInTheDocument();
  });

  it('shows empty state when no questions', () => {
    mockUseDailyGame.mockReturnValue({ data: { ...baseGame, questions: [] }, isLoading: false, error: null });
    render(<QueuedlePanel />);
    expect(screen.getByText(/Not enough play history/)).toBeInTheDocument();
  });

  it('shows the resolving state while leaderboard is loading', () => {
    mockUseGameLeaderboard.mockReturnValue({ data: undefined, isLoading: true });
    render(<QueuedlePanel />);
    expect(screen.getByText('Checking your score…')).toBeInTheDocument();
  });

  // ── intro / main game phase ───────────────────────────────────────────────

  it('shows the intro screen before the user starts', async () => {
    render(<QueuedlePanel />);
    await flushPromises();
    expect(await screen.findByText('Intro screen')).toBeInTheDocument();
  });

  it('shows the QuestionCard after starting from the intro', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    expect(screen.getByText('Question: Song A vs Song B')).toBeInTheDocument();
  });

  it('shows title and game ID', async () => {
    render(<QueuedlePanel />);
    await flushPromises();
    expect(screen.getByText('Queuedle')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
  });

  it('navigates to /leaderboard when the header button is clicked', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await flushPromises();
    await user.click(screen.getByText('Leaderboard →'));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });

  it('picking an answer reveals the result', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    expect(screen.getByText('revealed-left')).toBeInTheDocument();
  });

  it('clicking Next on the only question transitions to bonus phase', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    expect(screen.getByText(/Bonus screen/)).toBeInTheDocument();
  });

  it('clicking Next on a non-final question advances to the next question', async () => {
    const q2: GameQuestion = {
      ...baseQuestion,
      index: 1,
      left:  { ...baseQuestion.left,  name: 'Song C' },
      right: { ...baseQuestion.right, name: 'Song D' },
    };
    mockUseDailyGame.mockReturnValue({ data: { ...baseGame, questions: [baseQuestion, q2] }, isLoading: false, error: null });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('Question: Song C vs Song D')).toBeInTheDocument();
  });

  // ── bonus → bonus-results → summary ──────────────────────────────────────

  it('submitting the bonus calls mutateAsync and shows bonus-results', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ score: { mainScore: 1, bonusScore: 0 } });
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => expect(screen.getByText('Bonus results')).toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ gameId: '2024-01-01', userName: 'TestUser' }));
  });

  it('continuing from bonus-results shows the summary with result.score', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ score: { mainScore: 1, bonusScore: 1 } });
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    await user.click(screen.getByText('See Score'));
    expect(screen.getByText('Score: 2')).toBeInTheDocument();
  });

  it('uses result.existing score when no result.score', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ existing: { mainScore: 0, bonusScore: 1 } });
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    await user.click(screen.getByText('See Score'));
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('calculates score locally when result has neither score nor existing', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    // Pick correct answer (winner is 'left') → mainScore = 1
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    await user.click(screen.getByText('See Score'));
    // main=1 (picked left, winner is left), bonus=0 (bonusSelections all null, topQueuer is 'alice')
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('keeps bonus-results visible even after the leaderboard refetches with the user', async () => {
    // Regression: previously the alreadyPlayed early-return would clobber the
    // bonus-results / summary phases as soon as the post-submit leaderboard
    // refetch landed with the user's new entry.
    const mutateAsync = vi.fn().mockResolvedValue({ score: { mainScore: 1, bonusScore: 0 } });
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    // Simulate the leaderboard refetch landing with the user's new score.
    mockUseGameLeaderboard.mockReturnValue({
      data: { scores: [{ userName: 'TestUser', mainScore: 1, bonusScore: 0, total: 1 }] },
      isLoading: false,
    });
    await flushPromises();
    expect(screen.getByText('Bonus results')).toBeInTheDocument();
    await user.click(screen.getByText('See Score'));
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
  });

  it('persists the score to localStorage on submit', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ score: { mainScore: 1, bonusScore: 0 } });
    mockUseSubmitGameScore.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await startGame(user);
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    expect(localStorage.getItem('queuedle-played:2024-01-01')).toBe(
      JSON.stringify({ mainScore: 1, bonusScore: 0 }),
    );
  });

  // ── already-played ────────────────────────────────────────────────────────

  it('shows already-played summary when user has a leaderboard entry', async () => {
    mockUseGameLeaderboard.mockReturnValue({
      data: {
        scores: [{
          userName: 'TestUser',
          mainScore: 3,
          bonusScore: 2,
          total: 5,
        }],
      },
      isLoading: false,
    });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText('Score: 5')).toBeInTheDocument());
  });

  it('shows leaderboard when already played and scores exist', async () => {
    mockUseGameLeaderboard.mockReturnValue({
      data: {
        scores: [
          { userName: 'TestUser', mainScore: 3, bonusScore: 2, total: 5 },
          { userName: 'alice', mainScore: 2, bonusScore: 1, total: 3 },
        ],
      },
      isLoading: false,
    });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText("Today's Leaderboard")).toBeInTheDocument());
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('skips the intro and shows already-played when localStorage has the score', async () => {
    localStorage.setItem('queuedle-played:2024-01-01', JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    // Leaderboard hasn't loaded yet — localStorage should short-circuit.
    mockUseGameLeaderboard.mockReturnValue({ data: undefined, isLoading: true });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText('Score: 3')).toBeInTheDocument());
    expect(screen.queryByText('Intro screen')).not.toBeInTheDocument();
  });

  // ── calendar / past-day picker ───────────────────────────────────────────

  it('exposes the calendar behind a header button on the already-played view', async () => {
    localStorage.setItem('queuedle-played:2024-01-01', JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    mockUseGameDates.mockReturnValue({
      data: { dates: [
        { gameId: '2024-01-01', status: 'ready', userPlayed: true },
        { gameId: '2023-12-31', status: 'ready', userPlayed: false },
      ]},
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    // Calendar is not rendered inline — it's hidden until the button is clicked.
    await waitFor(() => expect(screen.getByText('📅 Calendar')).toBeInTheDocument());
    expect(screen.queryByText('cal-2023-12-31')).not.toBeInTheDocument();
    await user.click(screen.getByText('📅 Calendar'));
    expect(screen.getByText('cal-2023-12-31')).toBeInTheDocument();
    expect(screen.getByText('cal-2024-01-01-played')).toBeInTheDocument();
  });

  it('hides the calendar button when there are no game-dates entries', async () => {
    localStorage.setItem('queuedle-played:2024-01-01', JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    mockUseGameDates.mockReturnValue({ data: { dates: [] }, isLoading: false });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText('Score: 3')).toBeInTheDocument());
    expect(screen.queryByText('📅 Calendar')).not.toBeInTheDocument();
  });

  it('selecting a past date in the calendar closes the popup and resets to the intro screen', async () => {
    localStorage.setItem('queuedle-played:2024-01-01', JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    mockUseGameDates.mockReturnValue({
      data: { dates: [{ gameId: '2023-12-31', status: 'ready', userPlayed: false }] },
      isLoading: false,
    });
    // useDailyGame returns whichever date the panel asks for, so initial load
    // hits today's already-played view and the post-click load hits the past day.
    mockUseDailyGame.mockImplementation((date?: string) => ({
      data: date ? { ...baseGame, id: date } : baseGame,
      isLoading: false,
      error: null,
    }));
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await user.click(await screen.findByText('📅 Calendar'));
    await user.click(screen.getByText('cal-2023-12-31'));
    expect(await screen.findByText('Intro screen')).toBeInTheDocument();
    expect(screen.getByText('← Today')).toBeInTheDocument();
    // Popup no longer mounted after selection.
    expect(screen.queryByText('cal-2023-12-31')).not.toBeInTheDocument();
  });

  it('back-to-today returns to the today view', async () => {
    localStorage.setItem('queuedle-played:2024-01-01', JSON.stringify({ mainScore: 2, bonusScore: 1 }));
    mockUseGameDates.mockReturnValue({
      data: { dates: [{ gameId: '2023-12-31', status: 'ready', userPlayed: false }] },
      isLoading: false,
    });
    mockUseDailyGame.mockImplementation((date?: string) => ({
      data: date ? { ...baseGame, id: date } : baseGame,
      isLoading: false,
      error: null,
    }));
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await user.click(await screen.findByText('📅 Calendar'));
    await user.click(await screen.findByText('cal-2023-12-31'));
    expect(await screen.findByText('Intro screen')).toBeInTheDocument();
    await user.click(screen.getByText('← Today'));
    // After back-to-today, the localStorage short-circuit re-fires for today's id.
    await waitFor(() => expect(screen.getByText('Score: 3')).toBeInTheDocument());
  });

  it('backfills localStorage when the leaderboard shows the user played but the local key is missing', async () => {
    // No localStorage entry — the cloud is the only signal.
    mockUseGameLeaderboard.mockReturnValue({
      data: {
        scores: [{ userName: 'TestUser', mainScore: 3, bonusScore: 2, total: 5 }],
      },
      isLoading: false,
    });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText('Score: 5')).toBeInTheDocument());
    await waitFor(() =>
      expect(localStorage.getItem('queuedle-played:2024-01-01')).toBe(
        JSON.stringify({ mainScore: 3, bonusScore: 2 }),
      ),
    );
  });
});
