import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { authenticate, entraCheckFromEnv, type EntraTokenCheck } from '../shared/auth';
import { createSonosSession, SonosLoginError } from '../shared/sonosSession';

// GET /api/sonos-session[?refresh=1]
//
// Hands a signed-in colleague's app the shared Sonos web session token: the server logs in to
// play.sonos.com with a service account (SONOS_USERNAME / SONOS_PASSWORD) and caches the session.
// refresh=1 checks the cached session against Sonos and logs in again if it was rejected.
// Always needs a valid Entra token, whatever AUTH_ENFORCE says: this is a credential.
//
// Returns:
//   200 { token }                          Cache-Control: no-store
//   401                                    no or invalid token
//   502 { error: 'sonos-login-failed' }    Sonos would not give the service account a session

export type SonosSession = ReturnType<typeof createSonosSession>;

const NO_STORE = { 'Cache-Control': 'no-store' };

export function createSonosSessionHandler(resolveSession: () => SonosSession, check?: EntraTokenCheck) {
  return async function sonosSessionHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const auth = await authenticate(request, context, check ?? entraCheckFromEnv(), true);
    if ('response' in auth) return auth.response;
    if (!auth.oid) return { status: 401, jsonBody: { error: 'sign-in required' } };

    const refresh = request.query.get('refresh') === '1';
    try {
      const token = await resolveSession().get({ refresh });
      return { status: 200, jsonBody: { token }, headers: NO_STORE };
    } catch (err) {
      if (err instanceof SonosLoginError) {
        context.error(`[sonos-session] login failed: ${err.message}`);
        return { status: 502, jsonBody: { error: 'sonos-login-failed' }, headers: NO_STORE };
      }
      throw err;
    }
  };
}

let session: SonosSession | undefined;

/** One session per host, so the Sonos login is reused across requests. */
export function getSonosSession(): SonosSession {
  session ??= createSonosSession({
    // Resolved per call: not captured at start-up.
    fetch: (...args) => fetch(...args),
    username: process.env['SONOS_USERNAME'] ?? '',
    password: process.env['SONOS_PASSWORD'] ?? '',
  });
  return session;
}

app.http('sonos-session', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'sonos-session',
  handler: createSonosSessionHandler(getSonosSession),
});
