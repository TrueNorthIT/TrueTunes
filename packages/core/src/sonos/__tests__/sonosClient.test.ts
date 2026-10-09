import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_ACCOUNT_ID, PLATFORM_SERVICE_ID } from '../operations';
import { buildUrl, createSonosClient, parseIntegrationsCreds, timezoneOffset } from '../sonosClient';
import type { SonosConfig } from '../types';

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

function makeClient(
  responses: Array<Response | Error>,
  overrides: Partial<Parameters<typeof createSonosClient>[0]> = {}
) {
  const config: SonosConfig = { householdId: 'HH', serviceId: 'SVC', accountId: 'ACC', groupId: 'G:1', queueId: 'Q' };
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected extra fetch');
    if (next instanceof Error) throw next;
    return next;
  });
  const onUnauthorized = vi.fn();
  const onEvent = vi.fn();
  const client = createSonosClient({
    config,
    getSessionToken: () => 'TOKEN',
    onUnauthorized,
    onEvent,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
    timezone: () => '+01:00',
    ...overrides,
  });
  return { client, config, fetchImpl, onUnauthorized, onEvent };
}

describe('buildUrl', () => {
  const config: SonosConfig = {
    householdId: 'HH',
    serviceId: 'SVC',
    accountId: 'ACC',
    groupId: 'RINCON_1:23',
    queueId: 'RINCON_1',
  };

  it('fills config and platform defaults and URL-encodes values', () => {
    const url = buildUrl(
      '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
      config
    );
    expect(url).toBe(
      `https://play.sonos.com/api/content/v1/groups/RINCON_1%3A23/services/${PLATFORM_SERVICE_ID}/accounts/${PLATFORM_ACCOUNT_ID}/queues/RINCON_1/resources`
    );
  });

  it('lets explicit pathParams override config', () => {
    expect(buildUrl('/api/playback/v1/groups/:groupId', config, { groupId: 'OTHER' })).toBe(
      'https://play.sonos.com/api/playback/v1/groups/OTHER'
    );
  });

  it('drops undefined query values and encodes the rest', () => {
    expect(buildUrl('/x', config, {}, { a: 'b c', skip: undefined, n: '1' })).toBe(
      'https://play.sonos.com/x?a=b%20c&n=1'
    );
  });

  it('throws on a missing path param', () => {
    expect(() => buildUrl('/a/:albumId', config)).toThrow('Missing path param: albumId');
  });
});

describe('timezoneOffset', () => {
  it('formats the local offset as +HH:MM / -HH:MM', () => {
    const fake = (offsetMinutes: number) => ({ getTimezoneOffset: () => offsetMinutes }) as Date;
    expect(timezoneOffset(fake(-60))).toBe('+01:00'); // UTC+1 reports -60
    expect(timezoneOffset(fake(0))).toBe('+00:00');
    expect(timezoneOffset(fake(300))).toBe('-05:00');
    expect(timezoneOffset(fake(-330))).toBe('+05:30');
  });
});

describe('parseIntegrationsCreds', () => {
  it('accepts hyphenated and camelCase keys, numbers as strings, and skips junk', () => {
    expect(
      parseIntegrationsCreds([
        { 'service-id': 72711, 'account-id': '13' },
        { serviceId: 'a', accountId: 'b' },
        { 'service-id': 'only' },
        null,
        'nope',
      ])
    ).toEqual([
      { serviceId: '72711', accountId: '13' },
      { serviceId: 'a', accountId: 'b' },
    ]);
  });

  it('wraps a single object', () => {
    expect(parseIntegrationsCreds({ serviceId: 's', accountId: 'a' })).toHaveLength(1);
  });
});

