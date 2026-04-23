import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuedleBonusResults } from '../QueuedleBonusResults';
import { QueuedleSummary } from '../QueuedleSummary';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

beforeEach(() => {
  vi.clearAllMocks();
});

const items: GameItem[] = [
  { id: '1', name: 'Come Together', category: 'track', subtitle: 'Abbey Road', imageUrl: null, topQueuer: 'alice', stat: 5, isExplicit: false },
  { id: '2', name: 'The Beatles', category: 'artist', subtitle: null, imageUrl: 'http://img.com/art.jpg', topQueuer: 'bob', stat: 3, isExplicit: false },
];

describe('QueuedleBonusResults', () => {
  it('renders bonus results heading', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    expect(screen.getByText('Bonus results')).toBeInTheDocument();
  });

  it('shows item names', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('shows correct checkmark when guess matches topQueuer', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    expect(screen.getByText(/✓ alice/)).toBeInTheDocument();
  });

  it('shows wrong mark when guess does not match', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    expect(screen.getByText(/✗ wrong/)).toBeInTheDocument();
  });

  it('calls onContinue when See my score is clicked', async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'bob']} onContinue={onContinue} />);
    await user.click(screen.getByText('See my score'));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe('QueuedleSummary', () => {
  it('shows total score', () => {
    render(<QueuedleSummary mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows max total', () => {
    render(<QueuedleSummary mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    expect(screen.getByText('out of 8')).toBeInTheDocument();
  });

  it('shows breakdown rows', () => {
    render(<QueuedleSummary mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    expect(screen.getByText('Higher or lower')).toBeInTheDocument();
    expect(screen.getByText('Top queuer')).toBeInTheDocument();
  });

  it('shows already submitted message when alreadySubmitted is true', () => {
    render(<QueuedleSummary mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} alreadySubmitted />);
    expect(screen.getByText(/already played today/)).toBeInTheDocument();
  });

  it('navigates to /leaderboard when See leaderboard is clicked', async () => {
    const user = userEvent.setup();
    render(<QueuedleSummary mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    await user.click(screen.getByText('See leaderboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });
});
