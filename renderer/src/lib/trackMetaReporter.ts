// Sends the track lengths and explicit flags the queue already looks up to the
// server, so the music stats can show airtime. Each song is reported once per
// app run, in small batches a few seconds apart.

const FLUSH_DELAY_MS = 5_000;
const MAX_BATCH = 200;

const reported = new Set<string>();
let pending = new Map<string, TrackMetaReport>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = [...pending.values()].slice(0, MAX_BATCH);
  batch.forEach((t) => pending.delete(t.uri));
  if (pending.size > 0) timer = setTimeout(flush, FLUSH_DELAY_MS);
  if (batch.length === 0) return;
  try {
    const res = await window.sonos.reportTrackMeta(batch);
    if (res?.error) batch.forEach((t) => reported.delete(t.uri));
  } catch {
    // Best effort: let a later sighting try again.
    batch.forEach((t) => reported.delete(t.uri));
  }
}

export function reportTrackMeta(t: { uri: string | null | undefined; durationMs?: number; explicit?: boolean }) {
  if (!t.uri || reported.has(t.uri)) return;
  const durationMs = t.durationMs && t.durationMs > 0 ? t.durationMs : undefined;
  const explicit = typeof t.explicit === 'boolean' ? t.explicit : undefined;
  if (durationMs === undefined && explicit === undefined) return;
  reported.add(t.uri);
  pending.set(t.uri, { uri: t.uri, durationMs, explicit });
  if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** Test hook. */
export function resetTrackMetaReporter() {
  reported.clear();
  pending = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
}
