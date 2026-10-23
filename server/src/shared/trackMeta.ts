// Validation for track lengths/explicit flags reported by desktops. Anything
// odd is dropped rather than stored: these feed public stats.

export interface TrackMetaInput {
  uri: string;
  durationMs?: number;
  explicit?: boolean;
}

export const MAX_BATCH = 200;
const MAX_DURATION_MS = 24 * 60 * 60_000;
// Cosmos ids can't contain / \ ? #; Sonos/YouTube Music ids never do.
const SAFE_ID = /^[A-Za-z0-9_\-.:~=+]{1,255}$/;

export function sanitiseTrackMeta(input: unknown): TrackMetaInput[] {
  if (!Array.isArray(input)) return [];
  const byUri = new Map<string, TrackMetaInput>();
  for (const raw of input.slice(0, MAX_BATCH)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.uri !== 'string' || !SAFE_ID.test(r.uri)) continue;
    const durationMs =
      typeof r.durationMs === 'number' &&
      Number.isFinite(r.durationMs) &&
      r.durationMs > 0 &&
      r.durationMs <= MAX_DURATION_MS
        ? Math.round(r.durationMs)
        : undefined;
    const explicit = typeof r.explicit === 'boolean' ? r.explicit : undefined;
    if (durationMs === undefined && explicit === undefined) continue;
    const prev = byUri.get(r.uri);
    byUri.set(r.uri, {
      uri: r.uri,
      durationMs: durationMs ?? prev?.durationMs,
      explicit: explicit ?? prev?.explicit,
    });
  }
  return [...byUri.values()];
}

/** Fields to write: what was reported, keeping anything already stored that wasn't. */
export function mergeTrackMeta(
  existing: { durationMs?: number | null; explicit?: boolean | null } | undefined,
  incoming: TrackMetaInput
): { durationMs: number | null; explicit: boolean | null } {
  return {
    durationMs: incoming.durationMs ?? existing?.durationMs ?? null,
    explicit: incoming.explicit ?? existing?.explicit ?? null,
  };
}
