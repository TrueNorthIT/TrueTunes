import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContextMenuProvider, useTrackContextMenu } from '../ContextMenu';
import type { SonosItem } from '../../../types/sonos';
import { AlbumTrackRow } from '../../album/AlbumTrackRow';
import { TopSongRow } from '../../artist/TopSongRow';
import type { AlbumTrack } from '../../../hooks/useAlbumBrowse';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../hooks/usePlaylists', () => ({
  useMyPlaylists: () => ({ owned: [], joined: [], isLoading: false }),
  favouritesId: (n: string) => `fav:${n}`,
}));
vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
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
    </QueryClientProvider>
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

describe('Queue next is offered on track rows across the app', () => {
  const raw = { name: 'Come Together', type: 'TRACK' } as SonosItem;
  const albumTrack: AlbumTrack = {
    title: 'Come Together',
    ordinal: 1,
    durationSeconds: 259,
    artUrl: null,
    id: { objectId: 'trk-1', serviceId: 'svc', accountId: 'acc' },
    artists: ['The Beatles'],
    artistObjects: undefined,
    albumName: null,
    albumId: null,
    explicit: false,
    raw,
  };
  const noop = vi.fn();

  function rightClickQueueNext(row: React.ReactElement) {
    const onQueueNext = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ContextMenuProvider displayName="Rich" onAddToQueue={vi.fn()} onQueueNext={onQueueNext}>
          {row}
        </ContextMenuProvider>
      </QueryClientProvider>
    );
    fireEvent.contextMenu(screen.getByText('Come Together'));
    fireEvent.click(screen.getByText('Queue next'));
    return onQueueNext;
  }

  it('album track rows', () => {
    const onQueueNext = rightClickQueueNext(
      <AlbumTrackRow
        track={albumTrack}
        isPlaylistOrProgram={false}
        isSelected={false}
        serviceId="svc"
        accountId="acc"
        onClick={noop}
        onDragStart={noop}
        onAdd={noop}
      />
    );
    expect(onQueueNext).toHaveBeenCalledWith(raw);
  });

  it('artist top songs', () => {
    const onQueueNext = rightClickQueueNext(
      <TopSongRow
        track={albumTrack}
        index={0}
        isSelected={false}
        onAdd={noop}
        onClick={noop}
        onDragStart={noop}
        onOpenAlbum={noop}
        onOpenArtist={noop}
      />
    );
    expect(onQueueNext).toHaveBeenCalledWith(raw);
  });
});
