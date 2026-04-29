import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuedleQuestionCard } from '../QueuedleQuestionCard';

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
    expect(screen.getByRole('button', { name: 'Pick song' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick artist' })).toBeInTheDocument();
  });

  it('calls onPick with the clicked side', () => {
    const onPick = vi.fn();
    render(
      <QueuedleQuestionCard question={question} revealed={false} pickedSide={null} onPick={onPick} onNext={() => {}} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick song' }));
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
    expect(screen.queryAllByRole('button', { name: 'Pick song' })).toHaveLength(0);
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
    expect(screen.getByRole('button', { name: 'Pick song' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick artist' })).toBeInTheDocument();
  });
});
