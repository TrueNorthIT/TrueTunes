// A small in-memory log of what the Sonos relay did, readable on the phone at /diagnostics (no console there).
// Memory only; never a token, never a URL.

export type DiagEvent =
  | { at: number; kind: 'connect' | 'open' | 'bootstrap' | 'wake' | 'probe-failed' }
  | { at: number; kind: 'close'; code: number }
  | {
      at: number;
      kind: 'playback';
      source: 'push' | 'response' | 'replay' | 'bootstrap' | 'skipped';
      has: { state: boolean; position: boolean; track: boolean; duration: boolean; queueVersion: boolean };
    };

const MAX = 50;
const events: DiagEvent[] = [];
const subs = new Set<() => void>();
let lastFrameAt = 0;
let relayOpen = false;

export function record(e: DiagEvent): void {
  events.push(e);
  if (events.length > MAX) events.shift();
  subs.forEach((cb) => cb());
}

export const noteFrame = (at: number) => (lastFrameAt = at);
export const setRelayOpen = (open: boolean) => (relayOpen = open);
export const getDiagnostics = () => ({ events: [...events], lastFrameAt, relayOpen });

export function onDiagnostics(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** Which fields a playbackExtended payload carried. */
export function playbackFields(payload: unknown): Extract<DiagEvent, { kind: 'playback' }>['has'] {
  const p = (payload ?? {}) as {
    playback?: { playbackState?: string; positionMillis?: number; queueVersion?: string };
    metadata?: { currentItem?: { track?: { id?: { objectId?: string }; durationMillis?: number } } };
  };
  const track = p.metadata?.currentItem?.track;
  return {
    state: !!p.playback?.playbackState,
    position: p.playback?.positionMillis != null,
    track: !!track?.id?.objectId,
    duration: !!track?.durationMillis,
    queueVersion: !!p.playback?.queueVersion,
  };
}
