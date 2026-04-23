import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackDialog } from '../FeedbackDialog';

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('Test User');
  vi.mocked(window.sonos.openExternal).mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ html_url: 'https://github.com/issues/1' }),
  });
});

describe('FeedbackDialog', () => {
  it('renders Send Feedback heading', () => {
    render(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByText('Send Feedback')).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={onClose} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('submit button is disabled when title is empty', () => {
    render(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('submit button enables when title is entered', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'Bug title');
    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
  });

  it('switches to Feature request mode', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Feature request' }));
    expect(screen.getByPlaceholderText('What would you like?')).toBeInTheDocument();
  });

  it('shows success state after successful submission', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('Submitted!')).toBeInTheDocument());
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'API error' }),
    });
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument());
  });

  it('clicking View on GitHub opens external link', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => screen.getByText('View on GitHub ↗'));
    await user.click(screen.getByText('View on GitHub ↗'));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/issues/1');
  });
});
