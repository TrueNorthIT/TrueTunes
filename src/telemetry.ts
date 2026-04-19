/**
 * Thin wrapper around the Application Insights Node.js SDK.
 * All exports are no-ops when APPINSIGHTS_CONNECTION_STRING is not set,
 * so telemetry is completely optional — the app works identically without it.
 */

import { randomUUID } from 'crypto';

type StringProps = Record<string, string>;
type AnyProps   = Record<string, string | number | boolean>;

const SESSION_ID = randomUUID();

// Lazily typed so we avoid importing the SDK at the top level when it may
// not be installed in all environments. The real type is TelemetryClient.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;
let _ctx: StringProps = {};

/** Call once at app startup. Silently no-ops if connectionString is empty. */
export function init(connectionString: string, appVersion: string): void {
  if (!connectionString) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appInsights = require('applicationinsights') as typeof import('applicationinsights');
    appInsights
      .setup(connectionString)
      .setAutoCollectRequests(false)      // no HTTP server in Electron
      .setAutoCollectPerformance(false, false)
      .setAutoCollectExceptions(true)     // catch process-level uncaught errors
      .setAutoCollectDependencies(false)
      .setAutoCollectConsole(false)
      .setUseDiskRetryCaching(true)       // buffer events if network is down
      .start();

    _client = appInsights.defaultClient;
    _client.commonProperties = {
      appVersion,
      sessionId: SESSION_ID,
      platform:  process.platform,
    };

    console.log('[telemetry] Initialized, session:', SESSION_ID);
  } catch (err) {
    console.warn('[telemetry] Failed to initialize:', err);
  }
}

/**
 * Merge additional key/value pairs into every subsequent event.
 * Use this to attach groupId, userId etc. as they become known.
 */
export function setContext(ctx: Partial<StringProps>): void {
  const defined = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined)) as StringProps;
  _ctx = { ..._ctx, ...defined };
}

/** Track a named event with optional properties. */
export function event(name: string, props?: AnyProps): void {
  if (!_client) return;
  const strProps: StringProps = {};
  for (const [k, v] of Object.entries(props ?? {})) strProps[k] = String(v);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    _client.trackEvent({ name, properties: { ..._ctx, ...strProps } });
  } catch { /* ignore — telemetry must never crash the app */ }
}

/** Track an exception. Pass any value; non-Error values are wrapped automatically. */
export function exception(err: unknown, props?: StringProps): void {
  if (!_client) return;
  const error = err instanceof Error ? err : new Error(String(err));
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    _client.trackException({ exception: error, properties: { ..._ctx, ...props } });
  } catch { /* ignore */ }
}

/**
 * Flush buffered telemetry before quitting.
 * Resolves after the flush completes or after a 3s timeout — whichever comes first.
 */
export function flush(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!_client) { resolve(); return; }
    const timer = setTimeout(resolve, 3000);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      _client.flush({
        callback: () => { clearTimeout(timer); resolve(); },
      });
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}
