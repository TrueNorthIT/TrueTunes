import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ChangelogDialog } from '../ChangelogDialog';

const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const releases = [
  {
    tag_name: 'v1.2.0',
    name: 'Version 1.2.0',
    body: '## Changes\n- Feature A',
    published_at: '2024-03-01T00:00:00Z',
    html_url: 'https://github.com/releases/1',
  },
  {
    tag_name: 'v1.1.0',
    name: 'Version 1.1.0',
    body: null,
    published_at: '2024-02-01T00:00:00Z',
    html_url: 'https://github.com/releases/2',
  },
];

function renderDialog(ui: ReactElement, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getVersion).mockResolvedValue('1.2.0');
  vi.mocked(window.sonos.openExternal).mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({ ok: true, json: async () => releases });
});

describe('ChangelogDialog', () => {
  it('reopening within the hour reuses the releases instead of asking GitHub again', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderDialog(<ChangelogDialog onClose={vi.fn()} />, qc);
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
    first.unmount();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />, qc);
    expect(screen.getByText('Version 1.2.0')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('is a dialog titled in sentence case', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    expect(screen.getByText('Loading releases…')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Couldn't load the release notes from GitHub.")).toBeInTheDocument());
  });

  it('Try again refetches after an error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('shows empty state when no releases returned', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('No releases yet.')).toBeInTheDocument());
  });

  it('renders release names in sidebar', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText('1.2.0').length).toBeGreaterThan(0));
    expect(screen.getByText('1.1.0')).toBeInTheDocument();
  });

  it('shows first release content by default', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
  });

  it('shows "No release notes." when body is null', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Version 1.2.0'));
    const user = userEvent.setup();
    await user.click(screen.getByText('1.1.0'));
    expect(screen.getByText('No release notes.')).toBeInTheDocument();
  });

  it('marks the installed release in the list in words, not only colour', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('Version 1.2.0'));
    expect(screen.getByRole('button', { name: /^1\.2\.0\s*Installed$/ })).toHaveAttribute('aria-current', 'true');
  });

  it('opens links in the notes in the browser instead of the app window', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ ...releases[0], body: 'See [the PR](https://github.com/pr/9)' }],
    });
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await user.click(await screen.findByRole('link', { name: 'the PR' }));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/pr/9');
  });

  it('clicking a sidebar item switches content', async () => {
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => screen.getByText('1.1.0'));
    await user.click(screen.getByText('1.1.0'));
    expect(screen.getByText('Version 1.1.0')).toBeInTheDocument();
  });

  it('calls onClose when X button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={onClose} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls openExternal when View on GitHub is clicked', async () => {
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'View on GitHub' }));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/releases/1');
  });

  it('auto-selects current version release', async () => {
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Version 1.2.0')).toBeInTheDocument());
    expect(screen.getByText(/the version you have/)).toBeInTheDocument();
  });

  it('labels versions without the v, in the rail and the heading alike', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ ...releases[0], name: '' }] });
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: '1.2.0' })).toBeInTheDocument();
    expect(screen.queryByText(/^v1/)).toBeNull();
  });

  it('lists the 8 newest releases plus the installed one, and links to the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...releases[1],
      tag_name: `v1.0.${20 - i}`,
      name: `1.0.${20 - i}`,
    }));
    vi.mocked(window.sonos.getVersion).mockResolvedValue('1.0.10');
    mockFetch.mockResolvedValue({ ok: true, json: async () => many });
    const user = userEvent.setup();
    renderDialog(<ChangelogDialog onClose={vi.fn()} />);
    const rail = await screen.findByRole('navigation', { name: 'Releases' });
    await waitFor(() => expect(screen.getByRole('heading', { name: '1.0.10' })).toBeInTheDocument());
    const tags = [...rail.querySelectorAll('[aria-current], button')].map((b) => b.textContent);
    expect(tags.filter((t) => /^1\.0\.\d+/.test(t ?? ''))).toHaveLength(9);
    expect(tags).toContain('1.0.10Installed');
    await user.click(screen.getByRole('button', { name: 'Older releases on GitHub' }));
    expect(window.sonos.openExternal).toHaveBeenCalledWith('https://github.com/TrueNorthIT/TrueTunes/releases');
  });
});
