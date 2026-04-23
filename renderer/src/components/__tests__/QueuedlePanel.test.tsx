import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  QueuedleQuestionCard: ({ question }: { question: { left: { name: string }; right: { name: string } } }) => (
    <div>Question: {question.left.name} vs {question.right.name}</div>
  ),
}));
vi.mock('../QueuedleBonusScreen', () => ({
  QueuedleBonusScreen: () => <div>Bonus screen</div>,
}));
vi.mock('../QueuedleBonusResults', () => ({
  QueuedleBonusResults: () => <div>Bonus results</div>,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('TestUser');
  mockUseDailyGame.mockReturnValue({ data: baseGame, isLoading: false, error: null });
  mockUseSubmitGameScore.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  mockUseGameLeaderboard.mockReturnValue({ data: null });
});

describe('QueuedlePanel', () => {
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

  it('shows the QuestionCard in main phase', () => {
    render(<QueuedlePanel />);
    expect(screen.getByText('Question: Song A vs Song B')).toBeInTheDocument();
  });

  it('shows title and game ID', () => {
    render(<QueuedlePanel />);
    expect(screen.getByText('Queuedle')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
  });

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
    // Wait for getDisplayName to resolve and trigger alreadyPlayed detection
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
