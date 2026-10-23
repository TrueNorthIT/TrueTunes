import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportTrackMeta, resetTrackMetaReporter } from '../trackMetaReporter';

const send = () => vi.mocked(window.sonos.reportTrackMeta);

beforeEach(() => {
  vi.useFakeTimers();
  resetTrackMetaReporter();
  send().mockReset();
  send().mockResolvedValue({ saved: 1 });
});
afterEach(() => vi.useRealTimers());

describe('trackMetaReporter', () => {
  it('batches reports and sends each song once', async () => {
    reportTrackMeta({ uri: 'a', durationMs: 200_000, explicit: false });
    reportTrackMeta({ uri: 'b', durationMs: 300_000 });
    reportTrackMeta({ uri: 'a', durationMs: 200_000, explicit: false });
    expect(send()).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send()).toHaveBeenCalledTimes(1);
    expect(send()).toHaveBeenCalledWith([
      { uri: 'a', durationMs: 200_000, explicit: false },
      { uri: 'b', durationMs: 300_000, explicit: undefined },
    ]);
    reportTrackMeta({ uri: 'a', durationMs: 200_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send()).toHaveBeenCalledTimes(1);
  });

  it('skips songs with nothing to report', async () => {
    reportTrackMeta({ uri: 'a' });
    reportTrackMeta({ uri: null, durationMs: 1000 });
    reportTrackMeta({ uri: 'b', durationMs: 0 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send()).not.toHaveBeenCalled();
  });

  it('tries again later when sending fails', async () => {
    send().mockResolvedValueOnce({ error: 'offline' });
    reportTrackMeta({ uri: 'a', durationMs: 200_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    reportTrackMeta({ uri: 'a', durationMs: 200_000 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(send()).toHaveBeenCalledTimes(2);
  });
});
