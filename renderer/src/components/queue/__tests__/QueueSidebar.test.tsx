import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueSidebar } from '../QueueSidebar';
import type { NormalizedQueueItem } from '../../../types/provider';

const { mockRemoveFromQueue, mockClearQueue, mockReorderQueue } = vi.hoisted(() => ({
  mockRemoveFromQueue: vi.fn().mockResolvedValue(undefined),
  mockClearQueue: vi.fn().mockResolvedValue(undefined),
  mockReorderQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../DraggableQueueRow', () => ({
  DraggableQueueRow: ({
    index,
    isSelected,
    onRowClick,
  }: {
    item: NormalizedQueueItem;
    index: number;
    isSelected: boolean;
    onRowClick: (index: number, e: React.MouseEvent) => void;
  }) => (
    <div
      data-testid={`row-${index}`}
      data-selected={String(isSelected)}
      onClick={(e) => onRowClick(index, e)}
    >
      Track {index}
    </div>
  ),
}));

vi.mock('../../../providers', () => ({
  getActiveProvider: () => ({
    removeFromQueue: mockRemoveFromQueue,
    clearQueue: mockClearQueue,
    reorderQueue: mockReorderQueue,
  }),
}));

vi.mock('../../../hooks/useAttribution', () => ({
  useAttribution: () => ({}),
}));

function makeItem(i: number): NormalizedQueueItem {
  return {
    index: i,
    track: {
      id: `obj${i}`,
      title: `Track ${i}`,
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
}

const defaultProps = {
  open: true,
  items: [makeItem(0), makeItem(1), makeItem(2)],
  setItems: vi.fn(),
  isLoading: false,
  error: null,
  currentObjectId: null,
  currentQueueItemId: null,
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onError: vi.fn(),
  onAddToQueue: vi.fn(),
};

function setup(props = {}) {
  const user = userEvent.setup();
  const merged = { ...defaultProps, ...props };
  const result = render(<QueueSidebar {...merged} />);
  return { user, ...result };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRemoveFromQueue.mockResolvedValue(undefined);
  mockClearQueue.mockResolvedValue(undefined);
  mockReorderQueue.mockResolvedValue(undefined);
});

// ─── rendering ───────────────────────────────────────────────────────────────

describe('QueueSidebar — rendering', () => {
  it('renders item count in header', () => {
    setup();
    expect(screen.getByText(/Queue · 3/)).toBeInTheDocument();
  });

  it('shows empty message when no items', () => {
    setup({ items: [] });
    expect(screen.getByText('Queue is empty.')).toBeInTheDocument();
  });

  it('shows loading spinner when isLoading', () => {
    const { container } = setup({ isLoading: true });
    expect(container.querySelector('.spinner, svg, [class*="spinner"]')).toBeTruthy();
  });

  it('shows error message', () => {
    setup({ error: 'Failed to load', items: [] });
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders a row for each item', () => {
    setup();
    expect(screen.getByTestId('row-0')).toBeInTheDocument();
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-2')).toBeInTheDocument();
  });
});

// ─── selection: single click ──────────────────────────────────────────────────

describe('QueueSidebar — single-click selection', () => {
  it('clicking a row selects it', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-1'));
    expect(screen.getByTestId('row-1').dataset.selected).toBe('true');
  });

  it('clicking another row deselects the previous', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.click(screen.getByTestId('row-2'));
    expect(screen.getByTestId('row-0').dataset.selected).toBe('false');
    expect(screen.getByTestId('row-2').dataset.selected).toBe('true');
  });

  it('clicking the same row again deselects it', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-1'));
    await user.click(screen.getByTestId('row-1'));
    expect(screen.getByTestId('row-1').dataset.selected).toBe('false');
  });

  it('shows selected badge count', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('clicking the content area clears selection', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    // click the outer content area (not a row)
    const content = document.querySelector('[class*="content"]') as HTMLElement;
    await user.click(content);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});

// ─── selection: ctrl+click ────────────────────────────────────────────────────

describe('QueueSidebar — ctrl+click selection', () => {
  it('ctrl+click adds a row to selection', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Control>}');
    await user.click(screen.getByTestId('row-2'));
    await user.keyboard('{/Control}');
    expect(screen.getByTestId('row-0').dataset.selected).toBe('true');
    expect(screen.getByTestId('row-2').dataset.selected).toBe('true');
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('ctrl+click on selected row deselects it', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Control>}');
    await user.click(screen.getByTestId('row-2'));
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{/Control}');
    expect(screen.getByTestId('row-0').dataset.selected).toBe('false');
    expect(screen.getByTestId('row-2').dataset.selected).toBe('true');
  });
});

// ─── selection: shift+click ───────────────────────────────────────────────────

