/**
 * Who is actually in the office, from Microsoft Graph.
 *
 * `presence.workLocation.workLocationType` is the signal we want: `office` means
 * in the building, not merely online. Teams sets it automatically from network
 * and peripheral signals, or the user sets it by hand in Teams/Outlook.
 *
 * Availability alone is not a substitute — someone working from home shows as
 * `available` and cannot hear the speaker — so it's only used as a fallback when
 * nobody in the org populates work location.
 */

const GRAPH_PRESENCE_URL = 'https://graph.microsoft.com/v1.0/communications/getPresencesByUserId';

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

/**
 * Not signed in to Teams at all. `presenceUnknown` usually means no Teams
 * licence rather than absence, but either way we have no evidence they're here.
 */
const NOT_SIGNED_IN = new Set(['offline', 'presenceunknown']);

export function isAtDesk(presence: GraphPresence): boolean {
  return AT_DESK.has(String(presence.availability ?? '').toLowerCase());
}

/**
 * In the office AND actually signed in.
 *
 * Work location alone isn't enough: a `scheduled` source is only what someone's
 * Outlook working pattern claims for today, and nobody updates the plan when
 * they change it. We saw exactly that — `office` (scheduled) alongside
 * `Offline`, i.e. someone rostered in who never turned up. Requiring a live
 * Teams session filters those out while leaving the `automatic` signals — which
 * Teams derived from being physically on the network — untouched.
 */
export function isInOffice(presence: GraphPresence): boolean {
  if (presence.workLocation?.workLocationType !== 'office') return false;
  return !NOT_SIGNED_IN.has(String(presence.availability ?? '').toLowerCase());
}

export async function fetchPresences(token: string, oids: string[]): Promise<GraphPresence[]> {
  const out: GraphPresence[] = [];

  for (let i = 0; i < oids.length; i += MAX_IDS_PER_REQUEST) {
    const batch = oids.slice(i, i + MAX_IDS_PER_REQUEST);
    const res = await fetch(GRAPH_PRESENCE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Graph presence ${res.status}: ${detail.slice(0, 200)}`);
    }

    const body = (await res.json()) as { value?: GraphPresence[] };
    out.push(...(body.value ?? []));
  }

  return out;
}

export interface OfficeRoster {
  /** Names to build the DJ set for. */
  inOffice: string[];
  /**
   * Which signal decided the room, best first. The UI states this rather than
   * implying certainty it doesn't have.
   *   'sensed'       — Teams detected them on the office network. Trusted.
   *   'rostered'     — their Outlook working pattern claims office today.
   *   'availability' — merely online; includes people working from home.
   *   'none'         — nothing to go on; caller falls back to queue activity.
   */
  basis: 'sensed' | 'rostered' | 'availability' | 'none';
  /** How many of `inOffice` Teams detected automatically, rather than were rostered. */
  observed: number;
  /** Everyone Graph answered for, for display and debugging. */
  detail: Array<{ userId: string; availability?: string; workLocationType?: string; source?: string }>;
}

/**
 * Resolve a roster from Graph presences, preferring sensed presence over stated
 * intent.
 *
 * Where Teams is detecting people automatically, that detection is the source of
 * truth — and its silence is informative too. Someone marked `office` by their
 * Outlook schedule, showing Available, but never seen on the office network is
 * most likely working elsewhere; the colleagues Teams did detect prove the
 * detection is working in that building.
 *
 * Each rung down is a weaker claim, which is why `basis` is reported rather than
 * flattened away: "at a desk" quietly masquerading as "in the office" would
 * include everyone working from home.
 */
export function resolveRoster(
  presences: GraphPresence[],
  oidToName: Record<string, string>,
): OfficeRoster {
  const detail = presences.map((p) => ({
    userId: oidToName[p.id] ?? p.id,
    availability: p.availability,
    workLocationType: p.workLocation?.workLocationType,
    source: p.workLocation?.source,
  }));

  // 'automatic' means Teams saw them on the office network — an observation.
  // Everything else is someone's stated intent.
  const observed = presences.filter(
    (p) => isInOffice(p) && p.workLocation?.source === 'automatic',
  ).length;

  const names = (list: GraphPresence[]) => list.map((p) => oidToName[p.id]).filter(Boolean);

  // 1. Sensed. Teams saw them on the network — trust it, and trust its silence.
  if (observed > 0) {
    const sensed = presences.filter(
      (p) => isInOffice(p) && p.workLocation?.source === 'automatic',
    );
    return { inOffice: names(sensed), basis: 'sensed', observed, detail };
  }

  // 2. Rostered. No automatic detection anywhere, so fall back to stated intent.
  const anyWorkLocation = presences.some(
    (p) => p.workLocation?.workLocationType && p.workLocation.workLocationType !== 'unspecified',
  );
  if (anyWorkLocation) {
    return { inOffice: names(presences.filter(isInOffice)), basis: 'rostered', observed, detail };
  }

  // 3. Online somewhere. Weakest signal — says as much.
  const atDesk = names(presences.filter(isAtDesk));
  return { inOffice: atDesk, basis: atDesk.length ? 'availability' : 'none', observed: 0, detail };
}
