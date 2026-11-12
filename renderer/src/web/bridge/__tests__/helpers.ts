// Fakes for the web bridge tests. Nothing here reaches a network: an unmatched request throws.

import { vi } from 'vitest';
import type { WebAuth, WebBridge, WebBridgeEnv, UpdateSource } from '../types';
import { createWebBridge } from '../index';

export const BASE = 'https://gw.test';

// ─── fetch ──────────────────────────────────────────────────────────────────────

export interface Call {
  method: string;
  /** The full URL as requested. */
  url: string;
  /** The URL minus the gateway base: `/sonos/api/...`, `/fn/...`, `/img?...`. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
  json: () => unknown;
}

export type Respond = (call: Call) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

export class FakeFetch {
  calls: Call[] = [];
  private routes: Array<{ method: string; match: string | RegExp; respond: Respond }> = [];

  /** `fake.on('GET', '/fn/users', () => json([]))`. A string matches the path up to the query; a RegExp matches the path with it. */
  on(method: string, match: string | RegExp, respond: Respond | Response): this {
    this.routes.push({ method, match, respond: typeof respond === 'function' ? respond : () => respond.clone() });
    return this;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
    const u = new URL(url, BASE);
    const body = init?.body;
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      path,
      query: u.searchParams,
      headers,
      body,
      json: () => JSON.parse(String(body)),
    };
    this.calls.push(call);
    const pathOnly = path.split('?')[0];
    for (let i = this.routes.length - 1; i >= 0; i--) {
      const r = this.routes[i];
      const hit = typeof r.match === 'string' ? pathOnly === r.match : r.match.test(path);
      if (hit && r.method === call.method) return r.respond(call);
    }
    throw new Error(`unexpected request ${call.method} ${url}`);
  };

  /** Calls whose path (up to the query) equals `path`. */
  to(path: string, method?: string): Call[] {
    return this.calls.filter((c) => c.path.split('?')[0] === path && (!method || c.method === method));
  }
}

// ─── auth ───────────────────────────────────────────────────────────────────────

export const USER: EntraUser = { oid: 'oid-1', name: 'Test User', email: 'test@example.com' };

export interface FakeAuth extends WebAuth {
  /** What idToken() answers; null means signed out or needs the user. */
  token: string | null;
  /** The token a forced refresh produces (defaults to `token`). */
  refreshed: string | null | undefined;
  signedIn: EntraUser | null;
  graph: string | null;
  idTokenCalls: Array<{ forceRefresh?: boolean } | undefined>;
  signInCalls: Array<{ selectAccount?: boolean } | undefined>;
  signOutCalls: number;
  graphCalls: string[][];
}

export function fakeAuth(over: Partial<Pick<FakeAuth, 'token' | 'signedIn' | 'graph' | 'refreshed'>> = {}): FakeAuth {
  const a: FakeAuth = {
    token: 'tok-1',
    refreshed: undefined,
    signedIn: USER,
    graph: 'graph-tok',
    idTokenCalls: [],
    signInCalls: [],
    signOutCalls: 0,
    graphCalls: [],
    init: () => Promise.resolve(a.signedIn),
    signIn: (opts) => {
      a.signInCalls.push(opts);
      return Promise.resolve();
    },
    signOut: () => {
      a.signOutCalls++;
      a.signedIn = null;
      return Promise.resolve();
    },
    user: () => a.signedIn,
    idToken: (opts) => {
      a.idTokenCalls.push(opts);
      if (opts?.forceRefresh && a.refreshed !== undefined) return Promise.resolve(a.refreshed);
      return Promise.resolve(a.token);
    },
    graphToken: (scopes) => {
      a.graphCalls.push(scopes);
      return Promise.resolve(a.graph);
    },
    ...over,
  };
  return a;
}

// ─── WebSocket ──────────────────────────────────────────────────────────────────

export type Frame = [Record<string, unknown>, unknown];

export class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  /** Called with every frame the app sends, to play the Sonos side. */
  static server: ((ws: FakeWebSocket, frame: Frame) => void) | null = null;
  static OPEN = 1;
  readyState = 0;
  sent: Frame[] = [];

  constructor(
    readonly url: string,
    readonly protocols?: string | string[]
  ) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    const frame = JSON.parse(data) as Frame;
    this.sent.push(frame);
    FakeWebSocket.server?.(this, frame);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code: 1000 }));
  }

  // test controls
  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  receive(frame: Frame): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
  }
  /** The connection dies without a close handshake (what a browser sees for a refused upgrade, or a network drop). */
  drop(): void {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code: 1006 }));
  }
  /** Frames the app sent, filtered. */
  commands(namespace: string, command?: string): Frame[] {
    return this.sent.filter(([h]) => h['namespace'] === namespace && (!command || h['command'] === command));
  }
  static last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
}

