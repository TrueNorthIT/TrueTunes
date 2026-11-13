import { describe, expect, it } from 'vitest';
import { isTabRoot, tabOf } from '../phoneTabs';

describe('tabOf', () => {
  it('names the tab of each tab root', () => {
    expect(tabOf('/')).toBe('/');
    expect(tabOf('/search')).toBe('/search');
    expect(tabOf('/queue')).toBe('/queue');
    expect(tabOf('/discover')).toBe('/discover');
    expect(tabOf('/more')).toBe('/more');
  });

  it('files the pages listed on More under More', () => {
    for (const path of [
      '/leaderboard',
      '/leaderboard/stats',
      '/queuedle',
      '/queuedle/stats',
      '/profile/Wren',
      '/playlist/pl-1',
    ])
      expect(tabOf(path)).toBe('/more');
  });

  it('gives no tab to a page reachable from anywhere', () => {
    for (const path of ['/album/al-1', '/artist/ar-1', '/container/x', '/lyrics', '/now-playing'])
      expect(tabOf(path)).toBeNull();
  });

  it('does not mistake a longer path for a tab', () => {
    expect(tabOf('/searching')).toBeNull();
    expect(tabOf('/queuedlex')).toBeNull();
  });
});

describe('isTabRoot', () => {
  it('is true only on the five tab pages', () => {
    expect(isTabRoot('/')).toBe(true);
    expect(isTabRoot('/more')).toBe(true);
    expect(isTabRoot('/leaderboard')).toBe(false);
    expect(isTabRoot('/album/al-1')).toBe(false);
  });
});
