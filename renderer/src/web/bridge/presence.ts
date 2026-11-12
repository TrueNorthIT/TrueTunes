/**
 * Who is actually in the office, from Microsoft Graph: src/graph-presence.ts and the presence:office handler of
 * src/ipc/entra.ts. Graph allows browsers, so it is called directly, not through the gateway.
 *
 * `presence.workLocation.workLocationType` is the signal we want: `office` means in the building, not merely
 * online. Teams sets it automatically from network and peripheral signals, or the user sets it by hand.
 *
 * Availability alone is not a substitute (someone working from home shows as `available` and cannot hear the
 * speaker), so it is only a fallback when nobody in the org populates work location.
 */

import type { WebAuth } from './types';
import type { FnFetch } from './functions';

const GRAPH_PRESENCE_URL = 'https://graph.microsoft.com/v1.0/communications/getPresencesByUserId';

/**
 * Presence lives behind its own scope, acquired on demand rather than at sign-in: bundling it into the sign-in
 * would fail the whole sign-in wherever the tenant has not consented to it.
 */
export const PRESENCE_SCOPE = 'https://graph.microsoft.com/Presence.Read.All';

/** Graph caps a single request at 650 ids. */
const MAX_IDS_PER_REQUEST = 650;

export interface GraphPresence {
  id: string;
  availability?: string;
  activity?: string;
  workLocation?: {
    workLocationType?: 'unspecified' | 'office' | 'remote' | 'timeOff';
    source?: 'none' | 'manual' | 'scheduled' | 'automatic';
    placeId?: string;
  };
}

/** Availability values that mean "at a desk", used only for the fallback. */
const AT_DESK = new Set(['available', 'busy', 'inacall', 'inameeting', 'presenting', 'donotdisturb', 'focusing']);

/** Not signed in to Teams at all: we have no evidence they're here. */
const NOT_SIGNED_IN = new Set(['offline', 'presenceunknown']);

export function isAtDesk(presence: GraphPresence): boolean {
  return AT_DESK.has(String(presence.availability ?? '').toLowerCase());
}

/**
 * In the office AND actually signed in. Work location alone isn't enough: a `scheduled` source is only what
 * someone's Outlook working pattern claims for today, so we saw `office` (scheduled) alongside `Offline`: someone
 * rostered in who never turned up. Requiring a live Teams session filters those out while leaving the
 * `automatic` signals (Teams saw them on the network) untouched.
 */
export function isInOffice(presence: GraphPresence): boolean {
  if (presence.workLocation?.workLocationType !== 'office') return false;
  return !NOT_SIGNED_IN.has(String(presence.availability ?? '').toLowerCase());
}

export async function fetchPresences(fetchFn: typeof fetch, token: string, oids: string[]): Promise<GraphPresence[]> {
  const out: GraphPresence[] = [];

  for (let i = 0; i < oids.length; i += MAX_IDS_PER_REQUEST) {
    const res = await fetchFn(GRAPH_PRESENCE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: oids.slice(i, i + MAX_IDS_PER_REQUEST) }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Graph presence ${res.status}: ${detail.slice(0, 200)}`);
    }

    const body: { value?: GraphPresence[] } = await res.json();
    out.push(...(body.value ?? []));
  }

  return out;
}

export interface OfficeRoster {
  /** Names to build the DJ set for. */
  inOffice: string[];
  /**
   * Which signal decided the room, best first. The UI states this rather than implying certainty it doesn't have.
   *   'sensed'       — Teams detected them on the office network. Trusted.
   *   'rostered'     — their Outlook working pattern claims office today.
   *   'availability' — merely online; includes people working from home.
   *   'none'         — nothing to go on; the caller falls back to queue activity.
   */
  basis: 'sensed' | 'rostered' | 'availability' | 'none';
  /** How many of `inOffice` Teams detected automatically, rather than were rostered. */
  observed: number;
  /** Everyone Graph answered for, for display and debugging. */
  detail: Array<{ userId: string; availability?: string; workLocationType?: string; source?: string }>;
}

/**
 * Resolve a roster from Graph presences, preferring sensed presence over stated intent. Where Teams is detecting
 * people automatically, that detection is the source of truth, and its silence is informative too: someone marked
 * `office` by their Outlook schedule but never seen on the office network is most likely working elsewhere.
 * Each rung down is a weaker claim, which is why `basis` is reported rather than flattened away.
 */
export function resolveRoster(presences: GraphPresence[], oidToName: Record<string, string>): OfficeRoster {
  const detail = presences.map((p) => ({
    userId: oidToName[p.id] ?? p.id,
    availability: p.availability,
    workLocationType: p.workLocation?.workLocationType,
    source: p.workLocation?.source,
  }));

  // 'automatic' means Teams saw them on the office network: an observation. Everything else is stated intent.
  const sensed = presences.filter((p) => isInOffice(p) && p.workLocation?.source === 'automatic');
  const observed = sensed.length;

  const names = (list: GraphPresence[]) => list.map((p) => oidToName[p.id]).filter(Boolean);

  // 1. Sensed: trust it, and trust its silence.
  if (observed > 0) return { inOffice: names(sensed), basis: 'sensed', observed, detail };

  // 2. Rostered: no automatic detection anywhere, so fall back to stated intent.
  const anyWorkLocation = presences.some(
    (p) => p.workLocation?.workLocationType && p.workLocation.workLocationType !== 'unspecified'
  );
  if (anyWorkLocation) return { inOffice: names(presences.filter(isInOffice)), basis: 'rostered', observed, detail };

  // 3. Online somewhere: the weakest signal, and says so.
  const atDesk = names(presences.filter(isAtDesk));
  return { inOffice: atDesk, basis: atDesk.length ? 'availability' : 'none', observed: 0, detail };
}

export function createPresence(o: { auth: WebAuth; fetch: typeof fetch; fn: FnFetch }) {
  const none = (error?: string): OfficePresence => ({
    inOffice: [],
    basis: 'none',
    observed: 0,
    detail: [],
    ...(error ? { error } : {}),
  });

  return async function fetchOfficePresence(): Promise<OfficePresence> {
    try {
      if (!o.auth.user()) return none('not signed in');

      // No consent yet (or the scope isn't on the app registration): the caller infers the room from recent queue activity.
      const token = await o.auth.graphToken([PRESENCE_SCOPE]);
      if (!token) return none('no presence consent');

      const users: Array<{ userId: string; entraOid?: string | null }> = await (await o.fn('users')).json();
      const oidToName: Record<string, string> = {};
      for (const u of users) if (u.entraOid) oidToName[u.entraOid] = u.userId;

      const oids = Object.keys(oidToName);
      if (oids.length === 0) return none();

      return resolveRoster(await fetchPresences(o.fetch, token, oids), oidToName);
    } catch (err) {
      return none(String(err));
    }
  };
}
