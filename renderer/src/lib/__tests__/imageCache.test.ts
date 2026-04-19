import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset the module between tests to get a fresh cache, queue, and active counter.
let fetchImage: (url: string) => Promise<string | null>;
let getCached: (url: string) => string | null;

const mockFetchGlobal = vi.fn();
const mockCreateObjectURL = vi.fn(() => 'blob:mock');
const mockRevokeObjectURL = vi.fn();

beforeEach(async () => {
  mockFetchGlobal.mockReset();
  mockCreateObjectURL.mockReset().mockReturnValue('blob:mock');
  mockRevokeObjectURL.mockReset();

  vi.stubGlobal('fetch', mockFetchGlobal);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(mockCreateObjectURL);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);

  vi.mocked(window.sonos.fetchImage).mockReset();
  vi.mocked(window.sonos.fetchImage).mockImplementation(() => new Promise<never>(() => {}));

  vi.resetModules();
  const mod = await import('../imageCache');
  fetchImage = mod.fetchImage;
  getCached = mod.getCached;
});

function okResponse(content = 'img') {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob([content])),
  } as unknown as Response;
}

// ─── getCached ────────────────────────────────────────────────────────────────

describe('getCached', () => {
  it('returns null for an unknown URL', () => {
    expect(getCached('https://example.com/a.jpg')).toBeNull();
  });

  it('returns the objectURL after a successful fetch', async () => {
    mockFetchGlobal.mockResolvedValueOnce(okResponse());
    await fetchImage('https://example.com/a.jpg');
    expect(getCached('https://example.com/a.jpg')).toBe('blob:mock');
  });

  it('refreshes LRU position (accessed entry moves to end)', async () => {
    // Fetch two URLs: a then b
    mockFetchGlobal.mockResolvedValue(okResponse());
    await fetchImage('https://example.com/a.jpg');
    await fetchImage('https://example.com/b.jpg');

    // Re-access a (should promote it to end of LRU)
    getCached('https://example.com/a.jpg');

    // Both entries are still in cache
    expect(getCached('https://example.com/a.jpg')).toBe('blob:mock');
    expect(getCached('https://example.com/b.jpg')).toBe('blob:mock');
  });
});

// ─── fetchImage — happy path ──────────────────────────────────────────────────

describe('fetchImage', () => {
  it('fetches the URL and resolves an objectURL', async () => {
    mockFetchGlobal.mockResolvedValueOnce(okResponse());
    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBe('blob:mock');
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
  });

  it('returns cached result immediately without re-fetching', async () => {
    mockFetchGlobal.mockResolvedValue(okResponse());
    await fetchImage('https://example.com/a.jpg');
    mockFetchGlobal.mockClear();

    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBe('blob:mock');
    expect(mockFetchGlobal).not.toHaveBeenCalled();
  });

  // ─── deduplication ──────────────────────────────────────────────────────────

  it('deduplicates concurrent fetches for the same URL', async () => {
    let resolve!: () => void;
    const pending = new Promise<Response>(res => {
      resolve = () => res(okResponse());
    });
    mockFetchGlobal.mockReturnValueOnce(pending);

    const p1 = fetchImage('https://example.com/a.jpg');
    const p2 = fetchImage('https://example.com/a.jpg');

    expect(p1).toBe(p2); // same promise reference

    resolve();
    await Promise.all([p1, p2]);

    expect(mockFetchGlobal).toHaveBeenCalledTimes(1);
  });

  // ─── non-ok response ─────────────────────────────────────────────────────────

  it('resolves null when fetch returns a non-ok response', async () => {
    mockFetchGlobal.mockResolvedValueOnce({ ok: false } as Response);
    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBeNull();
  });

  // ─── CORS fallback ───────────────────────────────────────────────────────────

  it('falls back to the proxy when direct fetch throws (CORS)', async () => {
    mockFetchGlobal.mockRejectedValueOnce(new TypeError('CORS'));
    vi.mocked(window.sonos.fetchImage).mockResolvedValueOnce({
      data: btoa('image bytes'),
      mimeType: 'image/jpeg',
    });

    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBe('blob:mock');
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
  });

  it('resolves null when both direct fetch and proxy fail', async () => {
    mockFetchGlobal.mockRejectedValueOnce(new TypeError('CORS'));
    vi.mocked(window.sonos.fetchImage).mockRejectedValueOnce(new Error('proxy down'));

    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBeNull();
  });

  it('resolves null when proxy returns an error response', async () => {
    mockFetchGlobal.mockRejectedValueOnce(new TypeError('CORS'));
    vi.mocked(window.sonos.fetchImage).mockResolvedValueOnce({ error: 'not found' });

    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBeNull();
  });

  // ─── in-flight cleanup ───────────────────────────────────────────────────────

  it('allows re-fetching the same URL after a failed attempt', async () => {
    // First attempt fails
    mockFetchGlobal.mockRejectedValueOnce(new Error('CORS'));
    vi.mocked(window.sonos.fetchImage).mockRejectedValueOnce(new Error('proxy fail'));
    await fetchImage('https://example.com/a.jpg');

    // Second attempt should trigger a new fetch
    mockFetchGlobal.mockResolvedValueOnce(okResponse());
    const result = await fetchImage('https://example.com/a.jpg');
    expect(result).toBe('blob:mock');
  });
});

// ─── LRU eviction ────────────────────────────────────────────────────────────

describe('LRU eviction', () => {
  it('evicts the oldest entry (LRU) when the cache exceeds 200 entries', async () => {
    // Fill the cache to exactly 200 entries
    for (let i = 0; i < 200; i++) {
      mockFetchGlobal.mockResolvedValueOnce(okResponse(`img-${i}`));
      mockCreateObjectURL.mockReturnValueOnce(`blob:${i}`);
      await fetchImage(`https://example.com/${i}.jpg`);
    }

    mockRevokeObjectURL.mockClear();

    // Adding the 201st entry should evict the first (blob:0)
    mockFetchGlobal.mockResolvedValueOnce(okResponse('new'));
    mockCreateObjectURL.mockReturnValueOnce('blob:new');
    await fetchImage('https://example.com/new.jpg');

    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:0');
  });

  it('does not evict when cache has fewer than 200 entries', async () => {
    mockFetchGlobal.mockResolvedValueOnce(okResponse());
    await fetchImage('https://example.com/only.jpg');
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it('evicts the LRU (not recently accessed) entry when cache is full', async () => {
    // Fill cache to 200
    for (let i = 0; i < 200; i++) {
      mockFetchGlobal.mockResolvedValueOnce(okResponse());
      mockCreateObjectURL.mockReturnValueOnce(`blob:${i}`);
      await fetchImage(`https://example.com/${i}.jpg`);
    }

    // Re-access the first URL (promotes it from LRU position)
    getCached('https://example.com/0.jpg');
    mockRevokeObjectURL.mockClear();

    // Adding 201st entry — should evict blob:1 (now oldest), not blob:0
    mockFetchGlobal.mockResolvedValueOnce(okResponse());
    mockCreateObjectURL.mockReturnValueOnce('blob:new');
    await fetchImage('https://example.com/new.jpg');

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(mockRevokeObjectURL).not.toHaveBeenCalledWith('blob:0');
  });
});
