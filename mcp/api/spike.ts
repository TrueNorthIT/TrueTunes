// Read-only reachability check: can a Vercel function reach Sonos with the office session the way the
// desktop app does? It walks the same calls the MCP will need and reports status codes and counts only.
// It never queues, plays or changes anything, and never echoes the token, ticket or a response body.
//
//   curl -s -H "Authorization: Bearer $SPIKE_KEY" https://<deployment>/api/spike | jq
//
// Delete once the MCP proper exists.

import { timingSafeEqual } from 'node:crypto';
import {
  findTicket,
  groupsFromDevices,
  openSonosSocket,
  PLATFORM_ACCOUNT_ID,
  PLATFORM_SERVICE_ID,
  SEARCH_ACCOUNT_ID,
  SEARCH_SERVICE_ID,
  sonosGet,
  type SonosGroup,
  type SonosResponse,
} from '../lib/sonos.js';

interface Step {
  step: string;
  ok: boolean;
  ms: number;
  status?: number;
  note?: string;
}

function authorised(request: Request): boolean {
  const key = process.env['SPIKE_KEY'];
  if (!key) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${key}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Item count of a Sonos list response: a top-level array, or the first of items/resources. */
function countItems(body: unknown): number | null {
  if (Array.isArray(body)) return body.length;
  const rec = body as Record<string, unknown> | null;
  for (const key of ['items', 'resources', 'groups']) {
    const v = rec?.[key];
    if (Array.isArray(v)) return v.length;
  }
  return null;
}

const short = (id: string) => `${id.slice(0, 12)}…`;

/** Every https host named anywhere in a JSON value: where the sign-in flow sends a browser. */
function hostsIn(value: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 10) return out;
  if (typeof value === 'string' && value.startsWith('https://')) {
    try {
      out.add(new URL(value).hostname);
    } catch {
      /* not a URL */
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) hostsIn(v, out, depth + 1);
  }
  return out;
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return Response.json({ error: 'unauthorised' }, { status: 401 });
  const token = process.env['SONOS_SESSION_TOKEN'];
  if (!token) return Response.json({ error: 'SONOS_SESSION_TOKEN is not set' }, { status: 500 });

  const steps: Step[] = [];
  let rotated = false;

  async function step(name: string, run: () => Promise<Omit<Step, 'step' | 'ms'>>): Promise<boolean> {
    const start = Date.now();
    try {
      const result = await run();
      steps.push({ step: name, ms: Date.now() - start, ...result });
      return result.ok;
    } catch (err) {
      steps.push({ step: name, ok: false, ms: Date.now() - start, note: err instanceof Error ? err.message : 'error' });
      return false;
    }
  }

  const skip = (name: string, why: string) => steps.push({ step: name, ok: false, ms: 0, note: `skipped: ${why}` });

  /** One HTTP step: status, a bot-protection hint on failure, an item count on success. */
  const httpStep = (name: string, call: () => Promise<SonosResponse>, describe?: (body: unknown) => string) =>
    step(name, async () => {
      const r = await call();
      if (r.rotatedToken) rotated = true;
      const note = r.ok
        ? (describe?.(r.body) ?? `items: ${countItems(r.body) ?? 'n/a'}`)
        : `${r.contentType.split(';')[0]}${r.server ? `, server: ${r.server}` : ''}`;
      return { ok: r.ok, status: r.status, note };
    });

  // 0. Signed out: what kind of sign-in Sonos offers. A next-auth "credentials" provider means a server could
  //    sign in with a username and password; "oauth" means a browser login page on another host. No login is attempted.
  await step('sign-in flow', async () => {
    const [providers, discovery] = await Promise.all([
      sonosGet('/api/auth/providers', null),
      sonosGet('/api/authz/discovery', null),
    ]);
    const kinds = Object.values((providers.body as Record<string, { id?: string; type?: string }> | null) ?? {})
      .filter((p) => typeof p === 'object' && p)
      .map((p) => `${p.id ?? '?'}(${p.type ?? '?'})`);
    const hosts = [...hostsIn(providers.body), ...hostsIn(discovery.body)].filter((h) => h !== 'play.sonos.com');
    return {
      ok: providers.ok || discovery.ok,
      status: providers.status,
      note:
        `providers: ${kinds.join(', ') || 'none listed'} (${providers.status}); ` +
        `discovery ${discovery.status}, login hosts: ${[...new Set(hosts)].join(', ') || 'none'}`,
    };
  });

  // 1. Session + ticket: the first thing bot protection or an expired cookie would stop.
  let ticket: string | null = null;
  await httpStep(
    'mfe',
    async () => {
      const r = await sonosGet('/api/mfe', token);
      ticket = r.ok ? findTicket(r.body) : null;
      return r;
    },
    () => (ticket ? 'ticket found' : 'no ticket in response')
  );

  // 2. Control WebSocket from a datacenter IP: household and group topology, as the app's bootstrap gets them.
  let householdId = process.env['SONOS_HOUSEHOLD_ID'] ?? null;
  let group: SonosGroup | null = null;
  const openTicket: string | null = ticket;
  if (openTicket) {
    await step('websocket', async () => {
      const socket = await openSonosSocket(openTicket);
      try {
        const hh = (await socket.send(
          { namespace: 'households', command: 'getHouseholds' },
          { connectedOnly: 'true' }
        )) as { households?: { id: string }[] } | null;
        householdId = hh?.households?.[0]?.id ?? householdId;
        if (!householdId) return { ok: false, note: 'no household' };
        const devicesPush = socket.nextPush('devices:devicesStatus');
        await socket.send({ namespace: 'devices', householdId, command: 'subscribe' });
        const groups = groupsFromDevices(await devicesPush);
        const preferred = process.env['SONOS_COORDINATOR_ID'];
        group = groups.find((g) => g.coordinatorId === preferred) ?? groups[0] ?? null;
        return {
          ok: groups.length > 0,
          note: `household ${short(householdId)}, ${groups.length} group(s)${group ? `, using "${group.name}"` : ''}`,
        };
      } finally {
        socket.close();
      }
    });
  } else {
    skip('websocket', 'no ticket');
  }

  // 3. The HTTP calls the MCP tools need. Groups over HTTP would let the MCP skip the socket entirely.
  const hh: string | null = householdId;
  const g: SonosGroup | null = group;
  if (hh) {
    await httpStep('groups (http)', () => sonosGet(`/api/groups/v1/households/${hh}/groups`, token));
    await httpStep('integrations', () =>
      sonosGet(`/api/content/v1/households/${hh}/integrations/registrations`, token)
    );
    await httpStep(
      'search',
      () =>
        sonosGet(
          `/api/content/v1/households/${hh}/services/${SEARCH_SERVICE_ID}/accounts/${SEARCH_ACCOUNT_ID}/search`,
          token,
          { query: 'Royal Blood', count: '5' }
        ),
      (body) => {
        const tracks = (body as { TRACKS?: { resources?: unknown[] } } | null)?.TRACKS?.resources;
        return `tracks: ${tracks?.length ?? 'n/a'}`;
      }
    );
  } else {
    for (const name of ['groups (http)', 'integrations', 'search']) skip(name, 'no household');
  }

  if (g) {
    const grp: SonosGroup = g;
    await httpStep('queue', () =>
      sonosGet(
        `/api/content/v1/groups/${encodeURIComponent(grp.id)}/services/${PLATFORM_SERVICE_ID}` +
          `/accounts/${PLATFORM_ACCOUNT_ID}/queues/${encodeURIComponent(grp.coordinatorId)}/resources`,
        token,
        { count: '5', offset: '0' }
      )
    );
    await httpStep('playback state (http)', () =>
      sonosGet(`/api/playback/v1/groups/${encodeURIComponent(grp.id)}`, token)
    );
  } else {
    for (const name of ['queue', 'playback state (http)']) skip(name, 'no group');
  }

  return Response.json({
    region: process.env['VERCEL_REGION'] ?? 'local',
    at: new Date().toISOString(),
    allOk: steps.every((s) => s.ok),
    // True means Sonos re-issued the cookie: the MCP must save rotations, not rely on a static env var.
    sessionCookieRotated: rotated,
    steps,
  });
}