describe('sonosFetch', () => {
  it('returns an error without a session token, without calling fetch', async () => {
    const { client, fetchImpl } = makeClient([], { getSessionToken: () => null });
    expect(await client.fetch({ operationId: 'getGroups' })).toEqual({
      error: 'No session token — please log in first',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unknown operations', async () => {
    const { client } = makeClient([]);
    expect(await client.fetch({ operationId: 'nope' })).toEqual({ error: 'Unknown operation: nope' });
  });

  it('sends the cookie, spoofed UA and JSON body, and returns data with the etag', async () => {
    const { client, fetchImpl } = makeClient([json({ ok: 1 }, { headers: { etag: '"e1"' } })]);
    const res = await client.fetch({ operationId: 'addQueueResource', body: { a: 1 }, headers: { 'If-Match': '"x"' } });
    expect(res).toEqual({ data: { ok: 1 }, etag: '"e1"' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/queues/Q/resources');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    const h = init.headers as Record<string, string>;
    expect(h['Cookie']).toBe('__Secure-next-auth.session-token=TOKEN');
    expect(h['User-Agent']).toContain('Chrome/');
    expect(h['X-Sonos-Timezone']).toBe('+01:00');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['If-Match']).toBe('"x"');
  });

  it('returns data:null for an empty body', async () => {
    const { client } = makeClient([new Response('', { status: 200 })]);
    expect(await client.fetch({ operationId: 'getGroups' })).toEqual({ data: null });
  });

  it('reports a non-JSON success body', async () => {
    const { client } = makeClient([new Response('<html>', { status: 200 })]);
    const res = await client.fetch({ operationId: 'getGroups' });
    expect(res.error).toMatch(/^Response is not JSON \(200/);
  });

  it('retries GET on 5xx then succeeds, emitting api_retry', async () => {
    const { client, fetchImpl, onEvent } = makeClient([
      new Response('boom', { status: 503 }),
      new Response('boom', { status: 500 }),
      json({ fine: true }),
    ]);
    expect(await client.fetch({ operationId: 'getGroups' })).toEqual({ data: { fine: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith('api_retry', { operationId: 'getGroups', attempt: 1, statusCode: 503 });
    expect(onEvent).toHaveBeenCalledWith('api_retry', { operationId: 'getGroups', attempt: 2, statusCode: 500 });
  });

  it('retries GET on a network error', async () => {
    const { client, fetchImpl } = makeClient([new Error('socket hang up'), json({ ok: true })]);
    expect(await client.fetch({ operationId: 'getGroups' })).toEqual({ data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after two retries and returns the last error', async () => {
    const { client, fetchImpl } = makeClient([
      new Response('x', { status: 502 }),
      new Response('x', { status: 502 }),
      new Response('final', { status: 502, statusText: 'Bad Gateway' }),
    ]);
    const res = await client.fetch({ operationId: 'getGroups' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(res.error).toContain('502');
    expect(res.error).toContain('final');
  });

  it('returns a network error message once retries are exhausted', async () => {
    const { client } = makeClient([new Error('a'), new Error('b'), new Error('c')]);
    expect(await client.fetch({ operationId: 'getGroups' })).toEqual({ error: 'Fetch failed: c' });
  });

  it.each(['addQueueResource', 'deleteQueueResources', 'reorderQueueResources', 'play'])(
    'never retries non-idempotent %s',
    async (operationId) => {
      const { client, fetchImpl } = makeClient([new Response('down', { status: 503 })]);
      const res = await client.fetch({ operationId, body: {} });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(res.error).toContain('503');
    }
  );

  it('does not retry a 4xx', async () => {
    const { client, fetchImpl } = makeClient([new Response('nope', { status: 404, statusText: 'Not Found' })]);
    expect((await client.fetch({ operationId: 'getGroups' })).error).toBe('404 Not Found: nope');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('truncates long error bodies to 200 chars', async () => {
    const { client } = makeClient([new Response('z'.repeat(500), { status: 400, statusText: 'Bad Request' })]);
    const res = await client.fetch({ operationId: 'getGroups' });
    expect(res.error).toBe(`400 Bad Request: ${'z'.repeat(200)}`);
  });

  it('on 401 signals unauthorized and emits auth_expired', async () => {
    const { client, onUnauthorized, onEvent } = makeClient([new Response('', { status: 401 })]);
    const res = await client.fetch({ operationId: 'getGroups' });
    expect(res).toEqual({ error: '401 Unauthorized — re-authenticating' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('auth_expired', { operationId: 'getGroups' });
  });

  it('returns a missing-param error that is not about serviceId without discovering', async () => {
    const { client, fetchImpl } = makeClient([]);
    const res = await client.fetch({ operationId: 'browseAlbum', pathParams: {} });
    // serviceId is present in config, so the missing one is albumId.
    expect(res).toEqual({ error: 'Missing path param: albumId' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('service discovery', () => {
  it('discovers serviceId on demand, persists it, and retries the original call once', async () => {
    const onConfigChanged = vi.fn();
    const { client, config, fetchImpl } = makeClient(
      [
        json([
          { 'service-id': 'S9', 'account-id': 'A9' },
          { 'service-id': 'S2', 'account-id': 'A2' },
        ]),
        json({ album: true }),
      ],
      { onConfigChanged }
    );
    delete config.serviceId;
    delete config.accountId;

    const res = await client.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'ALB' } });
    expect(res).toEqual({ data: { album: true } });
    expect(config).toMatchObject({ serviceId: 'S9', accountId: 'A9' });
    expect(onConfigChanged).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('/integrations/registrations');
  });

  it('fails cleanly when discovery finds nothing', async () => {
    const { client, config } = makeClient([json([])]);
    delete config.serviceId;
    const res = await client.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'ALB' } });
    expect(res).toEqual({ error: 'Missing path param: serviceId' });
  });

  it('coalesces concurrent discovery onto one request', async () => {
    const { client, config, fetchImpl } = makeClient([json([{ 'service-id': 'S', 'account-id': 'A' }])]);
    delete config.serviceId;
    await Promise.all([client.discoverServiceCredentials(), client.discoverServiceCredentials()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(config.serviceId).toBe('S');
  });

  it('is a no-op when serviceId is already known', async () => {
    const { client, fetchImpl } = makeClient([]);
    await client.discoverServiceCredentials();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('household discovery race', () => {
  it('waits for the household, then retries the original call once', async () => {
    let resolveHousehold!: () => void;
    const awaitHousehold = vi.fn(() => new Promise<void>((r) => (resolveHousehold = r)));
    const { client, config, fetchImpl } = makeClient([json({ groups: [] })], { awaitHousehold });
    delete config.householdId;

    const pending = client.fetch({ operationId: 'searchHousehold', query: { query: 'x' } });
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();

    config.householdId = 'HH-LATE'; // the WS bootstrap finishes
    resolveHousehold();
    expect(await pending).toEqual({ data: { groups: [] } });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('/households/HH-LATE/search');
    expect(awaitHousehold).toHaveBeenCalledTimes(1);
  });

  it('reports the original error, without waiting again, if the household never arrives', async () => {
    const awaitHousehold = vi.fn(async () => {});
    const { client, config, fetchImpl } = makeClient([], { awaitHousehold });
    delete config.householdId;
    const res = await client.fetch({ operationId: 'searchHousehold' });
    expect(res).toEqual({ error: 'Missing path param: householdId' });
    expect(awaitHousehold).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails fast with no awaitHousehold hook', async () => {
    const { client, config } = makeClient([]);
    delete config.householdId;
    expect(await client.fetch({ operationId: 'searchHousehold' })).toEqual({
      error: 'Missing path param: householdId',
    });
  });
});
