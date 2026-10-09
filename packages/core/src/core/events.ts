// The renderer-facing event hub. Replaces Electron's webContents.send + preload.ts, including the
// preload's buffering of early events (auth:ready, ws:ready, ws:groups, attribution:map,
// auth:entra-ready): a listener that subscribes after the event fired still receives the last value.

type Unsubscribe = () => void;
// Internal storage is loosely typed; the public emit/on signatures are what enforce channel payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void;

export class EventHub<Events extends Record<string, unknown[]>> {
  private listeners = new Map<keyof Events, Set<AnyListener>>();
  private sticky = new Map<keyof Events, unknown[]>();

  /** Channels whose last payload is replayed to late subscribers. */
  constructor(private readonly stickyChannels: ReadonlyArray<keyof Events> = []) {}

  emit<K extends keyof Events>(channel: K, ...args: Events[K]): void {
    if (this.stickyChannels.includes(channel)) this.sticky.set(channel, args);
    for (const cb of [...(this.listeners.get(channel) ?? [])]) cb(...args);
  }

  on<K extends keyof Events>(channel: K, cb: (...args: Events[K]) => void): Unsubscribe {
    let set = this.listeners.get(channel);
    if (!set) this.listeners.set(channel, (set = new Set()));
    set.add(cb);
    const last = this.sticky.get(channel);
    if (last) cb(...(last as Events[K]));
    return () => set!.delete(cb);
  }

  /** Forget a sticky value (e.g. auth:ready must not replay after a 401). */
  clear(channel: keyof Events): void {
    this.sticky.delete(channel);
  }
}
