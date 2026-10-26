import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueuedleBonusScreen } from '../QueuedleBonusScreen';

function item(overrides: Partial<GameItem> & { id: string; name: string }): GameItem {
  return {
    category: 'track',
    id: overrides.id,
    name: overrides.name,
    subtitle: overrides.subtitle ?? 'Sub',
    imageUrl: overrides.imageUrl,
    count: overrides.count ?? 10,
    topQueuer: overrides.topQueuer ?? 'alice',
    queuerCandidates: overrides.queuerCandidates ?? ['alice', 'bob', 'cara', 'dan'],
    artistKey: overrides.artistKey,
    albumKey: overrides.albumKey,
  };
}

describe('QueuedleBonusScreen', () => {
  const winningItems: GameItem[] = [item({ id: 'w1', name: 'First Song' }), item({ id: 'w2', name: 'Second Song' })];

  it('disables the submit button until all selections are made', () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={[null, null]}
        onSelect={onSelect}
        onSubmit={onSubmit}
        submitting={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('enables submit when every row has a selection', () => {
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={['alice', 'bob']}
        onSelect={() => {}}
        onSubmit={() => {}}
        submitting={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
  });

  it('calls onSelect with the correct index and name when a candidate is clicked', () => {
    const onSelect = vi.fn();
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={[null, null]}
        onSelect={onSelect}
        onSubmit={() => {}}
        submitting={false}
      />
    );
    const daveButtons = screen.getAllByRole('button', { name: 'dan' });
    fireEvent.click(daveButtons[1]);
    expect(onSelect).toHaveBeenCalledWith(1, 'dan');
  });

  it('calls onSubmit when the submit button is clicked', () => {
    const onSubmit = vi.fn();
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={['alice', 'bob']}
        onSelect={() => {}}
        onSubmit={onSubmit}
        submitting={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('lays the winners out as cards, each a labelled group of named colleagues', () => {
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={['bob', null]}
        onSelect={() => {}}
        onSubmit={() => {}}
        submitting={false}
      />
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const group = screen.getByRole('group', { name: 'Who queued First Song most' });
    const buttons = within(group).getAllByRole('button');
    // Each choice shows the name as text beside the face (the avatar's initial is hidden from the accessible name).
    expect(buttons.map((b) => b.querySelector('span:last-child')?.textContent)).toEqual([
      'alice',
      'bob',
      'cara',
      'dan',
    ]);
    expect(within(group).getByRole('button', { name: 'bob' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'alice' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(group).getByRole('button', { name: 'bob' })).toHaveAttribute('title', 'bob');
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  });

  it('keeps one pick per card: the other cards are untouched', () => {
    render(
      <QueuedleBonusScreen
        winningItems={winningItems}
        selections={['bob', null]}
        onSelect={() => {}}
        onSubmit={() => {}}
        submitting={false}
      />
    );
    const second = screen.getByRole('group', { name: 'Who queued Second Song most' });
    for (const b of within(second).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false');
  });
});
