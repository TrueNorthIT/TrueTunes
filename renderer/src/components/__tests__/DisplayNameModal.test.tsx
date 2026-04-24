import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisplayNameModal } from '../DisplayNameModal';

describe('DisplayNameModal', () => {
  it('renders the heading', () => {
    render(<DisplayNameModal onSave={vi.fn()} />);
    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
  });

  it("submit button is disabled when input is empty", () => {
    render(<DisplayNameModal onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: "Let's go" })).toBeDisabled();
  });

  it('submit button enables when input has non-whitespace text', async () => {
    const user = userEvent.setup();
    render(<DisplayNameModal onSave={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('Your name'), 'Joe');
    expect(screen.getByRole('button', { name: "Let's go" })).not.toBeDisabled();
  });

  it('calls onSave with trimmed name on submit', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<DisplayNameModal onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('Your name'), '  Joe  ');
    await user.click(screen.getByRole('button', { name: "Let's go" }));
    expect(onSave).toHaveBeenCalledWith('Joe');
  });

  it('does not call onSave when input is only whitespace', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<DisplayNameModal onSave={onSave} />);
    await user.type(screen.getByPlaceholderText('Your name'), '   ');
    await user.click(screen.getByRole('button', { name: "Let's go" }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
