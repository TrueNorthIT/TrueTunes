import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardRow } from '../CardRow';
import type { SonosItem } from '../../types/sonos';

vi.mock('../../hooks/useImage', () => ({ useImage: () => null }));

const makeItem = (name: string, type: string): SonosItem => ({
  type,
  name,
  id: { objectId: name, serviceId: 'gm', accountId: 'acc' },
  resource: { type, id: { objectId: name, serviceId: 'gm', accountId: 'acc' } },
});

const onAdd  = vi.fn();
const onOpen = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CardRow', () => {
  describe('loading state', () => {
    it('renders exactly 6 placeholder divs when loading', () => {
      const { container } = render(
        <CardRow items={[]} isLoading onAdd={onAdd} onOpen={onOpen} />
      );
      const placeholders = container.querySelectorAll('.placeholder');
      expect(placeholders).toHaveLength(6);
    });

    it('shows skeleton even when items are non-empty', () => {
      const { container } = render(
        <CardRow items={[makeItem('Track', 'TRACK')]} isLoading onAdd={onAdd} onOpen={onOpen} />
      );
      expect(container.querySelectorAll('.placeholder')).toHaveLength(6);
      expect(screen.queryByText('Track')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders nothing when items is empty and not loading', () => {
      const { container } = render(
        <CardRow items={[]} isLoading={false} onAdd={onAdd} onOpen={onOpen} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('items rendering', () => {
    it('renders item names', () => {
      const items = [makeItem('Alpha', 'TRACK'), makeItem('Beta', 'TRACK')];
      render(<CardRow items={items} isLoading={false} onAdd={onAdd} onOpen={onOpen} />);
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });
  });

  describe('onAdd conditional', () => {
    it('shows add button for a TRACK item (non-container)', async () => {
      const user = userEvent.setup();
      render(
        <CardRow items={[makeItem('My Track', 'TRACK')]} isLoading={false} onAdd={onAdd} onOpen={onOpen} />
      );
      const addBtn = screen.getByRole('button', { name: '+' });
      await user.click(addBtn);
      expect(onAdd).toHaveBeenCalledOnce();
    });

    it('does not show add button for a CONTAINER item', () => {
      render(
        <CardRow items={[makeItem('My Playlist', 'CONTAINER')]} isLoading={false} onAdd={onAdd} onOpen={onOpen} />
      );
      expect(screen.queryByRole('button', { name: '+' })).toBeNull();
    });
  });

  describe('onOpen conditional', () => {
    it('makes an ALBUM card clickable (onOpen passed)', async () => {
      const user = userEvent.setup();
      render(
        <CardRow items={[makeItem('Thriller', 'ALBUM')]} isLoading={false} onAdd={onAdd} onOpen={onOpen} />
      );
      // MediaCard renders an onClick on its root div when onOpen is provided
      const card = screen.getByText('Thriller').closest('.card') as HTMLElement;
      await user.click(card);
      expect(onOpen).toHaveBeenCalledOnce();
    });

    it('does not make a plain TRACK card openable', async () => {
      const user = userEvent.setup();
      render(
        <CardRow items={[makeItem('Lose Yourself', 'TRACK')]} isLoading={false} onAdd={onAdd} onOpen={onOpen} />
      );
      const card = screen.getByText('Lose Yourself').closest('.card') as HTMLElement;
      await user.click(card);
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
