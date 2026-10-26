import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuedleQuestionCard } from '../QueuedleQuestionCard';

const { showTrackMenu } = vi.hoisted(() => ({ showTrackMenu: vi.fn() }));
vi.mock('../../common/ContextMenu', () => ({ useTrackContextMenu: () => ({ showTrackMenu }) }));
beforeEach(() => showTrackMenu.mockClear());

const question: GameQuestion = {
  index: 0,
  left: {
    category: 'track',
    id: 'l',
    name: 'Left Song',
    subtitle: 'Left Artist',
    count: 20,
    topQueuer: 'alice',
    queuerCandidates: ['alice', 'bob', 'cara', 'dan'],
  },
  right: {
    category: 'artist',
    id: 'r',
    name: 'Right Artist',
    subtitle: 'Artist',
    count: 12,
    topQueuer: 'bob',
    queuerCandidates: ['bob', 'alice', 'cara', 'dan'],
  },
  winner: 'left',
};

describe('QueuedleQuestionCard', () => {
  it('renders contextual Pick buttons on each side when not revealed', () => {
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={false}
        pickedSide={null}
        onPick={() => {}}
        onNext={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Pick song/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick artist/ })).toBeInTheDocument();
  });

  it('calls onPick with the clicked side', () => {
    const onPick = vi.fn();
    render(
      <QueuedleQuestionCard question={question} revealed={false} pickedSide={null} onPick={onPick} onNext={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Pick song/ }));
    expect(onPick).toHaveBeenCalledWith('left');
  });

  it('shows counts and a Next button when revealed', () => {
    const onNext = vi.fn();
    render(
      <QueuedleQuestionCard question={question} revealed={true} pickedSide="left" onPick={() => {}} onNext={onNext} />
    );
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();
  });

  it('hides Pick buttons when revealed', () => {
    render(
      <QueuedleQuestionCard question={question} revealed={true} pickedSide="left" onPick={() => {}} onNext={() => {}} />
    );
    expect(screen.queryAllByRole('button', { name: /Pick song/ })).toHaveLength(0);
  });

  it('shows carry-over count alongside its Pick button', () => {
    const qWithCarryover: GameQuestion = { ...question, carryover: 'left' };
    render(
      <QueuedleQuestionCard
        question={qWithCarryover}
        revealed={false}
        pickedSide={null}
        onPick={() => {}}
        onNext={() => {}}
      />
    );
    // Carry-over side reveals its count up front but is still pickable
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick song/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pick artist/ })).toBeInTheDocument();
  });

  it('says whether the pick was right and marks the picked side', () => {
    const { rerender } = render(
      <QueuedleQuestionCard question={question} revealed={true} pickedSide="left" onPick={() => {}} onNext={() => {}} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Nice one.');
    expect(screen.getByText(/Your pick/)).toHaveTextContent('✓ Your pick');
    rerender(
      <QueuedleQuestionCard
        question={question}
        revealed={true}
        pickedSide="right"
        onPick={() => {}}
        onNext={() => {}}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Not this time.');
    expect(screen.getByText(/Your pick/)).toHaveTextContent('✗ Your pick');
  });

  it('states the question being asked', () => {
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={false}
        pickedSide={null}
        onPick={() => {}}
        onNext={() => {}}
      />
    );
    expect(screen.getByRole('heading', { name: 'Which has the office queued more?' })).toBeInTheDocument();
  });

  describe('track context menu (#100)', () => {
    const queueable: GameQuestion = {
      ...question,
      left: { ...question.left, uri: 'spotify:track:left', serviceId: '12', accountId: 'acc', imageUrl: 'art.jpg' },
    };
    const card = (revealed: boolean, q = queueable) => (
      <QueuedleQuestionCard
        question={q}
        revealed={revealed}
        pickedSide={revealed ? 'right' : null}
        onPick={() => {}}
        onNext={() => {}}
      />
    );

    it('opens nothing before the reveal', () => {
      render(card(false));
      fireEvent.contextMenu(screen.getByText('Left Song'));
      expect(showTrackMenu).not.toHaveBeenCalled();
    });

    it('opens the track menu on the revealed track, with the queueable item', () => {
      render(card(true));
      fireEvent.contextMenu(screen.getByText('Left Song'));
      expect(showTrackMenu).toHaveBeenCalledTimes(1);
      expect(showTrackMenu.mock.calls[0][0]).toMatchObject({
        track: { uri: 'spotify:track:left', trackName: 'Left Song', artist: 'Left Artist' },
        sonosItem: {
          type: 'TRACK',
          title: 'Left Song',
          resource: { id: { objectId: 'spotify:track:left', serviceId: '12', accountId: 'acc' } },
        },
      });
      // Artists and albums have no track menu.
      fireEvent.contextMenu(screen.getByText('Right Artist'));
      expect(showTrackMenu).toHaveBeenCalledTimes(1);
    });

    it('opens nothing for a track from an older game without service ids', () => {
      render(card(true, question));
      fireEvent.contextMenu(screen.getByText('Left Song'));
      expect(showTrackMenu).not.toHaveBeenCalled();
    });
  });
});
