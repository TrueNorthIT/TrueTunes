import { describe, it, expect, vi, beforeEach } from 'vitest';
import { officePresenceQueryOptions } from '../useOfficePresence';

beforeEach(() => {
  vi.mocked(window.sonos.fetchOfficePresence).mockReset();
});

describe('officePresenceQueryOptions', () => {
  it('passes through a sensed roster', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValueOnce({
      inOffice: ['Rich', 'Alex'],
      basis: 'sensed',
      observed: 2,
      detail: [
        { userId: 'Rich', availability: 'Available', workLocationType: 'office', source: 'automatic' },
        { userId: 'Sam', availability: 'Available', workLocationType: 'remote', source: 'manual' },
      ],
    });

    const result = await officePresenceQueryOptions().queryFn();
    expect(result.inOffice).toEqual(['Rich', 'Alex']);
    expect(result.basis).toBe('sensed');
  });

  /** No consent, or the scope isn't on the app registration yet. */
  it('degrades to an empty roster so the caller can fall back', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValueOnce({
      inOffice: [],
      basis: 'none',
      observed: 0,
      detail: [],
      error: 'no presence consent',
    });

    const result = await officePresenceQueryOptions().queryFn();
    expect(result.inOffice).toEqual([]);
    expect(result.basis).toBe('none');
    expect(result.error).toBe('no presence consent');
  });

  it('survives a malformed response without throwing', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValueOnce(
      {} as unknown as OfficePresence,
    );
    const result = await officePresenceQueryOptions().queryFn();
    expect(result.inOffice).toEqual([]);
    expect(result.detail).toEqual([]);
  });
});