describe('QueueSidebar — shift+click selection', () => {
  it('shift+click extends selection from last selected', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId('row-2'));
    await user.keyboard('{/Shift}');
    expect(screen.getByTestId('row-0').dataset.selected).toBe('true');
    expect(screen.getByTestId('row-1').dataset.selected).toBe('true');
    expect(screen.getByTestId('row-2').dataset.selected).toBe('true');
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('shift+click backward extends selection', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-2'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{/Shift}');
    expect(screen.getByTestId('row-0').dataset.selected).toBe('true');
    expect(screen.getByTestId('row-1').dataset.selected).toBe('true');
    expect(screen.getByTestId('row-2').dataset.selected).toBe('true');
  });
});

// ─── Delete key handler ───────────────────────────────────────────────────────

describe('QueueSidebar — Delete key', () => {
  it('Delete key calls removeFromQueue with selected indices', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-1'));
    await user.keyboard('{Delete}');
    await waitFor(() =>
      expect(mockRemoveFromQueue).toHaveBeenCalledWith([1])
    );
  });

  it('Delete key calls setItems to optimistically remove', async () => {
    const setItems = vi.fn();
    const { user } = setup({ setItems });
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Delete}');
    await waitFor(() => expect(setItems).toHaveBeenCalled());
  });

  it('Delete key does nothing when nothing is selected', async () => {
    const { user } = setup();
    await user.keyboard('{Delete}');
    expect(mockRemoveFromQueue).not.toHaveBeenCalled();
  });

  it('on removeFromQueue error calls onRefresh and onError', async () => {
    mockRemoveFromQueue.mockRejectedValue(new Error('boom'));
    const onRefresh = vi.fn();
    const onError = vi.fn();
    const { user } = setup({ onRefresh, onError });
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Delete}');
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Failed to remove track'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('Backspace key also triggers delete', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.keyboard('{Backspace}');
    await waitFor(() =>
      expect(mockRemoveFromQueue).toHaveBeenCalledWith([0])
    );
  });

  it('does not fire when sidebar is closed', async () => {
    const { user } = setup({ open: false });
    await user.keyboard('{Delete}');
    expect(mockRemoveFromQueue).not.toHaveBeenCalled();
  });
});

// ─── selection bar Delete button ──────────────────────────────────────────────

describe('QueueSidebar — selection bar Delete button', () => {
  it('shows Delete button when items selected', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('Delete button calls removeFromQueue', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('row-0'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(mockRemoveFromQueue).toHaveBeenCalledWith([0])
    );
  });

  it('Delete button calls onRefresh+onError on failure', async () => {
    mockRemoveFromQueue.mockRejectedValue(new Error('oops'));
    const onRefresh = vi.fn();
    const onError = vi.fn();
    const { user } = setup({ onRefresh, onError });
    await user.click(screen.getByTestId('row-0'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Failed to remove tracks'));
    expect(onRefresh).toHaveBeenCalled();
  });
});

// ─── clear queue ─────────────────────────────────────────────────────────────

describe('QueueSidebar — clear queue', () => {
  it('⊘ button shows clear confirm dialog', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Clear queue'));
    expect(screen.getByText(/Clear all 3 tracks/)).toBeInTheDocument();
  });

  it('Cancel dismisses the confirm dialog', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Clear queue'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Clear all/)).not.toBeInTheDocument();
  });

  it('Clear button calls clearQueue and setItems([])', async () => {
    const setItems = vi.fn();
    const { user } = setup({ setItems });
    await user.click(screen.getByTitle('Clear queue'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(mockClearQueue).toHaveBeenCalled());
    expect(setItems).toHaveBeenCalledWith([]);
  });

  it('clearQueue error calls onRefresh and onError', async () => {
    mockClearQueue.mockRejectedValue(new Error('fail'));
    const onRefresh = vi.fn();
    const onError = vi.fn();
    const { user } = setup({ onRefresh, onError });
    await user.click(screen.getByTitle('Clear queue'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Failed to clear queue'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('does not show ⊘ when queue is empty', () => {
    setup({ items: [] });
    expect(screen.queryByTitle('Clear queue')).not.toBeInTheDocument();
  });
});

// ─── header buttons ───────────────────────────────────────────────────────────

describe('QueueSidebar — header buttons', () => {
  it('Refresh button calls onRefresh', async () => {
    const onRefresh = vi.fn();
    const { user } = setup({ onRefresh });
    await user.click(screen.getByTitle('Refresh'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    const { user } = setup({ onClose });
    await user.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── items/open state ─────────────────────────────────────────────────────────

describe('QueueSidebar — items change clears selection', () => {
  it('selection clears when items prop changes', async () => {
    const { user, rerender } = setup();
    await user.click(screen.getByTestId('row-0'));
    expect(screen.getByTestId('row-0').dataset.selected).toBe('true');
    rerender(
      <QueueSidebar
        {...defaultProps}
        items={[makeItem(0), makeItem(1), makeItem(2), makeItem(3)]}
      />
    );
    // After rerender with new items, selection should be cleared
    await waitFor(() =>
      expect(screen.getByTestId('row-0').dataset.selected).toBe('false')
    );
  });
});
