// Test helpers for the Sonos gateway (server/src/shared/gatewayHttp.ts and gatewayRelay.ts).
//
//   createFakeUpstream()   a fake play.sonos.com that you hand in as the gateway's `fetch`. It wraps the
//                          login fake in sonosKit.testkit.ts (so a REAL createSonosSession can sit behind
//                          the gateway), answers /api/mfe with a single-use WebSocket ticket, and answers
//                          every other /api/... call with a response you choose. It records every call
//                          that is not part of the login flow, and behaves like fetch(): a redirect is
//                          followed unless the caller passed `redirect: 'manual'`.
//   createStubSession()    a { get } stub that records how it was asked, for tests that need no login.
//   stubVerify()           the `verify` dependency: which Authorization headers are signed-in callers.
//   bearerVerifier()       the same dependency built from the REAL Entra check (auth.ts), so tests can
//                          use properly signed, forged, expired and foreign tokens.
//   gatewayRequest()       a plain-object request, shaped the way the Node http entry point hands it over.
//   createSocketHarness()  in-memory ClientSocket / UpstreamSocket fakes that behave like `ws` sockets:
//                          sending before open or after close throws, closing with a reserved code
//                          (1005, 1006, 1015 ...) throws, and close() echoes a 'close' event.
//
// `fetch` contract the gateway must keep to: call it as fetch(url: string | URL, init) with init.method,
// init.headers (object, array or Headers) and init.body (string, Uint8Array or ArrayBuffer). A Request
// object as the first argument is not supported by the fake.
import { SonosLoginError } from './sonosSession';
import { verifyEntraToken, type EntraTokenCheck } from './auth';
import { SESSION_COOKIE, createFakeSonos, type FakeSonos } from './sonosKit.testkit';
import type { ClientSocket, UpstreamSocket } from './gatewayRelay';

export { SESSION_COOKIE };

export const PLAY_ORIGIN = 'https://play.sonos.com';
export const SONOS_WS_URL = 'wss://api.ws.sonos.com/websocket';
export const SONOS_SUBPROTOCOL = 'v1.api.smartspeaker.audio';
export const GOOD_TOKEN = 'entra-token-for-a-colleague';
export const GOOD_OID = '33333333-3333-3333-3333-333333333333';
export const GOOD_AUTH = `Bearer ${GOOD_TOKEN}`;
/** Any browser-looking User-Agent: the gateway must send one, and never the client's own. */
export const BROWSER_UA = /^Mozilla\/5\.0 \(.*\) AppleWebKit\/.* Chrome\/\d+.* Safari\/\d+/;

// ── helpers over the handler's plain-object response ─────────────────────────

export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

/** The response body as bytes, whichever of string / Uint8Array the handler used. */
export const bodyBytes = (res: { body: Uint8Array | string }): Buffer =>
  typeof res.body === 'string' ? Buffer.from(res.body, 'utf8') : Buffer.from(res.body);

export const bodyText = (res: { body: Uint8Array | string }): string => bodyBytes(res).toString('utf8');

