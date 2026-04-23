import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuedlePanel } from '../QueuedlePanel';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockUseDailyGame = vi.fn();
const mockUseSubmitGameScore = vi.fn();
const mockUseGameLeaderboard = vi.fn();
vi.mock('../../hooks/useDailyGame', () => ({
  useDailyGame: () => mockUseDailyGame(),
  useSubmitGameScore: () => mockUseSubmitGameScore(),
  useGameLeaderboard: () => mockUseGameLeaderboard(),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('TestUser');
  mockUseDailyGame.mockReturnValue({ data: baseGame, isLoading: false, error: null });
  mockUseSubmitGameScore.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseGameLeaderboard.mockReturnValue({ data: null });
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
    expect(screen.getByText("Failed to load today's Queuedle.")).toBeInTheDocument();
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

  // ── main game phase ───────────────────────────────────────────────────────

  it('shows the QuestionCard in main phase', () => {
    render(<QueuedlePanel />);
    expect(screen.getByText('Question: Song A vs Song B')).toBeInTheDocument();
  });

  it('shows title and game ID', () => {
    render(<QueuedlePanel />);
    expect(screen.getByText('Queuedle')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
  });

  it('navigates to /leaderboard when the header button is clicked', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await user.click(screen.getByText('Leaderboard →'));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });

  it('picking an answer reveals the result', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
    await user.click(screen.getByText('Pick Left'));
    expect(screen.getByText('revealed-left')).toBeInTheDocument();
  });

  it('clicking Next on the only question transitions to bonus phase', async () => {
    const user = userEvent.setup();
    render(<QueuedlePanel />);
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
    await flushPromises(); // wait for displayName to be set
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
    await flushPromises();
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
    await flushPromises();
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
    await flushPromises();
    // Pick correct answer (winner is 'left') → mainScore = 1
    await user.click(screen.getByText('Pick Left'));
    await user.click(screen.getByText('Next'));
    await user.click(screen.getByText('Submit Bonus'));
    await waitFor(() => screen.getByText('Bonus results'));
    await user.click(screen.getByText('See Score'));
    // main=1 (picked left, winner is left), bonus=0 (bonusSelections all null, topQueuer is 'alice')
    expect(screen.getByText('Score: 1')).toBeInTheDocument();
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
    });
    render(<QueuedlePanel />);
    await waitFor(() => expect(screen.getByText("Today's Leaderboard")).toBeInTheDocument());
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
});
