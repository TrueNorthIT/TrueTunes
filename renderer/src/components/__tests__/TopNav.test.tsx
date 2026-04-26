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

const defaultProps = {
  isAuthed: true,
  groups: [{ id: 'g1', name: 'Living Room', coordinatorId: 'g1', providerId: 'sonos' as const }],
  activeGroupId: 'g1',
  onGroupChange: vi.fn(),
  queueOpen: false,
  onToggleQueue: vi.fn(),
  onResync: vi.fn(),
  displayName: 'Alice',
  onSaveName: vi.fn(),
  onChangelogOpen: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(screen.getByTitle('Queue')).toBeInTheDocument();
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

  it('navigates to /search on Enter in search input', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search…');
    await user.type(input, 'Beatles{Enter}');
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=Beatles');
  });

  it('navigates to / on Escape in search input', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search…');
    await user.type(input, 'test{Escape}');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('clears search and navigates to / on Clear button click', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Clear'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('calls onToggleQueue when Queue is clicked', async () => {
    const onToggleQueue = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} onToggleQueue={onToggleQueue} />);
    await user.click(screen.getByTitle('Queue'));
    expect(onToggleQueue).toHaveBeenCalled();
  });

  it('calls onChangelogOpen when changelog button is clicked', async () => {
    const onChangelogOpen = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} onChangelogOpen={onChangelogOpen} />);
    await user.click(screen.getByTitle("What's new"));
    expect(onChangelogOpen).toHaveBeenCalled();
  });

  it('shows user name popover when User icon is clicked', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Alice'));
    expect(screen.getByText('Display name')).toBeInTheDocument();
  });

  it('calls onSaveName with trimmed name when Save is clicked', async () => {
    const onSaveName = vi.fn();
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} displayName="Alice" onSaveName={onSaveName} />);
    await user.click(screen.getByTitle('Alice'));
    const input = screen.getByDisplayValue('Alice');
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.click(screen.getByText('Save'));
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

  it('calls minimizeWindow on Minimise click', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Minimise'));
    expect(window.sonos.minimizeWindow).toHaveBeenCalled();
  });

  it('shows app version in name popover after load', async () => {
    const user = userEvent.setup();
    render(<TopNav {...defaultProps} />);
    await user.click(screen.getByTitle('Alice'));
    await waitFor(() => expect(screen.getByText('v1.0.0')).toBeInTheDocument());
  });

  it('search input is disabled when not authed', () => {
    render(<TopNav {...defaultProps} isAuthed={false} />);
    expect(screen.getByPlaceholderText('Search…')).toBeDisabled();
  });
});
