import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopNav } from '../TopNav';

const mockNavigate = vi.fn();
const mockUseLocation = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('../../hooks/useUserProfile', () => ({
  useUserProfile: () => ({ data: null, isLoading: false }),
}));

vi.mock('../../hooks/useImage', () => ({
  useImage: () => null,
}));

const defaultProps = {
  isAuthed: true,
  groups: [{ id: 'g1', name: 'Living Room', coordinatorId: 'g1', providerId: 'sonos' as const }],
  activeGroupId: 'g1',
  onGroupChange: vi.fn(),
  onResync: vi.fn(),
  displayName: 'Alice',
  onSaveName: vi.fn(),
  onChangelogOpen: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockUseLocation.mockReturnValue({ pathname: '/' });
  mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
  vi.mocked(window.sonos.isWindowMaximized).mockResolvedValue(false);
  vi.mocked(window.sonos.onWindowMaximized).mockReturnValue(() => {});
  vi.mocked(window.sonos.getVersion).mockResolvedValue('1.0.0');
  vi.mocked(window.sonos.onUpdateDownloaded).mockReturnValue(() => {});
  vi.mocked(window.sonos.minimizeWindow).mockResolvedValue(undefined);
  vi.mocked(window.sonos.maximizeWindow).mockResolvedValue(undefined);
  vi.mocked(window.sonos.closeWindow).mockResolvedValue(undefined);
});

describe('TopNav', () => {
  it('renders navigation buttons', () => {
    render(<TopNav {...defaultProps} />);
    expect(screen.getByTitle('Home')).toBeInTheDocument();
    expect(screen.getByTitle('Leaderboard')).toBeInTheDocument();
  });

  it('navigates to /leaderboard when Leaderboard is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Leaderboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
  });

  it('navigates to /queuedle when Queuedle is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Queuedle — daily game'));
    expect(mockNavigate).toHaveBeenCalledWith('/queuedle');
  });

  it('navigates to /search on Enter in search input, and remembers the search', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search…');
    await user.type(input, 'Beatles{Enter}');
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=Beatles', { replace: false });
    expect(JSON.parse(localStorage.getItem('tt2.recentSearches') ?? '[]')).toContain('Beatles');
  });

  it('searches as you type: one search per pause, after 2 characters', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Search…'), 'Beatles');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/search?q=Beatles', { replace: false }));
    const searches = mockNavigate.mock.calls.filter(([to]) => String(to).startsWith('/search?q='));
    expect(searches).toHaveLength(1);
  });

  it('does not search on a single character', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Search…'), 'B');
    await new Promise((r) => setTimeout(r, 400));
    expect(mockNavigate.mock.calls.filter(([to]) => String(to).startsWith('/search?q='))).toHaveLength(0);
  });

  it('replaces the history entry while already on the search page', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beat' })]);
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search…');
    expect(input).toHaveValue('Beat');
    await user.type(input, 'les');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/search?q=Beatles', { replace: true }));
  });

  it('opens the search page when the empty box is focused', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByPlaceholderText('Search…'));
    expect(mockNavigate).toHaveBeenCalledWith('/search', { replace: false });
  });

  it('moves focus to the top result on Down', async () => {
    const user = userEvent.setup();
    const target = document.createElement('button');
    target.setAttribute('data-search-stop', '');
    document.body.appendChild(target);
    render(<TopNav {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Search…'), '{ArrowDown}');
    expect(target).toHaveFocus();
    target.remove();
  });

  it('on Escape, goes back to the page search was opened from', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TopNav {...defaultProps} />);
    await user.click(screen.getByPlaceholderText('Search…'));
    expect(mockNavigate).toHaveBeenCalledWith('/search', { replace: false });
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    rerender(<TopNav {...defaultProps} />);
    await user.keyboard('{Escape}');
    expect(mockNavigate).toHaveBeenLastCalledWith(-1);
  });

  it('on Escape, goes Home when search was not opened from this box', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beatles' })]);
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('Search…'), '{Escape}');
    expect(mockNavigate).toHaveBeenLastCalledWith('/');
  });

  it('on Escape off the search page, only empties the box', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/album/x' });
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search…');
    await user.type(input, 'B{Escape}');
    expect(input).toHaveValue('');
    expect(mockNavigate).not.toHaveBeenCalledWith('/');
    expect(mockNavigate).not.toHaveBeenCalledWith(-1);
  });

  it('clears search and navigates to / on Clear button click', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Clear'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('calls onChangelogOpen when changelog button is clicked', async () => {
    const onChangelogOpen = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} onChangelogOpen={onChangelogOpen} />);
    await user.click(screen.getByTitle("What's new"));
    expect(onChangelogOpen).toHaveBeenCalled();
  });

  it('navigates to profile page when profile chip is clicked (signed in)', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('My profile'));
    expect(mockNavigate).toHaveBeenCalledWith('/profile/Alice');
  });

  it('calls onSaveName with trimmed name when Sign in is submitted (unauthenticated)', async () => {
    const onSaveName = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} displayName={null} onSaveName={onSaveName} />);
    await user.click(screen.getByTitle('Sign in'));
    await user.type(screen.getByPlaceholderText('Your name'), 'Bob');
    await user.click(screen.getAllByText('Sign in')[1]);
    expect(onSaveName).toHaveBeenCalledWith('Bob');
  });

  it('shows group name as button title', () => {
    render(<TopNav {...defaultProps} />);
    expect(screen.getByTitle('Living Room')).toBeInTheDocument();
  });

  it('shows Reconnect button when authed and no groups', () => {
    render(<TopNav {...defaultProps} groups={[]} />);
    expect(screen.getByTitle('Reconnect')).toBeInTheDocument();
  });

  it('calls onResync when Reconnect is clicked', async () => {
    const onResync = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} groups={[]} onResync={onResync} />);
    await user.click(screen.getByTitle('Reconnect'));
    expect(onResync).toHaveBeenCalled();
  });

  it('shows app version in sign-in popover after load (unauthenticated)', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} displayName={null} />);
    await user.click(screen.getByTitle('Sign in'));
    await waitFor(() => expect(screen.getByText('v1.0.0')).toBeInTheDocument());
  });

  it('search input is disabled when not authed', () => {
    render(<TopNav {...defaultProps} isAuthed={false} />);
    expect(screen.getByPlaceholderText('Search…')).toBeDisabled();
  });
});
