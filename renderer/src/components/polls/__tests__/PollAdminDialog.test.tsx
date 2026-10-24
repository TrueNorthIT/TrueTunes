// Poll admin dialog (P-9, P-10, P-12), renderer/src/components/polls/PollAdminDialog.tsx (stub that throws).
//
//   P-9  "Admin dialog: list polls in schedule order with their liveFrom; add a poll (question +
//        2-6 non-empty choices, question required); edit or delete a poll that isn't live yet;
//        reorder upcoming polls (drag or up/down buttons) which re-assigns their Mondays per P-5.
//        Shows a live Vestaboard preview of the question and warns if it won't fit (P-12)."
//   P-10 "Polls that are live (liveFrom <= today) are locked: cannot be edited, deleted or reordered."
//   P-12 Preview and warning use the 22 x 4 wrap rules (renderer/src/lib/pollBoard.ts).
//
// The accessible names below ARE the contract the developer must expose:
//   dialog                       role="dialog", accessible name "Poll admin"; a "Close" button (aria-label)
//   per poll row                 the question text and its liveFrom (ISO "2026-10-26" or a formatted date)
//                                buttons named "Edit poll: <question>", "Delete poll: <question>",
//                                "Move up: <question>", "Move down: <question>"; for a live poll these are
//                                absent or disabled and the row says "Live"
//   "New poll" button            opens the form (editing a poll opens the same form, prefilled)
//   form                         textbox "Question", textboxes "Choice 1", "Choice 2", ... (two to start),
//                                button "Add choice" (disabled at 6), button "Save poll" (disabled while invalid)
//   save semantics               blank choice rows are ignored when saving; the payload is trimmed
//   delete                       uses window.confirm; no custom confirmation UI
//   preview                      a region named "Vestaboard preview" showing the board text: THIS WEEK'S POLL,
//                                the wrapped upper-case question lines, VOTE IN TRUE TUNES
//   warning                      an element with role="alert" mentioning that it does not fit, shown only
//                                when the question will not fit
// Data: window.sonos.pollAdminList / pollAdminCreate / pollAdminUpdate / pollAdminDelete / pollAdminReorder.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { PollAdminDialog } from '../PollAdminDialog';

const LIVE: PollAdminItem = {
  id: 'l1',
  question: 'Old live question?',
  choices: ['a', 'b'],
  liveFrom: '2026-10-12',
  live: true,
};
const U1: PollAdminItem = {
  id: 'u1',
  question: 'First upcoming?',
  choices: ['Yes', 'No'],
  liveFrom: '2026-10-26',
  live: false,
};
const U2: PollAdminItem = {
  id: 'u2',
  question: 'Second upcoming?',
  choices: ['Red', 'Blue', 'Green'],
  liveFrom: '2026-11-02',
  live: false,
};
const ALL = [LIVE, U1, U2];

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openDialog(polls: PollAdminItem[] = ALL) {
  vi.mocked(window.sonos.pollAdminList).mockResolvedValue({ polls });
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<PollAdminDialog onClose={onClose} />, { wrapper: Wrapper });
  await screen.findByText(polls[0]?.question ?? 'x');
  return { user, onClose };
}

const button = (name: string) => screen.getByRole('button', { name });
const unavailable = (name: string) => {
  const el = screen.queryByRole('button', { name });
  return el === null || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
};

