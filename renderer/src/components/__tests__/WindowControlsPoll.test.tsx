// Weekly anonymous poll: the title-bar "Poll" button and the answer dialog.
//
// Requirements (agreed weekly-poll requirements; IDs kept in test names):
//   P-1 "When at least one poll is waiting for the user, an orange 'Poll' button with a lucide-react
//       `Vote` (ballot box) icon appears in the title bar next to the existing green Update button
//       (renderer/src/components/WindowControls.tsx, styles WindowControls.module.css); the icon
//       shakes briefly every few seconds (CSS keyframes; respect prefers-reduced-motion). Not shown
//       when nothing is waiting."
//   P-2 "Clicking it opens a dialog with the question and its choices; choosing one submits it; once
//       no unanswered polls remain the button disappears; if more are waiting, the next one is offered."
//   P-3 "the answer request body contains only pollId + choice index; no telemetry event
//       (window.sonos.trackEvent) ... includes the user or the chosen answer."
//   P-4 "'Answered' is remembered only locally (localStorage key per poll id, like
//       `queuedle-played:${gameId}`); restart doesn't bring an answered poll back."
//   P-6 "the user sees every live poll ... they haven't answered, one at a time, oldest first."
//
// Code under test: <WindowControls> (renderer/src/components/WindowControls.tsx), which must render
// the Poll button and open the dialog (new components/hooks under renderer/src/components/polls and
// renderer/src/hooks/usePolls.ts are up to the developer). Data comes from
// window.sonos.fetchPolls() -> { polls: PollLive[] } (the server already applies the live and
// current-year rules, see pollService.listLive); answers go through window.sonos.answerPoll.
// The local "answered" key is `poll-answered:${pollId}`.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { WindowControls } from '../WindowControls';

const BISCUIT: PollLive = { id: 'p1', question: 'Best biscuit?', choices: ['Hobnob', 'Digestive', 'Rich Tea'], liveFrom: '2026-10-19' };
const DRINK: PollLive = { id: 'p2', question: 'Tea or coffee?', choices: ['Tea', 'Coffee'], liveFrom: '2026-10-26' };
const USER_NAME = 'Richard Kelsey';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderControls() {
  return render(<WindowControls />, { wrapper: Wrapper });
}

function withPolls(...polls: PollLive[]) {
  vi.mocked(window.sonos.fetchPolls).mockResolvedValue({ polls });
}

const pollButton = () => screen.queryByRole('button', { name: /^poll\b/i });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(window.sonos.fetchPolls).mockReset();
  vi.mocked(window.sonos.answerPoll).mockReset();
  vi.mocked(window.sonos.trackEvent).mockReset();
  vi.mocked(window.sonos.onUpdateDownloaded).mockReset();
  vi.mocked(window.sonos.fetchPolls).mockResolvedValue({ polls: [] });
  vi.mocked(window.sonos.answerPoll).mockResolvedValue({ ok: true });
  vi.mocked(window.sonos.trackEvent).mockResolvedValue(undefined);
  vi.mocked(window.sonos.onUpdateDownloaded).mockImplementation(() => () => {});
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue(USER_NAME);
});

describe('P-1 Poll button in the title bar', () => {
  it('is shown when a poll is waiting, with the ballot-box (lucide Vote) icon and the label Poll', async () => {
    withPolls(BISCUIT);
    renderControls();
    // Wait on the cheap text query, then run the role query once. As the file's
    // first test it pays the cold (~150ms alone, 1s+ under load) ByRole setup,
    // which inside findByRole's polling ate its whole 1000ms budget.
    await screen.findByText('Poll');
    const button = screen.getByRole('button', { name: /^poll\b/i });
    expect(button, 'Expected a Poll button when one unanswered live poll exists').toBeInTheDocument();
    expect(button.querySelector('svg.lucide-vote'), 'Expected the lucide-react Vote icon inside the Poll button').not.toBeNull();
    expect(button, 'Expected the visible label "Poll"').toHaveTextContent('Poll');
  });

  it('is not shown when no poll is waiting', async () => {
    withPolls();
    renderControls();
    await waitFor(() => expect(window.sonos.fetchPolls).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pollButton(), 'Expected no Poll button when nothing is waiting').toBeNull();
  });

  it('sits next to the green Update button when an update is ready', async () => {
    withPolls(BISCUIT);
    vi.mocked(window.sonos.onUpdateDownloaded).mockImplementation((cb: (version: string) => void) => {
      cb('9.9.9');
      return () => {};
    });
    renderControls();
    const poll = await screen.findByRole('button', { name: /^poll\b/i });
    const update = screen.getByRole('button', { name: /update/i });
    expect(poll.parentElement, 'Expected Poll and Update to be siblings in the title bar').toBe(update.parentElement);
  });

  it('styles: has a shake keyframe animation and honours prefers-reduced-motion', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/WindowControls.module.css'), 'utf8');
    expect(css, 'Expected an @keyframes rule with "shake" in its name in WindowControls.module.css').toMatch(/@keyframes\s+[\w-]*shake[\w-]*/i);
    expect(css, 'Expected a prefers-reduced-motion media query in WindowControls.module.css').toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i);
  });
});

