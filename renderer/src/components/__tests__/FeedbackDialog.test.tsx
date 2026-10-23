import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackDialog } from '../FeedbackDialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

// The display name now comes from a React Query cache, so panels need a client.
let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
const renderQ = (ui: ReactElement) =>
  render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('Test User');
  vi.mocked(window.sonos.openExternal).mockResolvedValue(undefined);
  vi.mocked(window.sonos.submitFeedback).mockResolvedValue({ url: 'https://github.com/issues/1' });
});

describe('FeedbackDialog', () => {
  it('is a dialog titled "Send feedback"', () => {
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
  });

  it('says whose name goes on the issue', async () => {
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    expect(await screen.findByText('Test User')).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={onClose} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('starts with focus in the title field', () => {
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });

  it('send button is disabled when title is empty', () => {
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('send button enables when title is entered', async () => {
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'Bug title');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('switches to Feature request mode and marks it pressed', async () => {
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Feature request' }));
    expect(screen.getByPlaceholderText('What would you like?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feature request' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bug report' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Enter in the title field sends it (the form wraps the action row)', async () => {
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug{Enter}');
    await waitFor(() => expect(window.sonos.submitFeedback).toHaveBeenCalledWith('bug', 'A bug', ''));
  });

  it('shows success state after successful submission', async () => {
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('dialog', { name: "Thanks, it's on GitHub" })).toBeInTheDocument();
  });

  it('shows the error and allows another try', async () => {
    vi.mocked(window.sonos.submitFeedback).mockResolvedValueOnce({ error: 'API error' });
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API error');
    // It used to stay disabled after an error, so the only way to retry was to close and retype.
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('dialog', { name: "Thanks, it's on GitHub" })).toBeInTheDocument();
  });

  it('clicking View on GitHub opens external link', async () => {
    const user = userEvent.setup();
    renderQ(<FeedbackDialog onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('What went wrong?'), 'A bug');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.click(await screen.findByRole('button', { name: 'View on GitHub' }));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/issues/1');
  });
});
