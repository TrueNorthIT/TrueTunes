import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangelogDialog } from '../ChangelogDialog';

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const releases = [
  { tag_name: 'v1.2.0', name: 'Version 1.2.0', body: '## Changes\n- Feature A', published_at: '2024-03-01T00:00:00Z', html_url: 'https://github.com/releases/1' },
  { tag_name: 'v1.1.0', name: 'Version 1.1.0', body: null, published_at: '2024-02-01T00:00:00Z', html_url: 'https://github.com/releases/2' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getVersion).mockResolvedValue('1.2.0');
  vi.mocked(window.sonos.openExternal).mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({ ok: true, json: async () => releases });
});

describe('ChangelogDialog', () => {
  it('renders heading', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ChangelogDialog onClose={vi.fn()} />);
    expect(screen.getByText('Loading releases…')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Could not load release notes.')).toBeInTheDocument());
  });

  it('shows empty state when no releases returned', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('No releases found.')).toBeInTheDocument());
  });

  it('renders release names in sidebar', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('v1.2.0').length).toBeGreaterThan(0));
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
  });

  it('shows first release content by default', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
  });

  it('shows "No release notes." when body is null', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Version 1.2.0'));
    const user = userEvent.setup();
    await user.click(screen.getByText('v1.1.0'));
    expect(screen.getByText('No release notes.')).toBeInTheDocument();
  });

  it('shows current version badge', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('v1.2.0').length).toBeGreaterThan(1));
    // v1.2.0 appears in the sidebar tag and the header badge
    expect(screen.getAllByText('v1.2.0').length).toBeGreaterThanOrEqual(2);
  });

  it('marks current version in sidebar with title', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Version 1.2.0'));
    expect(screen.getByTitle('Current version')).toBeInTheDocument();
  });

  it('clicking a sidebar item switches content', async () => {
    const user = userEvent.setup();
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('v1.1.0'));
    await user.click(screen.getByText('v1.1.0'));
    expect(screen.getByText('Version 1.1.0')).toBeInTheDocument();
  });

  it('calls onClose when X button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangelogDialog onClose={onClose} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangelogDialog onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls openExternal when View on GitHub is clicked', async () => {
    const user = userEvent.setup();
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByTitle('View on GitHub'));
    await user.click(screen.getByTitle('View on GitHub'));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/releases/1');
  });

  it('auto-selects current version release', async () => {
    render(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
    expect(screen.getByText('current')).toBeInTheDocument();
  });
});
