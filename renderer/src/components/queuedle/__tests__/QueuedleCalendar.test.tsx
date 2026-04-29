import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuedleCalendar } from '../QueuedleCalendar';

const dates: GameDateEntry[] = [
  { gameId: '2025-03-10', status: 'ready', userPlayed: true },
  { gameId: '2025-03-12', status: 'ready', userPlayed: false },
  { gameId: '2025-03-14', status: 'ready', userPlayed: false },
];

describe('QueuedleCalendar', () => {
  it('opens on the month containing today', () => {
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={() => {}} />);
    expect(screen.getByText('March 2025')).toBeInTheDocument();
  });

  it('renders cells for every day of the month', () => {
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={() => {}} />);
    // 31 days in March
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('makes playable dates clickable and calls onSelectDate', () => {
    const onSelect = vi.fn();
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={onSelect} />);
    const playable = screen.getByLabelText(/2025-03-12 \(play\)/);
    fireEvent.click(playable);
    expect(onSelect).toHaveBeenCalledWith('2025-03-12');
  });

  it('allows clicking already-played dates to view the summary', () => {
    const onSelect = vi.fn();
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={onSelect} />);
    const played = screen.getByLabelText(/2025-03-10 \(played\)/);
    expect(played).not.toBeDisabled();
    fireEvent.click(played);
    expect(onSelect).toHaveBeenCalledWith('2025-03-10');
  });

  it('disables dates without a game entry and dates in the future', () => {
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={() => {}} />);
    // 2025-03-20 has no entry → not available
    expect(screen.getByLabelText(/2025-03-20 \(not available\)/)).toBeDisabled();
    // Future date
    expect(screen.getByLabelText(/2025-03-25 \(not available\)/)).toBeDisabled();
  });

  it('disables the next button when viewing the current month', () => {
    render(<QueuedleCalendar dates={dates} selectedDate={null} todayId="2025-03-15" onSelectDate={() => {}} />);
    expect(screen.getByLabelText('Next month')).toBeDisabled();
  });

  it('navigates to the previous month when the prev button is clicked', () => {
    render(
      <QueuedleCalendar
        dates={[
          { gameId: '2025-02-15', status: 'ready', userPlayed: false },
          { gameId: '2025-03-12', status: 'ready', userPlayed: false },
        ]}
        selectedDate={null}
        todayId="2025-03-15"
        onSelectDate={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText('Previous month'));
    expect(screen.getByText('February 2025')).toBeInTheDocument();
  });
});
