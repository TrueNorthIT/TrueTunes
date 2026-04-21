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
  it('renders one Pick button per side when not revealed', () => {
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={false}
        pickedSide={null}
        onPick={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Pick' })).toHaveLength(2);
  });

  it('calls onPick with the clicked side', () => {
    const onPick = vi.fn();
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={false}
        pickedSide={null}
        onPick={onPick}
        onNext={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Pick' })[0]);
    expect(onPick).toHaveBeenCalledWith('left');
  });

  it('shows counts and a Next button when revealed', () => {
    const onNext = vi.fn();
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={true}
        pickedSide="left"
        onPick={() => {}}
        onNext={onNext}
      />,
    );
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    const nextBtn = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalled();
  });

  it('hides Pick buttons when revealed', () => {
    render(
      <QueuedleQuestionCard
        question={question}
        revealed={true}
        pickedSide="left"
        onPick={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.queryAllByRole('button', { name: 'Pick' })).toHaveLength(0);
  });
});
