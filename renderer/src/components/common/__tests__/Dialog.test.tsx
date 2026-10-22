import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '../Dialog';

function Opener({ onSubmit }: { onSubmit?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      {open && (
        <Dialog title="Rename" onClose={() => setOpen(false)} onSubmit={onSubmit} actions={<button type="submit">Save</button>}>
          <input aria-label="Name" />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('is a modal dialog named by its title, portalled to body', () => {
    render(<Dialog title="Past games" onClose={vi.fn()}>body</Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'Past games' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog.parentElement).toBe(document.body);
  });

  it('focuses the first field, and returns focus to the opener on close', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open it' })).toHaveFocus();
  });

  it('keeps Esc from reaching page-level handlers', async () => {
    const pageEsc = vi.fn();
    document.addEventListener('keydown', pageEsc);
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', pageEsc);
    expect(pageEsc).not.toHaveBeenCalled();
  });

  it('with onSubmit, a submit button in the action row submits the form', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Opener onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Open it' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes on the native cancel event (backdrop click with closedby="any")', () => {
    const onClose = vi.fn();
    render(<Dialog title="Info" onClose={onClose}>body</Dialog>);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