describe('P-2 answering from the dialog', () => {
  it('clicking Poll opens a dialog showing the question and every choice', async () => {
    withPolls(BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog, 'Expected the poll question in the dialog').toHaveTextContent('Best biscuit?');
    for (const choice of BISCUIT.choices) {
      expect(screen.getByRole('button', { name: choice }), `Expected a button for the choice "${choice}"`).toBeInTheDocument();
    }
  });

  it('choosing an answer submits it, and with nothing else waiting the dialog and button disappear', async () => {
    withPolls(BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Digestive' }));
    await waitFor(() => expect(window.sonos.answerPoll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog'), 'Expected the dialog to close when no polls remain').toBeNull());
    expect(pollButton(), 'Expected the Poll button to disappear once nothing is waiting').toBeNull();
  });

  it('when more polls are waiting the next one is offered straight after answering', async () => {
    withPolls(BISCUIT, DRINK);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Hobnob' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog, 'Expected the second poll to be shown next').toHaveTextContent('Tea or coffee?'));
    expect(pollButton(), 'Expected the Poll button to stay while another poll waits').not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Coffee' }));
    await waitFor(() => expect(pollButton(), 'Expected the button to go after the last poll is answered').toBeNull());
  });
});

describe('P-6 catch-up order', () => {
  it('offers the oldest unanswered live poll first, whatever order the server returned', async () => {
    withPolls(DRINK, BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    expect(await screen.findByRole('dialog'), 'Expected the poll live from 2026-10-19 before the one live from 2026-10-26').toHaveTextContent('Best biscuit?');
  });
});

describe('P-3 anonymity', () => {
  it('the answer request carries exactly { pollId, choice } with the zero-based choice index', async () => {
    withPolls(BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Digestive' }));
    await waitFor(() => expect(window.sonos.answerPoll).toHaveBeenCalled());
    expect(window.sonos.answerPoll, 'Expected only pollId and choice (index 1 = Digestive), no user or timestamp').toHaveBeenCalledWith({ pollId: 'p1', choice: 1 });
  });

  it('no telemetry event mentions the user or the chosen answer', async () => {
    withPolls(BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Digestive' }));
    await waitFor(() => expect(window.sonos.answerPoll).toHaveBeenCalled());
    const telemetry = JSON.stringify(vi.mocked(window.sonos.trackEvent).mock.calls);
    expect(telemetry, 'Expected no trackEvent payload to contain the chosen answer').not.toContain('Digestive');
    expect(telemetry, 'Expected no trackEvent payload to contain the user name').not.toContain(USER_NAME);
  });
});

describe('P-4 answered is remembered locally only', () => {
  it('records the answer in localStorage under poll-answered:<pollId>', async () => {
    withPolls(BISCUIT);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Rich Tea' }));
    await waitFor(() => expect(localStorage.getItem('poll-answered:p1'), 'Expected the answered flag for poll p1').not.toBeNull());
    expect(localStorage.getItem('poll-answered:p1') ?? '', 'Expected the stored value not to reveal which choice was picked').not.toContain('Rich Tea');
  });

  it('a poll already answered locally is not offered after a restart', async () => {
    localStorage.setItem('poll-answered:p1', '1');
    withPolls(BISCUIT);
    renderControls();
    await waitFor(() => expect(window.sonos.fetchPolls).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pollButton(), 'Expected no Poll button when the only live poll was answered earlier').toBeNull();
  });

  it('only the unanswered polls are offered after a restart', async () => {
    localStorage.setItem('poll-answered:p1', '1');
    withPolls(BISCUIT, DRINK);
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    expect(await screen.findByRole('dialog'), 'Expected the unanswered poll p2 to be offered').toHaveTextContent('Tea or coffee?');
  });

  it('a failed submission is not remembered and the poll stays available to retry', async () => {
    withPolls(BISCUIT);
    vi.mocked(window.sonos.answerPoll).mockResolvedValue({ error: 'HTTP 500' });
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole('button', { name: /^poll\b/i }));
    await user.click(await screen.findByRole('button', { name: 'Hobnob' }));
    await waitFor(() => expect(window.sonos.answerPoll).toHaveBeenCalled());
    expect(localStorage.getItem('poll-answered:p1'), 'Expected nothing remembered when the server rejected the answer').toBeNull();
    expect(screen.getByRole('dialog'), 'Expected the question to remain so the user can retry').toHaveTextContent('Best biscuit?');
  });
});
