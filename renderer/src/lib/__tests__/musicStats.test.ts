import { describe, it, expect, vi } from 'vitest';
import {
  airtimeRows,
  avgLengthRows,
  busiestSlot,
  defaultTastePerson,
  explicitRows,
  formatDuration,
  formatHours,
  isMusicStatsError,
  lengthCoverage,
  monthLabel,
  musicStatsQueryOptions,
  rampIndex,
  requeuedRows,
  slotLabel,
  varietyRows,
} from '../musicStats';

const person = (userId: string, over: Partial<MusicPersonStats> = {}): MusicPersonStats => ({
  userId,
  queues: 100,
  trackQueues: 100,
  uniqueArtists: 10,
  variety: 0.1,
  topArtists: [],
  mostRequeued: null,
  airtimeMs: 0,
  timedQueues: 0,
  avgLengthMs: null,
  explicitPct: null,
  tasteByMonth: [],
  ...over,
});

describe('formatting', () => {
  it('formats hours, falling back to minutes under an hour', () => {
    expect(formatHours(41.2 * 3_600_000)).toBe('41.2 h');
    expect(formatHours(25 * 60_000)).toBe('25 min');
    expect(formatHours(1234 * 3_600_000)).toBe('1,234 h');
  });

  it('formats durations as m:ss or h:mm:ss', () => {
    expect(formatDuration(245_000)).toBe('4:05');
    expect(formatDuration(59_600)).toBe('1:00');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('labels months and hour slots', () => {
    expect(monthLabel('2026-06')).toBe('Jun 2026');
    expect(slotLabel(0, 9)).toBe('Mon 9:00–10:00');
    expect(slotLabel(6, 23)).toBe('Sun 23:00–0:00');
  });

  it('describes length coverage', () => {
    expect(lengthCoverage(0, 7503)).toBeNull();
    expect(lengthCoverage(6912, 7503)).toBe('Lengths known for 6,912 of 7,503 songs');
    expect(lengthCoverage(7503, 7503)).toBe('Lengths known for all 7,503 songs');
  });
});

describe('heatmap helpers', () => {
  it('maps counts onto the ramp, with zero as empty', () => {
    expect(rampIndex(0, 100, 9)).toBe(-1);
    expect(rampIndex(1, 100, 9)).toBe(0);
    expect(rampIndex(100, 100, 9)).toBe(8);
    expect(rampIndex(50, 100, 9)).toBe(4);
  });

  it('finds the busiest slot', () => {
    const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    expect(busiestSlot(grid)).toBeNull();
    grid[2][14] = 9;
    grid[0][9] = 3;
    expect(busiestSlot(grid)).toEqual({ weekday: 2, hour: 14, count: 9 });
  });
});

describe('per-person rows', () => {
  const people = [
    person('A', { airtimeMs: 10, avgLengthMs: 200_000, explicitPct: 5, variety: 0.2, trackQueues: 50 }),
    person('B', { airtimeMs: 30, avgLengthMs: 400_000, explicitPct: 40, variety: 0.5, trackQueues: 19 }),
    person('C', { variety: 0.3, trackQueues: 20, mostRequeued: { trackName: 't', artist: 'a', imageUrl: null, count: 4 } }),
  ];

  it('sorts airtime desc and drops people with none known', () => {
    expect(airtimeRows(people).map((p) => p.userId)).toEqual(['B', 'A']);
  });

  it('sorts average length and explicit desc, skipping unknowns', () => {
    expect(avgLengthRows(people).map((p) => p.userId)).toEqual(['B', 'A']);
    expect(explicitRows(people).map((p) => p.userId)).toEqual(['B', 'A']);
  });

  it('only ranks variety for people with 20+ track queues', () => {
    expect(varietyRows(people).map((p) => p.userId)).toEqual(['C', 'A']);
  });

  it('skips people with no re-queued song', () => {
    expect(requeuedRows(people).map((p) => p.userId)).toEqual(['C']);
  });

  it('defaults the taste picker to you, else the first person', () => {
    expect(defaultTastePerson(people, 'B')).toBe('B');
    expect(defaultTastePerson(people, 'Nobody')).toBe('A');
    expect(defaultTastePerson(people, null)).toBe('A');
    expect(defaultTastePerson([], 'B')).toBeNull();
  });
});

describe('musicStatsQueryOptions', () => {
  it('recognises an error reply', () => {
    expect(isMusicStatsError({ error: 'nope' })).toBe(true);
    expect(isMusicStatsError(undefined)).toBe(false);
  });

  it('throws on an error reply so the page shows its error state', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValueOnce({ error: 'boom' });
    await expect(musicStatsQueryOptions().queryFn()).rejects.toThrow('boom');
  });
});
