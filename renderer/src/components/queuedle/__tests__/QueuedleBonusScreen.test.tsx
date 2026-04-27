import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
