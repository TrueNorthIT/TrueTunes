// The screens that can't be reached in the live app without spending a real attempt (intro for a
// colleague's faces, rank change, leaderboard edge cases), rendered on their own.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueuedleIntro } from '../QueuedleIntro';
import { QueuedleRankChange, type RankSnapshot } from '../QueuedleRankChange';
import { QueuedleLeaderboard } from '../QueuedleLeaderboard';
import { QueuedleBonusResults } from '../QueuedleBonusResults';
import type { GameRanking } from '../../../hooks/useDailyGame';

describe('QueuedleIntro', () => {
  it('explains the rounds, counts the points and starts the game', () => {
    const onStart = vi.fn();
    render(<QueuedleIntro onStart={onStart} rounds={10} />);
    expect(screen.getByRole('heading', { name: '10 rounds on what the office has queued' })).toBeInTheDocument();
    expect(screen.getByText('Higher or lower')).toBeInTheDocument();
    expect(screen.getByText('Top queuer')).toBeInTheDocument();
    expect(screen.getByText(/20 in all/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('shows who has already played', () => {
    render(<QueuedleIntro onStart={() => {}} rounds={10} players={[{ name: 'Alex' }, { name: 'Rich' }]} />);
    expect(screen.getByText('Alex and Rich have played today')).toBeInTheDocument();
  });

  it('says nothing about players when nobody has played', () => {
    render(<QueuedleIntro onStart={() => {}} rounds={10} />);
    expect(screen.queryByText(/played today/)).not.toBeInTheDocument();
  });
});

const snap = (over: Partial<RankSnapshot>): RankSnapshot => ({
  rating: 1800,
  averagePercent: 60,
  gamesPlayed: 5,
  tierKey: 'aux-cable-apprentice',
  tierName: 'Aux Cable Apprentice',
  isProvisional: false,
  ...over,
});

describe('QueuedleRankChange', () => {
  it('welcomes a first-time player and counts the games to a tier', () => {
    render(
      <QueuedleRankChange
        before={null}
        after={snap({ gamesPlayed: 1, isProvisional: true, tierKey: 'provisional', tierName: 'Provisional' })}
        onContinue={() => {}}
      />
    );
    expect(screen.getByRole('heading', { name: 'Welcome to the ranks' })).toBeInTheDocument();
    expect(screen.getByText(/play 2 more games to lock in a tier/)).toBeInTheDocument();
  });

  it('shows the rating change and a tier move', () => {
    const onContinue = vi.fn();
    render(
      <QueuedleRankChange
        before={snap({ rating: 1800 })}
        after={snap({ rating: 2150, tierKey: 'algorithm-whisperer', tierName: 'Algorithm Whisperer' })}
        onContinue={onContinue}
      />
    );
    expect(screen.getByRole('heading', { name: 'Rank update' })).toBeInTheDocument();
    expect(screen.getByText('+350')).toBeInTheDocument();
    expect(screen.getByText('Aux Cable Apprentice')).toBeInTheDocument();
    expect(screen.getByText('Algorithm Whisperer')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'to' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalled();
  });
});

const lbProps = {
  onTab: () => {},
  gameId: null,
  rankings: [] as GameRanking[],
  rankingsLoading: false,
  imageByUser: new Map<string, string | null>(),
  onOpenProfile: () => {},
};

describe('QueuedleLeaderboard', () => {
  const scores = [
    { userName: 'Alex', mainScore: 8, bonusScore: 8, total: 16 },
    { userName: 'Joe', mainScore: 8, bonusScore: 8, total: 16 },
    { userName: 'Rich', mainScore: 6, bonusScore: 9, total: 15 },
  ];

  it('gives tied totals the same place and lights your row', () => {
    render(<QueuedleLeaderboard {...lbProps} tab="today" scores={scores} me="Joe" />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.firstChild?.textContent)).toEqual(['1', '1', '3']);
    expect(rows[1].className).toMatch(/boardRowMe/);
  });

  it('keeps your row visible when you are outside the top ten', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ userName: `P${i}`, mainScore: 0, bonusScore: 0, total: 20 - i }));
    render(<QueuedleLeaderboard {...lbProps} tab="today" scores={many} me="P11" />);
    expect(screen.getByText('P11')).toBeInTheDocument();
    expect(screen.queryByText('P10')).not.toBeInTheDocument();
  });

  it('opens a profile from a name', () => {
    const onOpenProfile = vi.fn();
    render(<QueuedleLeaderboard {...lbProps} tab="today" scores={scores} me={null} onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /Rich/ }));
    expect(onOpenProfile).toHaveBeenCalledWith('Rich');
  });

  it('labels a past game by its date', () => {
    render(<QueuedleLeaderboard {...lbProps} tab="today" gameId="2026-10-20" scores={scores} me={null} />);
    expect(screen.getByRole('heading', { name: 'Leaderboard for 20 Oct' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20 Oct', pressed: true })).toBeInTheDocument();
  });

  it('says when nobody has played', () => {
    render(<QueuedleLeaderboard {...lbProps} tab="today" scores={[]} me={null} />);
    expect(screen.getByText('Nobody has played yet.')).toBeInTheDocument();
  });
});

describe('QueuedleBonusResults summary', () => {
  it('counts how many top queuers you knew and names the right one', () => {
    const item = (id: string, topQueuer: string): GameItem => ({
      id, name: `Song ${id}`, category: 'track', subtitle: '', count: 3, topQueuer, queuerCandidates: [],
    });
    render(<QueuedleBonusResults winningItems={[item('1', 'alice'), item('2', 'bob')]} bonusGuesses={['alice', 'zed']} onContinue={() => {}} />);
    expect(screen.getByText(/You knew 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText('It was bob')).toBeInTheDocument();
  });
});
