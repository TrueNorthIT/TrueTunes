import { describe, it, expect, beforeEach } from 'vitest';
import { clearProgress, loadProgress, pruneProgress, saveProgress } from '../queuedleProgress';
import type { QueuedleProgress } from '../queuedleProgress';

const GAME = '2026-10-23';
const KEY = `queuedle-progress:${GAME}`;

const midGame: QueuedleProgress = {
  phase: 'main',
  currentIdx: 2,
  pickedSide: 'right',
  mainGuesses: ['left', 'right', 'right'],
  bonusSelections: [null, null, null, null],
};

beforeEach(() => localStorage.clear());

describe('queuedle progress', () => {
  it('round-trips a game in progress', () => {
    saveProgress(GAME, midGame);
    expect(loadProgress(GAME, 4)).toEqual(midGame);
  });

  it('returns null when nothing is saved, or the entry is corrupt', () => {
    expect(loadProgress(GAME, 4)).toBeNull();
    localStorage.setItem(KEY, '{not json');
    expect(loadProgress(GAME, 4)).toBeNull();
  });

  it('pads or trims bonus selections to the question count', () => {
    saveProgress(GAME, { ...midGame, bonusSelections: ['alice'] });
    expect(loadProgress(GAME, 4)?.bonusSelections).toEqual(['alice', null, null, null]);
  });

  it('rejects progress that does not fit the game', () => {
    saveProgress(GAME, { ...midGame, currentIdx: 4 });
    expect(loadProgress(GAME, 4)).toBeNull(); // past the last question
    saveProgress(GAME, { ...midGame, mainGuesses: ['left', 'right'] });
    expect(loadProgress(GAME, 4)).toBeNull(); // current pick missing from the guesses
    saveProgress(GAME, { ...midGame, phase: 'bonus' });
    expect(loadProgress(GAME, 4)).toBeNull(); // bonus round before every question is answered
    saveProgress(GAME, midGame);
    expect(loadProgress(GAME, 0)).toBeNull();
  });

  it('clears one game', () => {
    saveProgress(GAME, midGame);
    clearProgress(GAME);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('prunes only progress older than a fortnight', () => {
    const now = Date.UTC(2026, 9, 23);
    saveProgress('2026-10-01', midGame, now - 15 * 86_400_000);
    saveProgress(GAME, midGame, now - 86_400_000);
    localStorage.setItem('queuedle-played:2026-10-01', '{}');
    pruneProgress(now);
    expect(localStorage.getItem('queuedle-progress:2026-10-01')).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem('queuedle-played:2026-10-01')).not.toBeNull();
  });
});
