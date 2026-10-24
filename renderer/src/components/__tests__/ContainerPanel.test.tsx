import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContainerPanel } from '../ContainerPanel';
import type { SonosItem } from '../../types/sonos';
import { queueActionsWrapper } from '../../test/queueActions';

const mockUseLocation = vi.fn();
const mockOpenItem = vi.fn();
const mockResolveAndOpen = vi.fn();
vi.mock('react-router-dom', () => ({ useLocation: () => mockUseLocation() }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ prefetchQuery: vi.fn() }) }));
vi.mock('../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => mockOpenItem }));
vi.mock('../../hooks/useResolveAndOpen', () => ({ useResolveAndOpen: () => ({ resolveAndOpen: mockResolveAndOpen }) }));

const mockUseContainerBrowse = vi.fn();
vi.mock('../../hooks/useContainerBrowse', () => ({
  useContainerBrowse: (...args: unknown[]) => mockUseContainerBrowse(...args),
}));

const containerItem: SonosItem = {
  title: 'Quick picks',
  type: 'CONTAINER',
  resource: { type: 'CONTAINER', id: { objectId: 'c-1', serviceId: 'svc-1', accountId: 'acc-1' } },
} as SonosItem;

const track = (title: string): SonosItem =>
  ({
    title,
    type: 'ITEM_TRACK',
    subtitle: 'Daft Punk',
    artists: [{ name: 'Daft Punk', id: 'srn:content:audio:artist:dp#svc-1:acc-1' }],
    duration: '432',
    resource: { type: 'TRACK', id: { objectId: title, serviceId: 'svc-1', accountId: 'acc-1' } },
  }) as unknown as SonosItem;
const album = (title: string): SonosItem =>
  ({ title, type: 'ITEM_ALBUM', subtitle: 'Geese', resource: { type: 'ALBUM', id: { objectId: title } } }) as SonosItem;
const station = (title: string): SonosItem =>
  ({
    title,
    type: 'ITEM_STATION',
    subtitle: `${title} Radio`,
    resource: { type: 'PROGRAM', id: { objectId: title } },
  }) as SonosItem;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue({ state: { item: containerItem } });
  mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
});

describe('ContainerPanel', () => {
  it('returns nothing when no item in state', () => {
    mockUseLocation.mockReturnValue({ state: null });
    const { container } = render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(container.firstChild).toBeNull();
  });

  it('names the shelf as the page heading', () => {
    render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(screen.getByRole('heading', { level: 1, name: 'Quick picks' })).toBeInTheDocument();
  });

  it('shows skeleton tiles while loading', () => {
    mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    const { container } = render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(container.querySelectorAll('[class*="skelTile"]').length).toBeGreaterThan(0);
  });

  it('offers Retry when the browse fails', async () => {
    const refetch = vi.fn();
    mockUseContainerBrowse.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail'), refetch });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(screen.getByText(/Couldn’t load Quick picks/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('says so when the shelf is empty', () => {
    mockUseContainerBrowse.mockReturnValue({ data: [], isLoading: false, error: null, refetch: vi.fn() });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(screen.getByText('Nothing here right now.')).toBeInTheDocument();
  });

  it('lists songs as rows with a count, and adds one to the queue', async () => {
    const onAddToQueue = vi.fn();
    mockUseContainerBrowse.mockReturnValue({
      data: [track('Song A'), track('Song B')],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper(onAddToQueue) });
    expect(screen.getByText('2 songs')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText('7:12')).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add Song A to queue' }));
    expect(onAddToQueue).toHaveBeenCalledWith(expect.objectContaining({ title: 'Song A' }));
  });

  it('opens a song artist from the browse SRN id', async () => {
    mockUseContainerBrowse.mockReturnValue({
      data: [track('Song A')],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Daft Punk, open artist' }));
    expect(mockOpenItem).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { type: 'ARTIST', id: { objectId: 'dp', serviceId: 'svc-1', accountId: 'acc-1' } },
      })
    );
  });

  it('heads each kind on a mixed shelf, in the order they first appear', () => {
    mockUseContainerBrowse.mockReturnValue({
      data: [album('Getting Killed'), track('Song A'), album('3D Country')],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper() });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Albums', 'Songs']);
    expect(screen.getByText('2 albums · 1 song')).toBeInTheDocument();
  });

  it('opens a station and never offers + on it, because starting one replaces the shared queue', async () => {
    const onAddToQueue = vi.fn();
    mockUseContainerBrowse.mockReturnValue({
      data: [station('STORM II')],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ContainerPanel />, { wrapper: queueActionsWrapper(onAddToQueue) });
    expect(screen.queryByRole('button', { name: /to queue/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /STORM II/ }));
    expect(mockOpenItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'STORM II' }));
    expect(onAddToQueue).not.toHaveBeenCalled();
  });
});
