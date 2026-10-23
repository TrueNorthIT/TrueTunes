import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueuedleStatsPanel } from '../QueuedleStatsPanel';
import type { QueuedleDay } from '../../../lib/queuedleStats';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const PLAYERS = ['Rich', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
const days: QueuedleDay[] = [
  {
    gameId: '2026-10-20',
    questionCount: 10,
    scores: PLAYERS.map((userName, i) => ({ userName, mainScore: 5, bonusScore: i % 5, total: 5 + (i % 5) })),
  },
];
vi.mock('../../../hooks/useDailyGame', () => ({
  useQueuedleHistory: () => ({ data: days, isLoading: false, isError: false }),
}));

const chip = (name: string) => screen.getByRole('button', { name: (n) => n === name || n === `${name} (you)` });
const isOn = (name: string) => chip(name).getAttribute('aria-pressed') === 'true';

beforeEach(() => {
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('Rich');
});

describe('Queuedle stats highlighting', () => {
  it('lets you highlight seven others alongside yourself, then stops', async () => {
    render(<QueuedleStatsPanel />);
    await waitFor(() => expect(isOn('Rich')).toBe(true));
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].forEach((p) => fireEvent.click(chip(p)));
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].every(isOn)).toBe(true);
    expect(chip('p8')).toBeDisabled();
    expect(screen.getByText(/7 picked/)).toBeInTheDocument();
  });

  it("keeps everyone else's colour when one pick is removed", async () => {
    render(<QueuedleStatsPanel />);
    await waitFor(() => expect(isOn('Rich')).toBe(true));
    ['p1', 'p2', 'p3'].forEach((p) => fireEvent.click(chip(p)));
    const swatch = (name: string) => (chip(name).querySelector('span') as HTMLElement).style.background;
    const p3Before = swatch('p3');
    fireEvent.click(chip('p2'));
    expect(isOn('p2')).toBe(false);
    expect(swatch('p3')).toBe(p3Before);
    // The freed colour goes to the next person picked.
    fireEvent.click(chip('p4'));
    expect(swatch('p4')).not.toBe(p3Before);
  });

  it('clears all picks but keeps you highlighted', async () => {
    render(<QueuedleStatsPanel />);
    await waitFor(() => expect(isOn('Rich')).toBe(true));
    fireEvent.click(chip('p1'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(isOn('p1')).toBe(false);
    expect(isOn('Rich')).toBe(true);
  });
});
