import { describe, expect, it, vi } from 'vitest';
import { createOfficePresence } from '../officePresence';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(opts: { auth?: boolean; token?: string | null; fetchImpl?: ReturnType<typeof vi.fn> } = {}) {
  const fetchImpl = opts.fetchImpl ?? vi.fn();
  const svc = createOfficePresence({
    baseUrl: 'https://fn.test',
    hasAuth: () => opts.auth ?? true,
    getGraphToken: () => Promise.resolve(opts.token === undefined ? 'tok' : opts.token),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { svc, fetchImpl };
}

describe('fetchOfficePresence', () => {
  it('reports not signed in', async () => {
    const { svc, fetchImpl } = setup({ auth: false });
    expect(await svc.fetchOfficePresence()).toEqual({ inOffice: [], basis: 'none', detail: [], error: 'not signed in' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports missing consent', async () => {
    const { svc } = setup({ token: null });
    expect(await svc.fetchOfficePresence()).toEqual({ inOffice: [], basis: 'none', detail: [], error: 'no presence consent' });
  });

  it('returns none when no users have an OID', async () => {
    const { svc, fetchImpl } = setup();
    fetchImpl.mockResolvedValueOnce(json([{ userId: 'a', entraOid: null }, { userId: 'b' }]));
    expect(await svc.fetchOfficePresence()).toEqual({ inOffice: [], basis: 'none', detail: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('resolves the roster from Graph presences', async () => {
    const { svc, fetchImpl } = setup();
    fetchImpl
      .mockResolvedValueOnce(json([{ userId: 'Alice', entraOid: 'o1' }, { userId: 'Bob', entraOid: 'o2' }]))
      .mockResolvedValueOnce(
        json({
          value: [
            { id: 'o1', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
            { id: 'o2', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'manual' } },
          ],
        }),
      );
    const r = (await svc.fetchOfficePresence()) as { inOffice: string[]; basis: string; observed: number };
    expect(r.inOffice).toEqual(['Alice']);
    expect(r.basis).toBe('sensed');
    expect(r.observed).toBe(1);

    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://graph.microsoft.com/v1.0/communications/getPresencesByUserId');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['o1', 'o2'] });
  });

  it('wraps thrown errors', async () => {
    const { svc, fetchImpl } = setup();
    fetchImpl.mockRejectedValueOnce(new Error('down'));
    expect(await svc.fetchOfficePresence()).toEqual({ inOffice: [], basis: 'none', detail: [], error: 'Error: down' });

    fetchImpl
      .mockResolvedValueOnce(json([{ userId: 'A', entraOid: 'o1' }]))
      .mockResolvedValueOnce(new Response('denied', { status: 403 }));
    const r = (await svc.fetchOfficePresence()) as { error: string };
    expect(r.error).toContain('Graph presence 403: denied');
  });
});
