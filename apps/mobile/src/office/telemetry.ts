/**
 * Dependency-free Application Insights client for React Native.
 * Same public API as the desktop wrapper (TrueTunes/src/telemetry.ts), but posts
 * envelopes to `${IngestionEndpoint}/v2/track` directly since the Node SDK can't run in RN.
 * Complete no-op when the connection string is empty; nothing here ever throws.
 */

type StringProps = Record<string, string>;
type AnyProps = Record<string, string | number | boolean>;

export interface TelemetryInitOptions {
  fetchImpl?: typeof fetch;
  platform?: string;
}

const FLUSH_AT = 20;
const FLUSH_INTERVAL_MS = 5000;
const DEFAULT_ENDPOINT = 'https://dc.services.visualstudio.com';

/** v4-ish id without crypto (Math.random is fine for a session correlation id). */
function makeSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const SESSION_ID = makeSessionId();

interface Envelope {
  name: string;
  time: string;
  iKey: string;
  tags: Record<string, string>;
  data: { baseType: string; baseData: Record<string, unknown> };
}

let _key = '';
let _endpoint = '';
let _fetch: typeof fetch | null = null;
let _common: StringProps = {};
let _ctx: StringProps = {};
let _queue: Envelope[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;

function parseConnectionString(cs: string): { key: string; endpoint: string } | null {
  const parts: Record<string, string> = {};
  for (const seg of cs.split(';')) {
    const i = seg.indexOf('=');
    if (i > 0) parts[seg.slice(0, i).trim().toLowerCase()] = seg.slice(i + 1).trim();
  }
  const key = parts['instrumentationkey'];
  if (!key) return null;
  const endpoint = (parts['ingestionendpoint'] || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  return { key, endpoint };
}

/** Call once at app startup. Silently no-ops if connectionString is empty. */
export function init(connectionString: string, appVersion: string, opts: TelemetryInitOptions = {}): void {
  if (!connectionString) return;
  try {
    const parsed = parseConnectionString(connectionString);
    if (!parsed) return;
    _key = parsed.key;
    _endpoint = parsed.endpoint;
    _fetch = opts.fetchImpl ?? ((...a) => fetch(...a));
    _common = { appVersion, sessionId: SESSION_ID, platform: opts.platform ?? 'android' };
    _queue = [];
  } catch (err) {
    console.warn('[telemetry] Failed to initialize:', err);
  }
}

/** Merge additional key/value pairs into every subsequent event. */
export function setContext(ctx: Partial<StringProps>): void {
  const defined = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined)) as StringProps;
  _ctx = { ..._ctx, ...defined };
}

function enqueue(name: string, baseType: string, baseData: Record<string, unknown>): void {
  _queue.push({
    name: `Microsoft.ApplicationInsights.${name}`,
    time: new Date().toISOString(),
    iKey: _key,
    tags: { 'ai.session.id': SESSION_ID, 'ai.cloud.roleInstance': _common.platform },
    data: { baseType, baseData },
  });
  if (_queue.length >= FLUSH_AT) {
    void send();
  } else if (!_timer) {
    _timer = setTimeout(() => {
      _timer = null;
      void send();
    }, FLUSH_INTERVAL_MS);
  }
}

/** Track a named event with optional properties. */
export function event(name: string, props?: AnyProps): void {
  if (!_fetch) return;
  try {
    const strProps: StringProps = {};
    for (const [k, v] of Object.entries(props ?? {})) strProps[k] = String(v);
    enqueue('Event', 'EventData', {
      ver: 2,
      name,
      properties: { ..._common, ..._ctx, ...strProps },
    });
  } catch { /* ignore — telemetry must never crash the app */ }
}

/** Track an exception. Pass any value; non-Error values are wrapped automatically. */
export function exception(err: unknown, props?: StringProps): void {
  if (!_fetch) return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    enqueue('Exception', 'ExceptionData', {
      ver: 2,
      exceptions: [
        {
          typeName: error.name,
          message: error.message,
          hasFullStack: !!error.stack,
          stack: error.stack,
        },
      ],
      properties: { ..._common, ..._ctx, ...props },
    });
  } catch { /* ignore */ }
}

async function send(): Promise<void> {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  if (!_fetch || _queue.length === 0) return;
  const batch = _queue;
  _queue = [];
  try {
    await _fetch(`${_endpoint}/v2/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch { /* drop the batch — telemetry is best-effort */ }
}

/** Flush buffered telemetry. Resolves after the send completes or after 3s, whichever is first. */
export function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!_fetch) { resolve(); return; }
    const timer = setTimeout(resolve, 3000);
    send().then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); },
    );
  });
}

/** Test helper: clear all module state. */
export function _resetForTests(): void {
  if (_timer) clearTimeout(_timer);
  _timer = null;
  _key = '';
  _endpoint = '';
  _fetch = null;
  _common = {};
  _ctx = {};
  _queue = [];
}
