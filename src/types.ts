// ─── Attribution types ────────────────────────────────────────────────────────

export interface AttributionEntry {
  user: string;
  timestamp: number;
  trackName: string;
  artist: string;
}

/** Keyed by track objectId / URI */
export type AttributionMap = Record<string, AttributionEntry>;

export interface AttributionEvent {
  type: 'queued';
  user: string;
  uri: string;
  trackName: string;
  artist: string;
  timestamp: number;
}

// ─── Sonos fetch types ────────────────────────────────────────────────────────

export interface FetchRequest {
  operationId: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FetchResponse {
  data?: unknown;
  error?: string;
  etag?: string;
}
