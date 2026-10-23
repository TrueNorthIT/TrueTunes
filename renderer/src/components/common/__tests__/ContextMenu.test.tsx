import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContextMenuProvider, useTrackContextMenu } from '../ContextMenu';
import type { SonosItem } from '../../../types/sonos';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../hooks/usePlaylists', () => ({
  useMyPlaylists: () => ({ owned: [], joined: [], isLoading: false }),
  favouritesId: (n: string) => `fav:${n}`,
}));
vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const sonosItem = { type: 'ITEM_TRACK', title: 'Come Together' } as unknown as SonosItem;
const track = { uri: 'u', trackName: 'Come Together', artist: 'The Beatles' } as PlaylistTrack;

function Opener() {
  const { showTrackMenu } = useTrackContextMenu();
  return <div onContextMenu={(e) => showTrackMenu({ track, sonosItem }, e)}>row</div>;
}

function setup() {
  const onAddToQueue = vi.fn();
  const onQueueNext = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContextMenuProvider displayName="Rich" onAddToQueue={onAddToQueue} onQueueNext={onQueueNext}>
        <Opener />
      </ContextMenuProvider>
    </QueryClientProvider>,
  );
  fireEvent.contextMenu(screen.getByText('row'));
  return { onAddToQueue, onQueueNext };
}

describe('track context menu', () => {
  it('"Queue next" queues the item after the current song', () => {
    const { onAddToQueue, onQueueNext } = setup();
    fireEvent.click(screen.getByText('Queue next'));
    expect(onQueueNext).toHaveBeenCalledWith(sonosItem);
    expect(onAddToQueue).not.toHaveBeenCalled();
    expect(screen.queryByText('Queue next')).not.toBeInTheDocument();
  });

  it('"Add to queue" still adds to the end', () => {
    const { onAddToQueue, onQueueNext } = setup();
    fireEvent.click(screen.getByText('Add to queue'));
    expect(onAddToQueue).toHaveBeenCalledWith(sonosItem, -1);
    expect(onQueueNext).not.toHaveBeenCalled();
  });
});