beforeEach(() => {
  for (const fn of [
    window.sonos.pollAdminList,
    window.sonos.pollAdminCreate,
    window.sonos.pollAdminUpdate,
    window.sonos.pollAdminDelete,
    window.sonos.pollAdminReorder,
  ]) {
    vi.mocked(fn).mockReset();
  }
  vi.mocked(window.sonos.pollAdminCreate).mockResolvedValue({ poll: U1 });
  vi.mocked(window.sonos.pollAdminUpdate).mockResolvedValue({ poll: U1 });
  vi.mocked(window.sonos.pollAdminDelete).mockResolvedValue({ ok: true });
  vi.mocked(window.sonos.pollAdminReorder).mockResolvedValue({ polls: ALL });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('P-9 poll list', () => {
  it('is a dialog named Poll admin', async () => {
    await openDialog();
    expect(
      screen.getByRole('dialog', { name: /poll admin/i }),
      'Expected role=dialog with the name "Poll admin"'
    ).toBeInTheDocument();
  });

  it('lists polls in schedule order with their liveFrom', async () => {
    await openDialog();
    const text = document.body.textContent ?? '';
    const positions = [LIVE, U1, U2].map((p) => text.indexOf(p.question));
    expect(
      positions.every((p) => p >= 0),
      'Expected every poll question to be listed'
    ).toBe(true);
    expect(positions, 'Expected the schedule order: live poll, then First upcoming, then Second upcoming').toEqual(
      [...positions].sort((a, b) => a - b)
    );
    expect(text, 'Expected the Monday of each poll to be shown (ISO or formatted)').toMatch(
      /2026-10-26|26 Oct(ober)? 2026|Oct(ober)? 26,? 2026/
    );
    expect(text).toMatch(/2026-11-02|2 Nov(ember)? 2026|02 Nov(ember)? 2026|Nov(ember)? 2,? 2026/);
  });

  it('close button calls onClose', async () => {
    const { user, onClose } = await openDialog();
    await user.click(button('Close'));
    expect(onClose, 'Expected the Close button to call onClose').toHaveBeenCalled();
  });
});

describe('P-10 live polls are locked', () => {
  it('a live poll is marked Live and cannot be edited, deleted or moved', async () => {
    await openDialog();
    expect(screen.getByText(/^live$/i), 'Expected the live poll row to be marked "Live"').toBeInTheDocument();
    for (const action of ['Edit poll', 'Delete poll', 'Move up', 'Move down']) {
      expect(
        unavailable(`${action}: ${LIVE.question}`),
        `Expected "${action}" to be unavailable for the live poll`
      ).toBe(true);
    }
  });

  it('upcoming polls can be edited and deleted', async () => {
    await openDialog();
    expect(unavailable(`Edit poll: ${U1.question}`), 'Expected Edit to be available for an upcoming poll').toBe(false);
    expect(unavailable(`Delete poll: ${U1.question}`), 'Expected Delete to be available for an upcoming poll').toBe(
      false
    );
  });
});

describe('P-9 reorder', () => {
  it('the first upcoming poll cannot move up (the live poll above is locked) and the last cannot move down', async () => {
    await openDialog();
    expect(
      unavailable(`Move up: ${U1.question}`),
      'Expected Move up to be unavailable for the first upcoming poll'
    ).toBe(true);
    expect(unavailable(`Move down: ${U2.question}`), 'Expected Move down to be unavailable for the last poll').toBe(
      true
    );
  });

  it('Move down on the first upcoming poll sends the new order of upcoming ids', async () => {
    const { user } = await openDialog();
    await user.click(button(`Move down: ${U1.question}`));
    await waitFor(() => expect(window.sonos.pollAdminReorder).toHaveBeenCalledTimes(1));
    expect(window.sonos.pollAdminReorder, 'Expected only the upcoming ids, in the new order').toHaveBeenCalledWith([
      'u2',
      'u1',
    ]);
  });

  it('Move up on the second upcoming poll sends the new order of upcoming ids', async () => {
    const { user } = await openDialog();
    await user.click(button(`Move up: ${U2.question}`));
    await waitFor(() => expect(window.sonos.pollAdminReorder).toHaveBeenCalledWith(['u2', 'u1']));
  });
});

describe('P-9 delete', () => {
  it('deleting an upcoming poll calls pollAdminDelete with its id and refreshes the list', async () => {
    const { user } = await openDialog();
    const before = vi.mocked(window.sonos.pollAdminList).mock.calls.length;
    await user.click(button(`Delete poll: ${U2.question}`));
    await waitFor(() => expect(window.sonos.pollAdminDelete).toHaveBeenCalledWith('u2'));
    await waitFor(() =>
      expect(
        vi.mocked(window.sonos.pollAdminList).mock.calls.length,
        'Expected the list to be reloaded after deleting'
      ).toBeGreaterThan(before)
    );
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await openDialog();
    await user.click(button(`Delete poll: ${U2.question}`));
    expect(window.sonos.pollAdminDelete, 'Expected no delete after declining the confirmation').not.toHaveBeenCalled();
  });
});

describe('P-9 edit', () => {
  it('Edit opens the form prefilled, and saving calls pollAdminUpdate with the id and trimmed payload', async () => {
    const { user } = await openDialog();
    await user.click(button(`Edit poll: ${U1.question}`));
    const question = screen.getByRole('textbox', { name: 'Question' });
    expect(question, 'Expected the question to be prefilled').toHaveValue('First upcoming?');
    expect(screen.getByRole('textbox', { name: 'Choice 1' })).toHaveValue('Yes');
    expect(screen.getByRole('textbox', { name: 'Choice 2' })).toHaveValue('No');
    await user.clear(question);
    await user.type(question, '  Changed?  ');
    await user.click(button('Save poll'));
    await waitFor(() => expect(window.sonos.pollAdminUpdate).toHaveBeenCalledTimes(1));
    expect(window.sonos.pollAdminUpdate).toHaveBeenCalledWith('u1', { question: 'Changed?', choices: ['Yes', 'No'] });
  });
});

describe('P-9 add a poll', () => {
  async function openForm() {
    const ctx = await openDialog();
    await ctx.user.click(button('New poll'));
    return ctx;
  }

  it('Save is disabled until there is a question and two choices', async () => {
    const { user } = await openForm();
    expect(button('Save poll'), 'Expected Save to start disabled').toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Choice 1' }), 'Hobnob');
    await user.type(screen.getByRole('textbox', { name: 'Choice 2' }), 'Digestive');
    expect(button('Save poll'), 'Expected Save to stay disabled without a question').toBeDisabled();
  });

  it('Save is disabled with a question but fewer than two non-empty choices', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Best biscuit?');
    await user.type(screen.getByRole('textbox', { name: 'Choice 1' }), 'Hobnob');
    expect(button('Save poll'), 'Expected Save to be disabled with only one choice').toBeDisabled();
  });

  it('a whitespace-only question does not count as a question', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), '    ');
    await user.type(screen.getByRole('textbox', { name: 'Choice 1' }), 'a');
    await user.type(screen.getByRole('textbox', { name: 'Choice 2' }), 'b');
    expect(button('Save poll')).toBeDisabled();
  });

  it('a valid poll is saved with trimmed text via pollAdminCreate', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), '  Best biscuit? ');
    await user.type(screen.getByRole('textbox', { name: 'Choice 1' }), ' Hobnob ');
    await user.type(screen.getByRole('textbox', { name: 'Choice 2' }), 'Digestive');
    expect(button('Save poll'), 'Expected Save to be enabled for a valid poll').toBeEnabled();
    await user.click(button('Save poll'));
    await waitFor(() => expect(window.sonos.pollAdminCreate).toHaveBeenCalledTimes(1));
    expect(window.sonos.pollAdminCreate).toHaveBeenCalledWith({
      question: 'Best biscuit?',
      choices: ['Hobnob', 'Digestive'],
    });
  });

  it('blank choice rows are ignored when saving', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Best biscuit?');
    await user.type(screen.getByRole('textbox', { name: 'Choice 1' }), 'Hobnob');
    await user.type(screen.getByRole('textbox', { name: 'Choice 2' }), 'Digestive');
    await user.click(button('Add choice'));
    expect(screen.getByRole('textbox', { name: 'Choice 3' }), 'Expected a third choice field').toBeInTheDocument();
    await user.click(button('Save poll'));
    await waitFor(() =>
      expect(window.sonos.pollAdminCreate).toHaveBeenCalledWith({
        question: 'Best biscuit?',
        choices: ['Hobnob', 'Digestive'],
      })
    );
  });

  it('allows at most six choices', async () => {
    const { user } = await openForm();
    for (let i = 0; i < 4; i++) await user.click(button('Add choice'));
    expect(
      screen.getByRole('textbox', { name: 'Choice 6' }),
      'Expected six choice fields after four additions'
    ).toBeInTheDocument();
    expect(button('Add choice'), 'Expected Add choice to be disabled at six choices').toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Choice 7' })).toBeNull();
  });
});