/** The response body parsed as JSON (fails the test with the raw text when it is not JSON). */
export function bodyJson(res: { body: Uint8Array | string }): unknown {
  const text = bodyText(res);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected a JSON response body, got: ${text.slice(0, 200)}`);
  }
}

/** A response header by name, whatever case the handler used. */
export function header(res: { headers: Record<string, string> }, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.entries(res.headers).find(([k]) => k.toLowerCase() === wanted)?.[1];
}

export const headerNames = (res: { headers: Record<string, string> }): string[] =>
  Object.keys(res.headers).map((k) => k.toLowerCase());

// ── the request, as the Node http entry point hands it to the handler ────────

export type RequestHeaders = Record<string, string | string[] | undefined>;

export interface GatewayRequest {
  method: string;
  url: string;
  headers: RequestHeaders;
  body?: Uint8Array;
}

/**
 * A request to the gateway. By default it is signed in as GOOD_TOKEN and carries the headers a
 * desktop app would send (all lower-case, as Node delivers them). `auth: null` removes Authorization;
 * a string replaces it. `headers` are added on top, and a header set to undefined is removed.
 */
export function gatewayRequest(
  url: string,
  init: { method?: string; auth?: string | null; headers?: RequestHeaders; body?: Uint8Array | string } = {}
): GatewayRequest {
  const headers: RequestHeaders = {
    host: 'gateway.example',
    'user-agent': 'TrueTunes/1.0.94 Electron/40',
    accept: '*/*',
    ...(init.auth === null ? {} : { authorization: init.auth ?? GOOD_AUTH }),
    ...init.headers,
  };
  for (const [k, v] of Object.entries(headers)) if (v === undefined) delete headers[k];
  const body = init.body === undefined ? undefined : typeof init.body === 'string' ? Buffer.from(init.body) : init.body;
  return { method: init.method ?? 'GET', url, headers, ...(body ? { body } : {}) };
}

// ── session and verify stand-ins ──────────────────────────────────────────────

export interface StubSession {
  session: { get(opts?: { refresh?: boolean }): Promise<string> };
  /** Every get(), in order. */
  calls: Array<{ refresh: boolean }>;
  /** How many of them asked for a refresh. */
  refreshes(): number;
  /** The token a plain get() returns now (a refresh moves it on to `refreshedTo`). */
  current(): string;
  /** Make every get() reject with this (a SonosLoginError, say). */
  failAll(err: unknown): void;
  /** Make only get({ refresh: true }) reject with this. */
  failRefresh(err: unknown): void;
}

/** A session that returns `initial`, and `refreshedTo` once refreshed. */
export function createStubSession(initial = 'sess-old', refreshedTo = 'sess-new'): StubSession {
  let token = initial;
  let failAll: unknown;
  let failRefresh: unknown;
  const calls: Array<{ refresh: boolean }> = [];
  return {
    calls,
    refreshes: () => calls.filter((c) => c.refresh).length,
    current: () => token,
    failAll: (err) => void (failAll = err),
    failRefresh: (err) => void (failRefresh = err),
    session: {
      get: async (opts) => {
        const refresh = opts?.refresh === true;
        calls.push({ refresh });
        if (failAll) throw failAll;
        if (refresh) {
          if (failRefresh) throw failRefresh;
          token = refreshedTo;
        }
        return token;
      },
    },
  };
}

export const loginError = () => new SonosLoginError('authn: Okta answered MFA_REQUIRED, not SUCCESS');

export interface VerifyStub {
  verify: (authorization: string | undefined) => Promise<{ oid: string } | null>;
  /** The Authorization header value of every call (undefined when the request had none). */
  calls: Array<string | undefined>;
}

/** Signed in = `Authorization: Bearer <GOOD_TOKEN>` (or one of `tokens`, mapped to its oid). */
export function stubVerify(tokens: Record<string, string> = { [GOOD_TOKEN]: GOOD_OID }): VerifyStub {
  const calls: Array<string | undefined> = [];
  return {
    calls,
    verify: async (authorization) => {
      calls.push(authorization);
      const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
      const oid = token ? tokens[token] : undefined;
      return oid ? { oid } : null;
    },
  };
}

/**
 * `verify` built from the real tenant check: a Bearer token whose signature, issuer, audience and
 * expiry verifyEntraToken accepts is a signed-in caller; anything else (no header, Basic, forged,
 * expired, another tenant) is null. There is deliberately no AUTH_ENFORCE: no header is always null.
 */
export function bearerVerifier(check: EntraTokenCheck): VerifyStub['verify'] {
  return async (authorization) => {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
    if (!token) return null;
    try {
      return { oid: await verifyEntraToken(token, check) };
    } catch {
      return null;
    }
  };
}

// ── the fake play.sonos.com ───────────────────────────────────────────────────

export interface UpstreamCall {
  method: string;
  url: URL;
  headers: Headers;
  body: Buffer;
  /** init.redirect as the gateway passed it. */
  redirect: string | undefined;
}

export type Responder = (call: UpstreamCall) => Response | Promise<Response>;

type ResponseBody = ConstructorParameters<typeof Response>[0];

/** A Response with a status, a body and headers (an array value is sent as repeated headers, e.g. Set-Cookie). */
export function reply(
  status: number,
  body: ResponseBody = null,
  headers: Record<string, string | string[]> = {}
): Response {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) for (const one of Array.isArray(v) ? v : [v]) h.append(k, one);
  const noBody = status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : body, { status, headers: h });
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function cookieOf(headers: Headers, name: string): string | undefined {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** What /api/mfe does when it is told to misbehave. */
export type MfeFault = 'server-error' | 'no-ticket' | 'not-json' | 'network';

export function createFakeUpstream(sonos: FakeSonos = createFakeSonos()) {
  const calls: UpstreamCall[] = [];
  const accepted = new Set<string>();
  const ticketsIssued: string[] = [];

  const up = {
    /** The login fake underneath; a real createSonosSession can use `up.fetch` and log in through it. */
    sonos,
    /** Every call except the login flow, in order (including calls to hosts other than play.sonos.com). */
    calls,
    /** Tickets /api/mfe has handed out, in order. Each is a distinct UUID and is single-use. */
    ticketsIssued,
    /** Set to make /api/mfe misbehave for authorised callers. */
    mfeFault: null as MfeFault | null,
    /** Answers for authorised /api/... calls other than /api/mfe. Replace it per test. */
    responder: ((call) =>
      reply(200, JSON.stringify({ ok: true, path: call.url.pathname }), {
        'content-type': 'application/json',
        etag: '"v1"',
        'cache-control': 'private, max-age=5',
        'set-cookie': [
          'tracking=abc; Path=/; HttpOnly',
          `${SESSION_COOKIE}=rotated-by-sonos; Path=/; Secure; HttpOnly`,
        ],
      })) as Responder,
    /** Sonos accepts this session token (in addition to every token the login fake issues). */
    accept: (token: string) => void accepted.add(token),
    isAccepted: (token: string | undefined) => !!token && (accepted.has(token) || sonos.isValid(token)),
    /** Calls to /api/mfe, in order. */
    mfeCalls: () => calls.filter((c) => c.url.origin === PLAY_ORIGIN && c.url.pathname === '/api/mfe'),
    /** Calls to anywhere other than https://play.sonos.com/api/... (the gateway's host must never move). */
    stray: () => calls.filter((c) => c.url.origin !== PLAY_ORIGIN || !c.url.pathname.startsWith('/api/')),
    fetch: undefined as unknown as typeof fetch,
  };

  async function handle(call: UpstreamCall): Promise<Response> {
    const { url } = call;
    if (url.origin !== PLAY_ORIGIN) return reply(200, JSON.stringify({ hijacked: url.href }));
    if (!url.pathname.startsWith('/api/')) return reply(404, 'not found');
    const token = cookieOf(call.headers, SESSION_COOKIE);
    if (!up.isAccepted(token))
      return reply(401, JSON.stringify({ error: 'unauthorised' }), { 'content-type': 'application/json' });

    if (url.pathname === '/api/mfe') {
      if (up.mfeFault === 'network') throw new TypeError(`fetch failed: Cookie: ${SESSION_COOKIE}=${token}`);
      if (up.mfeFault === 'server-error') return reply(500, 'boom');
      if (up.mfeFault === 'not-json') return reply(200, '<html>not json</html>', { 'content-type': 'text/html' });
      const ticket = UUID(ticketsIssued.length + 1);
      ticketsIssued.push(ticket);
      // Shaped like the real thing: the ticket is nested, under a key containing "ticket", with an
      // unrelated UUID alongside it that must not be mistaken for it.
      const mfe =
        up.mfeFault === 'no-ticket'
          ? { config: { socket: { sessionUuid: UUID(900), ticketNote: 'none' } } }
          : { config: { apps: [{ id: UUID(901) }], socket: { sessionUuid: UUID(902), wsTicket: ticket } } };
      return reply(200, JSON.stringify(mfe), { 'content-type': 'application/json' });
    }
    return up.responder(call);
  }

  up.fetch = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    if (typeof input !== 'string' && !(input instanceof URL)) {
      throw new Error('The fake upstream needs fetch(url, init) with a string or URL, not a Request');
    }
    const url = new URL(String(input));
    // The login flow (and the session's own validity check is /api/mfe, handled below).
    if (url.host === 'login.sonos.com' || url.pathname.startsWith('/api/auth/') || url.pathname === '/en-us/web-app') {
      return sonos.fetch(input, init);
    }
    await new Promise<void>((done) => setImmediate(done));
    const call: UpstreamCall = {
      method: (init.method ?? 'GET').toUpperCase(),
      url,
      headers: new Headers(init.headers),
      body:
        init.body == null ? Buffer.alloc(0) : Buffer.from(await new Response(init.body as ResponseBody).arrayBuffer()),
      redirect: init.redirect,
    };
    calls.push(call);
    let res = await handle(call);
    // Like fetch(): unless told not to, follow a redirect (and so carry the cookie wherever it points).
    if (init.redirect !== 'manual' && res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location') as string, url);
      const followed: UpstreamCall = { ...call, method: 'GET', url: next, body: Buffer.alloc(0) };
      calls.push(followed);
      res = await handle(followed);
    }
    return res;
  }) as typeof fetch;

  return up;
}

export type FakeUpstream = ReturnType<typeof createFakeUpstream>;

// ── in-memory sockets ─────────────────────────────────────────────────────────

/** Close codes a WebSocket endpoint may put in a close frame (RFC 6455 section 7.4; `ws` enforces this). */
export function isSendableCloseCode(code: number): boolean {
  return (
    (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999)
  );
}

type SocketData = string | Uint8Array;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;

class FakeSocket {
  state: 'connecting' | 'open' | 'closing' | 'closed';
  /** Frames the code under test sent to this socket, in order. */
  sent: SocketData[] = [];
  /** Every close() the code under test made, in order. */
  closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];
  /** Things a real `ws` socket would throw on; empty in a correct relay. */
  violations: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(state: 'connecting' | 'open') {
    this.state = state;
  }

  on(event: string, listener: Listener): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }

  send(data: SocketData): void {
    if (this.state !== 'open') {
      const v = `send() while the socket was ${this.state}`;
      this.violations.push(v);
      throw new Error(v);
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (code !== undefined && !isSendableCloseCode(code)) {
      const v = `close(${code}): that code may not be sent in a close frame`;
      this.violations.push(v);
      throw new RangeError(v);
    }
    this.closeCalls.push({ code, reason });
    if (this.state === 'closing' || this.state === 'closed') return;
    const wasConnecting = this.state === 'connecting';
    this.state = 'closing';
    // Like ws: the 'close' event follows later and echoes the code; closing mid-handshake is an error first.
    setImmediate(() => {
      this.state = 'closed';
      if (wasConnecting) this.emit('error', new Error('WebSocket was closed before the connection was established'));
      this.emit('close', wasConnecting ? 1006 : (code ?? 1005), wasConnecting ? '' : (reason ?? ''));
    });
  }

  // ── what the remote end does ──
  /** The remote end sends a frame. */
  peerMessage(data: SocketData): void {
    this.emit('message', data);
  }
  /** The remote end closes the connection. */
  peerClose(code: number, reason = ''): void {
    this.state = 'closed';
    this.emit('close', code, reason);
  }
  peerError(err: Error): void {
    this.emit('error', err);
  }
}

/** The desktop app's end of the relay. Born open, as `accept` is only called once the upgrade succeeded. */
export class FakeClientSocket extends FakeSocket {
  constructor() {
    super('open');
  }
}

/** The connection to api.ws.sonos.com. Born connecting; the test decides when the handshake completes. */
export class FakeUpstreamSocket extends FakeSocket {
  constructor(
    readonly url: string,
    readonly protocols: string[],
    /** Every argument connectUpstream was called with. */
    readonly args: unknown[]
  ) {
    super('connecting');
  }
  /** The handshake completes. */
  open(): void {
    this.state = 'open';
    this.emit('open');
  }
  /** The ticket in the connection URL. */
  get ticket(): string | null {
    return new URL(this.url).searchParams.get('ticket');
  }
}

export function createSocketHarness() {
  const upstreams: FakeUpstreamSocket[] = [];
  return {
    /** Every connection the relay opened to Sonos, in order. */
    upstreams,
    /** Pass as `connectUpstream`. */
    connectUpstream: (...args: unknown[]): UpstreamSocket => {
      const [url, protocols] = args as [string, string[]];
      const socket = new FakeUpstreamSocket(url, protocols, args);
      upstreams.push(socket);
      return socket as unknown as UpstreamSocket;
    },
    newClient: () => {
      const client = new FakeClientSocket();
      return { client, socket: client as unknown as ClientSocket };
    },
  };
}

// ── waiting ───────────────────────────────────────────────────────────────────

/** Let pending macrotasks (the fakes answer one macrotask late) run. */
export const settle = (rounds = 25) =>
  new Promise<void>((done) => {
    let n = 0;
    const tick = () => (++n >= rounds ? done() : setImmediate(tick));
    setImmediate(tick);
  });

/** Polls until `condition` holds; rejects with `what` after `ms`. */
export async function waitFor(condition: () => boolean, what: string, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await new Promise<void>((done) => setImmediate(done));
  }
}

/** 'resolved' | 'rejected' | 'pending' for a promise, after letting the fakes run. */
export async function outcomeOf(p: Promise<unknown>, ms = 500): Promise<'resolved' | 'rejected' | 'pending'> {
  let timer: NodeJS.Timeout | undefined;
  const result = await Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const
    ),
    new Promise<'pending'>((done) => (timer = setTimeout(() => done('pending'), ms))),
  ]);
  clearTimeout(timer);
  return result;
}

// ── the fake Function App, for the Web PubSub relay ──────────────────────────

export const PUBSUB_SUBPROTOCOL = 'json.webpubsub.azure.v1';
export const FUNCTIONS_URL = 'https://truetunes-fn.azurewebsites.net';
/** Shaped like the real client access URL: its access_token is a secret. */
export const PUBSUB_ACCESS_TOKEN = 'wps-access-token-SECRET';
export const PUBSUB_URL = `wss://truetunes-wps.webpubsub.azure.com/client/hubs/office?access_token=${PUBSUB_ACCESS_TOKEN}`;

export interface FunctionsCall {
  method: string;
  url: URL;
  headers: Headers;
  body: Buffer;
}

/** What POST /api/connect does when told to misbehave. */
export type ConnectFault = 'status' | 'no-url' | 'not-json' | 'network';

/** A fake truetunes-fn: hand `.fetch` to the relay as its `fetch`. Every call is recorded. */
export function createFakeFunctions() {
  const calls: FunctionsCall[] = [];
  const fn = {
    calls,
    /** The URL /api/connect hands out. */
    webPubSubUrl: PUBSUB_URL as unknown,
    fault: null as ConnectFault | null,
    fetch: (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
      if (typeof input !== 'string' && !(input instanceof URL)) throw new Error('The fake needs fetch(url, init)');
      const call: FunctionsCall = {
        method: (init.method ?? 'GET').toUpperCase(),
        url: new URL(String(input)),
        headers: new Headers(init.headers),
        body: init.body == null ? Buffer.alloc(0) : Buffer.from(String(init.body)),
      };
      calls.push(call);
      await new Promise<void>((done) => setImmediate(done));
      if (fn.fault === 'network')
        throw new TypeError(`fetch failed: ${call.url.href} ${call.headers.get('authorization')}`);
      if (fn.fault === 'status') return reply(500, 'boom');
      if (fn.fault === 'not-json') return reply(200, '<html>no</html>', { 'content-type': 'text/html' });
      if (fn.fault === 'no-url') return reply(200, JSON.stringify({ clientAccessUrl: PUBSUB_URL }));
      return reply(200, JSON.stringify({ webPubSubUrl: fn.webPubSubUrl, hub: 'office' }), {
        'content-type': 'application/json',
      });
    }) as typeof fetch,
  };
  return fn;
}

export type FakeFunctions = ReturnType<typeof createFakeFunctions>;
