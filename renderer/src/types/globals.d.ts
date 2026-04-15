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
  onAuthReady:   (cb: () => void) => void;
  onAuthExpired: (cb: () => void) => void;
  fetch:         (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage:   (cb: (header: unknown, payload: unknown) => void) => void;
  onWsReady:     (cb: () => void) => void;
  onWsGroups:    (cb: (groups: unknown[]) => void) => void;
  setGroup:      (groupId: string) => Promise<{ ok?: boolean; error?: string }>;
}

declare global {
  interface Window {
    sonos: SonosPreload;
  }
}

export {};
