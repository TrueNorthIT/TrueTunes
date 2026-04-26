import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DraggableQueueRow } from '../DraggableQueueRow';
import type { NormalizedQueueItem } from '../../../types/provider';

const { mockSkipToTrack } = vi.hoisted(() => ({
  mockSkipToTrack: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../hooks/useImage',    () => ({ useImage: () => null }));
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));
vi.mock('../../../providers', () => ({ getActiveProvider: () => ({ skipToTrack: mockSkipToTrack }) }));

const mockUseQueueTrack = vi.fn();
vi.mock('../../../hooks/useQueueTrack', () => ({
  useQueueTrack: (...args: unknown[]) => mockUseQueueTrack(...args),
}));

const item: NormalizedQueueItem = {
  index: 2,
  track: {
    id: 'obj1',
    title: 'Come Together',
    artist: '',
    albumName: null,
    albumId: null,
    imageUrl: null,
    durationMs: 0,
    isExplicit: false,
    serviceId: null,
    accountId: null,
  },
};

function makeQTResult(overrides: Record<string, unknown> = {}) {
  return {
    artUrl: null,
    artist: 'The Beatles',
    albumName: 'Abbey Road',
    albumItem: null,
    prefetchAlbum: undefined,
    artistItem: null,
    prefetchArtist: undefined,
    isPlaying: false,
    explicit: false,
    ...overrides,
  };
}

const baseProps = {
  item,
  index: 2,
  currentObjectId: null,
  currentQueueItemId: null,
  attribution: undefined,
  isSelected: false,
  onRowClick: vi.fn(),
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDrop: vi.fn(),
  onDragEnd: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQueueTrack.mockReturnValue(makeQTResult());
});

describe('DraggableQueueRow', () => {
  it('renders track name', () => {
    render(<DraggableQueueRow {...baseProps} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
  });

  it('renders artist name', () => {
    render(<DraggableQueueRow {...baseProps} />);
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('calls onRowClick with index when clicked', () => {
    const onRowClick = vi.fn();
    render(<DraggableQueueRow {...baseProps} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Come Together'));
    expect(onRowClick).toHaveBeenCalledWith(2, expect.any(Object));
  });

  it('calls skipToTrack on double-click', () => {
    render(<DraggableQueueRow {...baseProps} />);
    fireEvent.doubleClick(screen.getByText('Come Together'));
    expect(mockSkipToTrack).toHaveBeenCalledWith(3); // index + 1
  });

  it('shows playing indicator when isPlaying=true by currentQueueItemId', () => {
    const { container } = render(
      <DraggableQueueRow
        {...baseProps}
        currentQueueItemId="3" // index 2 → position 3
      />
    );
    expect(container.querySelector('[data-playing="true"]')).toBeTruthy();
  });

  it('shows ExplicitBadge when explicit=true', () => {
    mockUseQueueTrack.mockReturnValue(makeQTResult({ explicit: true }));
    render(<DraggableQueueRow {...baseProps} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });

  it('shows artist as button when artistItem is provided', () => {
    const artistItem = { type: 'ARTIST', name: 'The Beatles' };
    mockUseQueueTrack.mockReturnValue(makeQTResult({ artistItem }));
    render(<DraggableQueueRow {...baseProps} />);
    expect(screen.getByRole('button', { name: 'The Beatles' })).toBeInTheDocument();
  });

  it('shows album name as button when albumItem is provided', () => {
    const albumItem = { type: 'ITEM_ALBUM', title: 'Abbey Road' };
    mockUseQueueTrack.mockReturnValue(makeQTResult({ albumItem, albumName: 'Abbey Road' }));
    render(<DraggableQueueRow {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Abbey Road' })).toBeInTheDocument();
  });

  it('shows attribution when provided', () => {
    const attribution: AttributionEntry = { user: 'alice', timestamp: 0, trackName: 'T', artist: 'A' };
    render(<DraggableQueueRow {...baseProps} attribution={attribution} />);
    expect(screen.getByText('by alice')).toBeInTheDocument();
  });

  it('shows art placeholder when no image is cached', () => {
    const { container } = render(<DraggableQueueRow {...baseProps} />);
    expect(container.querySelector('[class*="artPh"]')).toBeTruthy();
  });
});