describe('P-12 Vestaboard preview', () => {
  async function openForm() {
    const ctx = await openDialog();
    await ctx.user.click(button('New poll'));
    return ctx;
  }
  const preview = () => screen.getByRole('region', { name: /vestaboard preview/i });

  it('shows the board header, the question in upper case and the footer', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Best biscuit?');
    expect(preview(), 'Expected the board title').toHaveTextContent("THIS WEEK'S POLL");
    expect(preview(), 'Expected the question in upper case').toHaveTextContent('BEST BISCUIT?');
    expect(preview(), 'Expected the board footer').toHaveTextContent('VOTE IN TRUE TUNES');
  });

  it('shows a long question word-wrapped onto separate lines', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'AAAAAAAAAA BBBBBBBBBB CCC');
    const region = preview();
    expect(
      within(region).getByText('AAAAAAAAAA BBBBBBBBBB'),
      'Expected the first wrapped line as its own element'
    ).toBeInTheDocument();
    expect(
      within(region).getByText('CCC'),
      'Expected the overflow word on the next line as its own element'
    ).toBeInTheDocument();
  });

  it('shows no warning for a question that fits', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), 'Which office snack is the best?');
    expect(screen.queryByRole('alert'), 'Expected no warning for a question that fits').toBeNull();
  });

  it('warns when the question needs more than four rows', async () => {
    const { user } = await openForm();
    const five = ['A', 'B', 'C', 'D', 'E'].map((c) => c.repeat(22)).join(' ');
    await user.click(screen.getByRole('textbox', { name: 'Question' }));
    await user.paste(five);
    expect(
      await screen.findByRole('alert'),
      'Expected a warning that the question does not fit the board'
    ).toHaveTextContent(/fit/i);
  });

  it('warns when a single word is longer than 22 characters', async () => {
    const { user } = await openForm();
    await user.type(screen.getByRole('textbox', { name: 'Question' }), `Is ${'Z'.repeat(23)} good`);
    expect(
      await screen.findByRole('alert'),
      'Expected a warning for a word that cannot fit on one row'
    ).toHaveTextContent(/fit/i);
  });
});
