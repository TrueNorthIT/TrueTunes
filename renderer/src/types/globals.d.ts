// Ambient declarations for contextBridge APIs injected by preload.ts

interface FetchRequest {
  operationId: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

interface FetchResponse {
  data?: unknown;
  error?: string;
}

interface SonosPreload {
  onAuthReady: (cb: VoidCallback) => void;
  onAuthExpired: (cb: VoidCallback) => void;
  fetch: (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage: (cb: (header: unknown, payload: unknown) => void) => void;
  onWsReady: (cb: VoidCallback) => void;
  onWsGroups: (cb: (groups: unknown[]) => void) => void;
  setGroup: (groupId: string) => Promise<{ ok?: boolean; error?: string }>;
  setGroupVolume: (volume: number) => Promise<unknown>;
  skipToTrack: (trackNumber: number) => Promise<unknown>;
}

declare global {
  interface Window {
    sonos: SonosPreload;
  }
}

export {};
