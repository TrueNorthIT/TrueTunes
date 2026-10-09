// Mirrors TrueTunes/src/types.ts (Sonos fetch types). Keep in sync with the desktop app.

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

/** Runtime identifiers the URL builder fills into `:param` placeholders. */
export interface SonosConfig {
  /** Primary music service ID, discovered from integration registrations. */
  serviceId?: string;
  accountId?: string;
  /** Re-discovered on each WS bootstrap. */
  householdId?: string;
  /** Session-scoped (RINCON_xxx:sessionId), re-discovered on each WS bootstrap. */
  groupId?: string;
  /** Coordinator player ID. */
  queueId?: string;
}
