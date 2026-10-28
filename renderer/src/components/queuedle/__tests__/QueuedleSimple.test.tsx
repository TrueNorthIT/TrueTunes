import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuedleBonusResults } from '../QueuedleBonusResults';
import { QueuedleSummary } from '../QueuedleSummary';
import { MyScores } from '../MyScores';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
const { showTrackMenu } = vi.hoisted(() => ({ showTrackMenu: vi.fn() }));
vi.mock('../../common/ContextMenu', () => ({ useTrackContextMenu: () => ({ showTrackMenu }) }));

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

  it('marks a right pick with a tick, as your pick and the top queuer', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    const row = screen.getByTitle('alice');
    expect(row).toHaveAttribute('data-result', 'right');
    expect(row).toHaveTextContent('alice✓, your pick, top queuer');
  });

  it('marks a wrong pick with a cross and the top queuer with a tick, both by name', () => {
    render(<QueuedleBonusResults winningItems={items} bonusGuesses={['alice', 'wrong']} onContinue={vi.fn()} />);
    const pick = screen.getByTitle('wrong');
    expect(pick).toHaveAttribute('data-result', 'wrong');
    expect(pick).toHaveTextContent('wrong✗, your pick');
    const answer = screen.getByTitle('bob');
    expect(answer).toHaveAttribute('data-result', 'right');
    expect(answer).toHaveTextContent('bob✓, top queuer');
  });

  it('lists every candidate on the card, unmarked ones without a tick or cross', () => {
    const withCandidates = [{ ...items[0], queuerCandidates: ['alice', 'cara', 'dan'] }];
    render(<QueuedleBonusResults winningItems={withCandidates} bonusGuesses={['cara']} onContinue={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Who queued Come Together most' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTitle('dan')).toHaveAttribute('data-result', 'other');
    expect(screen.getByTitle('dan')).not.toHaveTextContent(/[✓✗]/);
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
    expect(screen.getByText('Higher or Lower')).toBeInTheDocument();
    expect(screen.getByText('Top Queuer')).toBeInTheDocument();
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
      screen.getByRole('img', { name: 'Higher or Lower across the room: 1 scored 1, 2 scored 3' })
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

  it('opens the track menu on a track that has all three ids, and only that one (#100)', () => {
    const ids = { uri: 'spotify:track:ct', serviceId: '12', accountId: 'acc' };
    const queueable = { ...q, left: { ...items[0], ...ids } };
    // A track without a serviceId (an older game) gets no menu.
    const older = { ...q, index: 1, left: { ...items[0], name: 'Something', uri: 'x', accountId: 'acc' } };
    render(<QueuedleSummary questions={[queueable, older]} mainGuesses={['left', 'left']} />);
    fireEvent.contextMenu(screen.getByText('Something'));
    expect(showTrackMenu).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getByText('Come Together'));
    expect(showTrackMenu).toHaveBeenCalledTimes(1);
    expect(showTrackMenu.mock.calls[0][0]).toMatchObject({
      track: { uri: 'spotify:track:ct', trackName: 'Come Together' },
      sonosItem: {
        type: 'TRACK',
        title: 'Come Together',
        resource: { id: { objectId: 'spotify:track:ct', serviceId: '12', accountId: 'acc' } },
      },
    });
  });
});