export const DEVICES = [
  { info: { id: 'RINCON_A', name: 'Kitchen' }, groupId: 'RINCON_A:1', isCoordinator: true },
  { info: { id: 'RINCON_B', name: 'Lounge' }, groupId: 'RINCON_A:1', isCoordinator: false },
  { info: { id: 'RINCON_C', name: 'Office' }, groupId: 'RINCON_C:2', isCoordinator: true },
];

/** A Sonos that answers the bootstrap. Every frame gets a response echoing its header; the devices subscribe also pushes the topology. */
export function playSonos(devices: unknown[] = DEVICES): void {
  FakeWebSocket.server = (ws, [header]) => {
    const reply = (payload: unknown) =>
      queueMicrotask(() => ws.receive([{ ...header, success: true, response: header['command'] }, payload]));
    const ns = header['namespace'];
    if (header['command'] === 'getHouseholds') return reply({ households: [{ id: 'HH1' }] });
    if (ns === 'devices' && header['command'] === 'subscribe') {
      reply({});
      queueMicrotask(() =>
        queueMicrotask(() =>
          ws.receive([{ namespace: 'devices', name: 'devicesStatus', householdId: 'HH1' }, { devices }])
        )
      );
      return;
    }
    if (ns === 'playbackExtended') return reply({ playback: { playbackState: 'PLAYBACK_STATE_PAUSED' } });
    if (ns === 'groupVolume') return reply({ volume: 20, muted: false });
    reply({});
  };
}

// ─── the bridge ─────────────────────────────────────────────────────────────────

export function withCorrId(header: Record<string, unknown>, corrId: unknown): Record<string, unknown> {
  return { ...header, corrId };
}

/** The Sonos HTTP calls the bootstrap makes (service discovery). */
export function routeDiscovery(fake: FakeFetch): void {
  fake.on('GET', '/sonos/api/content/v1/households/HH1/integrations/registrations', () =>
    json([{ 'service-id': '16751367', 'account-id': 'x' }, { 'service-id': '72711', 'account-id': '9' }])
  );
  fake.on('GET', '/sonos/api/content/v2/households/HH1/services/72711/accounts/9/containers/root/browse', () =>
    json({ ok: true })
  );
}

export interface Harness {
  bridge: WebBridge;
  auth: FakeAuth;
  fake: FakeFetch;
  env: WebBridgeEnv;
  storage: Storage;
}

/** A bridge whose fetch, socket and storage are all fakes. The usual gateway routes are in place. */
export function makeBridge(
  opts: { auth?: FakeAuth; updates?: UpdateSource; gatewayBase?: string; storage?: Record<string, string> } = {}
): Harness {
  localStorage.clear();
  for (const [k, v] of Object.entries(opts.storage ?? {})) localStorage.setItem(k, v);
  FakeWebSocket.instances = [];
  FakeWebSocket.server = null;
  const auth = opts.auth ?? fakeAuth();
  const fake = new FakeFetch();
  fake.on('GET', '/sonos/api/mfe', () => json({}));
  fake.on('GET', '/fn/profile/lookup', () => text('', 404));
  fake.on('POST', '/fn/profile/claim', () => json({ ok: true }));
  fake.on('GET', '/fn/attribution', () => json({}));
  routeDiscovery(fake);
  const env: WebBridgeEnv = {
    auth,
    version: '1.2.3',
    gatewayBase: opts.gatewayBase ?? BASE,
    socketUrl: 'wss://gw.test',
    fetch: fake.fetch,
    // The fake stands in for the browser's class; it implements only what the bridge uses.
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    storage: localStorage,
    updates: opts.updates,
  };
  return { bridge: createWebBridge(env), auth, fake, env, storage: localStorage };
}

/** Starts the bridge, opens the socket and waits for the bootstrap to finish. */
export async function startReady(h: Harness): Promise<FakeWebSocket> {
  playSonos();
  h.bridge.start();
  await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  const ws = FakeWebSocket.last();
  ws.open();
  const ready = vi.fn();
  const off = h.bridge.onWsReady(ready);
  await vi.waitFor(() => expect(ready).toHaveBeenCalled());
  off();
  return ws;
}

/** Lets queued microtasks run (late-subscriber deliveries). */
export async function tick(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
