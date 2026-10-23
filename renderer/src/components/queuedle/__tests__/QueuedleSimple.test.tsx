import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuedleBonusResults } from '../QueuedleBonusResults';
import { QueuedleSummary } from '../QueuedleSummary';
import { MyScores } from '../MyScores';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

beforeEach(() => {
  vi.clearAllMocks();
});

const items: GameItem[] = [
  {
    id: '1',
    name: 'Come Together',
    category: 'track',
    subtitle: 'Abbey Road',
    imageUrl: undefined,
    topQueuer: 'alice',
    count: 5,
    queuerCandidates: [],
  },
  {
    id: '2',
    name: 'The Beatles',
    category: 'artist',
    subtitle: '',
    imageUrl: 'http://img.com/art.jpg',
    topQueuer: 'bob',
    count: 3,
    queuerCandidates: [],
  },
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

describe('MyScores', () => {
  it('shows the total out of the maximum', () => {
    render(<MyScores mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    expect(screen.getByText('out of 8').previousSibling).toHaveTextContent('5');
  });

  it('shows each round with its score', () => {
    render(<MyScores mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} />);
    expect(screen.getByText('Higher or lower')).toBeInTheDocument();
    expect(screen.getByText('Top queuer')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('shows the standing and the note', () => {
    render(
      <MyScores
        mainScore={3}
        bonusScore={2}
        maxMain={5}
        maxBonus={3}
        standing="Joint 1st of 5 today"
        note={<p>Come back tomorrow</p>}
      />
    );
    expect(screen.getByText('Joint 1st of 5 today')).toBeInTheDocument();
    expect(screen.getByText('Come back tomorrow')).toBeInTheDocument();
  });

  it('summarises how the room scored for screen readers', () => {
    render(<MyScores mainScore={3} bonusScore={2} maxMain={5} maxBonus={3} mainScores={[3, 3, 1]} bonusScores={[2]} />);
    expect(
      screen.getByRole('img', { name: 'Higher or lower across the room: 1 scored 1, 2 scored 3' })
    ).toBeInTheDocument();
  });
});

describe('QueuedleSummary', () => {
  const q: GameQuestion = {
    index: 0,
    left: items[0],
    right: items[1],
    winner: 'left',
  };

  it('renders nothing without a complete set of guesses', () => {
    const { container } = render(<QueuedleSummary questions={[q]} mainGuesses={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks each round right or wrong', () => {
    render(<QueuedleSummary questions={[q, { ...q, index: 1 }]} mainGuesses={['left', 'right']} />);
    expect(screen.getByText('Your answers')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'You got this right' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'You got this wrong' })).toBeInTheDocument();
  });
});
