import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerPanel } from '../ContainerPanel';
import type { SonosItem } from '../../types/sonos';

const mockUseLocation = vi.fn();
vi.mock('react-router-dom', () => ({ useLocation: () => mockUseLocation() }));
vi.mock('../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));

const mockUseContainerBrowse = vi.fn();
vi.mock('../../hooks/useContainerBrowse', () => ({
  useContainerBrowse: (...args: unknown[]) => mockUseContainerBrowse(...args),
}));
vi.mock('../common/MediaCard', () => ({
  MediaCard: ({ name, onOpen, onAdd }: { name: string; onOpen?: () => void; onAdd?: () => void }) => (
    <div>
      <span>{name}</span>
      {onOpen && <button onClick={onOpen}>Open</button>}
      <button onClick={onAdd}>Add</button>
    </div>
  ),
}));

const containerItem: SonosItem = {
  title: 'My Playlist',
  type: 'ITEM_AUDIO_CONTAINER',
  resource: {
    type: 'PLAYLIST',
    id: { objectId: 'pl-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue({ state: { item: containerItem } });
  mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('ContainerPanel', () => {
  it('returns nothing when no item in state', () => {
    mockUseLocation.mockReturnValue({ state: null });
    const { container } = render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the container title', () => {
    render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('My Playlist')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(container.querySelectorAll('[class*="skeletonCard"]').length).toBeGreaterThan(0);
  });

  it('shows error message when fetch fails', () => {
    mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('Failed to load.')).toBeInTheDocument();
  });

  it('shows empty message when data is empty', () => {
    mockUseContainerBrowse.mockReturnValue({ data: [], isLoading: false, error: null });
    render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('This playlist is empty.')).toBeInTheDocument();
  });

  it('renders item names when data is present', () => {
    const items: SonosItem[] = [
      { name: 'Song A', type: 'TRACK' } as SonosItem,
      { name: 'Song B', type: 'TRACK' } as SonosItem,
    ];
    mockUseContainerBrowse.mockReturnValue({ data: items, isLoading: false, error: null });
    render(<ContainerPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
  });

  it('calls onAddToQueue when Add button is clicked on a track item', async () => {
    const onAddToQueue = vi.fn();
    const user = userEvent.setup();
    const items: SonosItem[] = [{ name: 'Track Item', type: 'TRACK' } as SonosItem];
    mockUseContainerBrowse.mockReturnValue({ data: items, isLoading: false, error: null });
    render(<ContainerPanel onAddToQueue={onAddToQueue} />);
    await user.click(screen.getByText('Add'));
    expect(onAddToQueue).toHaveBeenCalled();
  });
});
