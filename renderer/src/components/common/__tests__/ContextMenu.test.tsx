import { afterEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seedDisplayName } from '../../../test/queueActions';
import { QueueActionsProvider } from '../../../hooks/useQueueActions';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuProvider, useTrackContextMenu } from '../ContextMenu';
import type { SonosItem } from '../../../types/sonos';

const PLAYLISTS = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: `Playlist ${i}`,
  owner: 'Alice',
  isPublic: true,
}));
vi.mock('../../../hooks/usePlaylists', () => ({
  useMyPlaylists: () => ({ owned: PLAYLISTS, joined: [PLAYLISTS[0]], isLoading: false }),
  favouritesId: (name: string) => `fav-${name}`,
}));

const TRACK: PlaylistTrack = {
  uri: 'u',
  trackName: 'Desert Rose',
  artist: 'Sting',
  serviceId: 's',
  accountId: 'a',
  addedBy: 'Alice',
  addedAt: 0,
};

function Row() {
  const { showTrackMenu } = useTrackContextMenu();
  return <div onContextMenu={(e) => showTrackMenu({ track: TRACK, sonosItem: {} as SonosItem }, e)}>Row</div>;
}

function renderMenu(onAddToQueue = vi.fn()) {
  const client = new QueryClient();
  seedDisplayName(client, null);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QueueActionsProvider value={{ addToQueue: onAddToQueue, queueNext: vi.fn() }}>
          <ContextMenuProvider>
            <Row />
          </ContextMenuProvider>
        </QueueActionsProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.contextMenu(screen.getByText('Row'), { clientX: 10, clientY: 10 });
  return onAddToQueue;
}

describe('track context menu', () => {
  it('is a menu of buttons, focused with nothing pre-selected', () => {
    renderMenu();
    const menu = screen.getByRole('menu', { name: 'Desert Rose' });
    expect(menu).toHaveFocus();
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Queue next',
      'Add to queue',
      'Add to playlist',
      "View Alice's profile",
    ]);
  });

  it('arrow keys move between items and wrap', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Queue next' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: "View Alice's profile" })).toHaveFocus();
  });

  it('Enter straight after opening does not queue anything', async () => {
    const user = userEvent.setup();
    const onAddToQueue = renderMenu();
    await user.keyboard('{Enter}');
    expect(onAddToQueue).not.toHaveBeenCalled();
  });

  it('Escape closes it', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('playlist submenu placement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays inside the window: lifted off the bottom and flipped left off the right', () => {
    // Every box reports 500px tall and 240px wide, with the "Add to playlist" item low and near the right edge.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 600,
      bottom: 1100,
      left: 860,
      right: 1100,
      width: 240,
      height: 500,
      x: 860,
      y: 600,
      toJSON: () => ({}),
    });
    renderMenu();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Add to playlist' }));
    const sub = screen.getByRole('menu', { name: 'Add to playlist' });
    // innerHeight 768 - 500 - 8 = 260; anchor x 1104 + 240 overflows 1280, so it opens left of the menu: 856 - 240.
    expect(sub.style.top).toBe('260px');
    expect(sub.style.left).toBe('616px');
    expect(screen.getAllByRole('menuitem', { name: /^Playlist 0$/ })).toHaveLength(1);
  });
});
