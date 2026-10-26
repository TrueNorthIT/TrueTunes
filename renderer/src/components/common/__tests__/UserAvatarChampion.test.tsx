import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from '../UserAvatar';
import { QueuerChip } from '../QueuerChip';
import { PersonName } from '../PersonName';
import { ChampionContext } from '../../../lib/champion';
import type { Champion } from '../../../lib/championCache';

const champion: Champion = {
  userName: 'Rich',
  total: 65,
  gamesPlayed: 5,
  bestTotal: 18,
  range: { from: '2026-10-19', to: '2026-10-25' },
};
const LABEL = 'Queuedle champion, week of 19–25 Oct';

const withChampion =
  (value: Champion | null) =>
  ({ children }: { children: ReactNode }) => (
    <ChampionContext.Provider value={value}>{children}</ChampionContext.Provider>
  );

describe('UserAvatar: last week’s Queuedle champion', () => {
  it('crowns the champion, and says so in words', () => {
    const { container } = render(<UserAvatar name="Rich" className="face" />, { wrapper: withChampion(champion) });
    const avatar = screen.getByRole('img', { name: LABEL });
    expect(avatar).toHaveAttribute('title', LABEL);
    expect(avatar).toHaveClass('face');
    expect(avatar).not.toHaveAttribute('aria-hidden');
    expect(container.querySelector('svg text')?.textContent).toContain('👑');
  });

  it('matches the name regardless of case and stray spaces', () => {
    render(<UserAvatar name=" rich " />, { wrapper: withChampion(champion) });
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });

  it('leaves everyone else exactly as before', () => {
    const plain = render(<UserAvatar name="Abbie" className="face" />).container.innerHTML; // no champion at all
    const { container } = render(<UserAvatar name="Abbie" className="face" />, { wrapper: withChampion(champion) });
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.className).toBe('face initial'); // the caller's class plus the no-photo initial, no champion ring
    expect(el?.querySelector('svg')).toBeNull();
    expect(container.innerHTML).toBe(plain);
  });

  it('crowns no one when there was no champion, or outside a provider', () => {
    render(<UserAvatar name="Rich" />, { wrapper: withChampion(null) });
    render(<UserAvatar name="Rich" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it("puts the title in the queued-by chip's own label, and golds the name", () => {
    render(
      <>
        <QueuerChip user="Rich" onOpen={() => {}} />
        <PersonName name="Rich" className="n" />
        <PersonName name="Abbie" className="n" />
      </>,
      { wrapper: withChampion(champion) }
    );
    expect(screen.getByRole('button', { name: `Queued by Rich, ${LABEL}, open profile` })).toBeInTheDocument();
    const [rich, abbie] = screen.getAllByText(/^(Rich|Abbie)$/);
    expect(rich.className).not.toBe('n');
    expect(abbie.className).toBe('n');
  });
});
