import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PollAnswerDialog } from '../PollAnswerDialog';

const POLL: PollLive = {
  id: 'p1',
  question: 'Best biscuit?',
  choices: ['Hobnob', 'Digestive'],
  liveFrom: '2026-10-19',
};

describe('PollAnswerDialog', () => {
  it('is named by the question and sends the chosen index', async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(
      <PollAnswerDialog
        poll={POLL}
        remaining={2}
        submitting={false}
        error={null}
        onChoose={onChoose}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Best biscuit?' })).toBeInTheDocument();
    expect(screen.getByText(/1 more waiting/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Digestive' }));
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('disables the choices while a vote is being sent', () => {
    render(<PollAnswerDialog poll={POLL} remaining={1} submitting error={null} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Hobnob' })).toBeDisabled();
  });
});
