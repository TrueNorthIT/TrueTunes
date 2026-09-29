import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as telemetry from '../telemetry';

const CS = 'InstrumentationKey=abc-123;IngestionEndpoint=https://uks.in.applicationinsights.azure.com/;LiveEndpoint=https://x';

let fetchMock: ReturnType<typeof vi.fn>;
const opts = () => ({ fetchImpl: fetchMock as unknown as typeof fetch });
const sentBatches = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as Array<Record<string, any>>);

beforeEach(() => {
  vi.useFakeTimers();
  telemetry._resetForTests();
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
});

afterEach(() => {
  telemetry._resetForTests();
  vi.useRealTimers();
});

describe('telemetry', () => {
  it('is a complete no-op without a connection string', async () => {
    telemetry.init('', '1.0.0', opts());
    telemetry.event('e');
    telemetry.exception(new Error('x'));
    await telemetry.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a no-op for a connection string without an instrumentation key', async () => {
    telemetry.init('IngestionEndpoint=https://x', '1.0.0', opts());
    telemetry.event('e');
    await telemetry.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts an event envelope to the ingestion endpoint on the 5s timer', async () => {
    telemetry.init(CS, '1.2.3', opts());
    telemetry.setContext({ userId: 'Rich', groupId: undefined });
    telemetry.event('track_played', { n: 3, ok: true });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://uks.in.applicationinsights.azure.com/v2/track');
    expect(init.method).toBe('POST');
    const [env] = sentBatches()[0];
    expect(env.name).toBe('Microsoft.ApplicationInsights.Event');
    expect(env.iKey).toBe('abc-123');
    expect(env.data.baseType).toBe('EventData');
    expect(env.data.baseData.name).toBe('track_played');
    expect(env.data.baseData.properties).toMatchObject({
      appVersion: '1.2.3',
      platform: 'android',
      userId: 'Rich',
      n: '3',
      ok: 'true',
    });
    expect(env.data.baseData.properties.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(env.data.baseData.properties).not.toHaveProperty('groupId');
  });

  it('honours a platform override and wraps non-Error exceptions', async () => {
    telemetry.init(CS, '1', { ...opts(), platform: 'test' });
    telemetry.exception('plain string', { phase: 'boot' });
    telemetry.exception(new TypeError('bad'));
    await telemetry.flush();
    const [a, b] = sentBatches()[0];
    expect(a.data.baseType).toBe('ExceptionData');
    expect(a.name).toBe('Microsoft.ApplicationInsights.Exception');
    expect(a.data.baseData.exceptions[0]).toMatchObject({ typeName: 'Error', message: 'plain string' });
    expect(a.data.baseData.properties).toMatchObject({ platform: 'test', phase: 'boot' });
    expect(b.data.baseData.exceptions[0]).toMatchObject({ typeName: 'TypeError', message: 'bad' });
  });

  it('flushes immediately at 20 queued items', async () => {
    telemetry.init(CS, '1', opts());
    for (let i = 0; i < 19; i++) telemetry.event(`e${i}`);
    expect(fetchMock).not.toHaveBeenCalled();
    telemetry.event('e19');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBatches()[0]).toHaveLength(20);
    // timer was cancelled: no empty/duplicate send later
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flush() sends pending items and resolves; nothing pending means no request', async () => {
    telemetry.init(CS, '1', opts());
    await telemetry.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    telemetry.event('e');
    await telemetry.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when fetch rejects, and drops the batch', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    telemetry.init(CS, '1', opts());
    telemetry.event('e');
    await expect(telemetry.flush()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flush resolves after 3s if the request hangs', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    telemetry.init(CS, '1', opts());
    telemetry.event('e');
    let done = false;
    void telemetry.flush().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
