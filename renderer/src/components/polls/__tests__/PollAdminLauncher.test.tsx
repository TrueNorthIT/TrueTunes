// P-8 "A cheat-code key sequence typed anywhere in the app (Konami ...) opens a poll admin dialog.
// Honour system: no server-side auth."
//
// Code under test: <PollAdminLauncher /> (renderer/src/components/polls/PollAdminLauncher.tsx, stub that
// throws). It is mounted once in App.tsx, renders nothing until the code is typed, then renders
// <PollAdminDialog> (role="dialog", name "Poll admin"); the dialog's Close button hides it again.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { PollAdminLauncher } from '../PollAdminLauncher';
// Literal Konami code (the code the launcher must respond to).
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const type = (keys: readonly string[], target: Element = document.body) => {
  for (const key of keys) fireEvent.keyDown(target, { key });
};

beforeEach(() => {
  vi.mocked(window.sonos.pollAdminList).mockReset();
  vi.mocked(window.sonos.pollAdminList).mockResolvedValue({ polls: [] });
});

describe('P-8 PollAdminLauncher', () => {
  it('shows nothing until the cheat code is typed', () => {
    render(<PollAdminLauncher />, { wrapper: Wrapper });
    expect(screen.queryByRole('dialog'), 'Expected no admin dialog by default').toBeNull();
  });

  it('typing the Konami code anywhere opens the poll admin dialog', async () => {
    render(<PollAdminLauncher />, { wrapper: Wrapper });
    type(KONAMI_CODE);
    expect(await screen.findByRole('dialog', { name: /poll admin/i }), 'Expected the Konami code to open the poll admin dialog').toBeInTheDocument();
  });

  it('does not open when the code is typed into a text field', async () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <PollAdminLauncher />
      </>,
      { wrapper: Wrapper },
    );
    type(KONAMI_CODE, screen.getByLabelText('elsewhere'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog'), 'Expected typing in an input not to open the dialog').toBeNull();
  });

  it('closing the dialog hides it again', async () => {
    const user = userEvent.setup();
    render(<PollAdminLauncher />, { wrapper: Wrapper });
    type(KONAMI_CODE);
    await screen.findByRole('dialog', { name: /poll admin/i });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog'), 'Expected the dialog to close').toBeNull());
  });
});
