import { describe, it, expect } from 'vitest';
import {
  buildKeys,
  djBreakLabel,
  insertBeforeIndex,
  isPlayingRow,
  planSingleReorder,
  removeIndices,
  resolveAttribution,
  selectionLabel,
  toggleSelected,
  toggleSelection,
  trackNumberForIndex,
  findPlayingIndex,
  playingPosition,
  scrollOffsetForPlaying,
  shouldAutoFollow,
  ROW_HEIGHT,
} from '../../../ui/queue/queueLogic';
import { attributionContentKey } from '../../hooks/useAttribution';

const track = (id: string) => ({ index: 0, track: { id } as never });

describe('queueLogic', () => {
  it('toggleSelection exits select mode when the last track is deselected', () => {
    expect(toggleSelection(new Set([2]), 2)).toEqual({ selected: new Set(), selectMode: false });
    expect(toggleSelection(new Set([2]), 3)).toEqual({ selected: new Set([2, 3]), selectMode: true });
    expect(toggleSelection(new Set([2, 3]), 2)).toEqual({ selected: new Set([3]), selectMode: true });
  });
  it('maps drop position to insert-before', () => {
    expect(insertBeforeIndex(1, 3)).toBe(4);
    expect(insertBeforeIndex(3, 1)).toBe(1);
  });
  it('planSingleReorder matches final positions', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    expect(planSingleReorder(items, 1, 3).next).toEqual(['A', 'C', 'D', 'B', 'E']);
    expect(planSingleReorder(items, 3, 1).next).toEqual(['A', 'D', 'B', 'C', 'E']);
    expect(planSingleReorder(items, 0, 4)).toMatchObject({ toIndex: 5, fromIndices: [0], queueLength: 5 });
  });
  it('playing row uses 1-based queueItemId, else object id', () => {
    expect(isPlayingRow(0, 'x', '1', null)).toBe(true);
    expect(isPlayingRow(1, 'x', '1', 'x')).toBe(false);
    expect(isPlayingRow(1, 'x', null, 'x')).toBe(true);
    expect(isPlayingRow(1, 'x', null, null)).toBe(false);
  });
  it('skip uses 1-based track number', () => expect(trackNumberForIndex(0)).toBe(1));
  it('toggles selection immutably', () => {
    const s = new Set([1]);
    expect([...toggleSelected(s, 2)]).toEqual([1, 2]);
    expect([...toggleSelected(s, 1)]).toEqual([]);
    expect(s.size).toBe(1);
  });
  it('resolves attribution by id then content key', () => {
    const e = { user: 'Ann' };
    const ck = attributionContentKey('Song', 'Band')!;
    expect(resolveAttribution({ a: e }, { id: 'a', title: 'x', artist: 'y' })).toBe(e);
    expect(resolveAttribution({ [ck]: e }, { id: 'zz', title: 'Song', artist: 'Band' })).toBe(e);
    expect(resolveAttribution({}, { id: 'zz', title: 'Song', artist: 'Band' })).toBeUndefined();
  });
  it('builds unique stable keys for duplicates', () => {
    expect(buildKeys([track('a'), track('b'), track('a')])).toEqual(['a#1', 'b#1', 'a#2']);
  });
  it('removes indices and labels', () => {
    expect(removeIndices(['a', 'b', 'c'], new Set([0, 2]))).toEqual(['b']);
    expect(selectionLabel(1)).toBe('1 track selected');
    expect(selectionLabel(2)).toBe('2 tracks selected');
  });
  it('labels DJ toggle', () => {
    expect(djBreakLabel(true)).toBe('DJ takes over');
    expect(djBreakLabel(false)).toBe('DJ paused');
  });
});

describe('scroll to now playing', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ track: { id } }));

  it('finds the playing row by 1-based queueItemId, else by objectId, else -1', () => {
    expect(findPlayingIndex(items, '3', null)).toBe(2);
    expect(findPlayingIndex(items, null, 'b')).toBe(1);
    expect(findPlayingIndex(items, null, 'zzz')).toBe(-1);
    expect(findPlayingIndex(items, '9', null)).toBe(-1);
    expect(findPlayingIndex([], '1', null)).toBe(-1);
  });

  it('classifies the row against the viewport', () => {
    const h = 5 * ROW_HEIGHT; // five rows visible
    expect(playingPosition(-1, 0, h)).toBe('none');
    expect(playingPosition(2, 0, 0)).toBe('none'); // not measured yet
    expect(playingPosition(2, 0, h)).toBe('visible');
    expect(playingPosition(4, 0, h)).toBe('visible'); // last visible row
    expect(playingPosition(5, 0, h)).toBe('below');
    expect(playingPosition(3, 10 * ROW_HEIGHT, h)).toBe('above');
    expect(playingPosition(10, 10 * ROW_HEIGHT, h)).toBe('visible'); // exactly at the top edge
    expect(playingPosition(9, 10 * ROW_HEIGHT, h)).toBe('above');
  });

  it('a partly visible row still counts as visible', () => {
    expect(playingPosition(1, ROW_HEIGHT / 2, 3 * ROW_HEIGHT)).toBe('visible');
  });

  it('scrolls so one row of context stays above the playing row, never negative', () => {
    expect(scrollOffsetForPlaying(10)).toBe(9 * ROW_HEIGHT);
    expect(scrollOffsetForPlaying(1)).toBe(0);
    expect(scrollOffsetForPlaying(0)).toBe(0);
    expect(scrollOffsetForPlaying(10, 0)).toBe(10 * ROW_HEIGHT);
  });

  it('auto-follows only when following and the playing row really changed', () => {
    expect(shouldAutoFollow(true, 3, 4)).toBe(true);
    expect(shouldAutoFollow(false, 3, 4)).toBe(false); // user scrolled away
    expect(shouldAutoFollow(true, 4, 4)).toBe(false); // unchanged
    expect(shouldAutoFollow(true, 4, -1)).toBe(false); // nothing playing
  });
});
