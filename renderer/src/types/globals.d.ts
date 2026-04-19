// Ambient declarations for contextBridge APIs injected by preload.ts

interface AttributionEntry {
  user: string;
  timestamp: number;
  trackName: string;
  artist: string;
}

type AttributionMap = Record<string, AttributionEntry>;

interface AttributionEvent {
  type: 'queued';
  user: string;
  uri: string;
  trackName: string;
  artist: string;
  timestamp: number;
}

interface FetchRequest {
  operationId: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

interface FetchResponse {
  data?: unknown;
  error?: string;
  etag?: string;
}

type Unsubscribe = () => void;

interface StatsUser {
  userId: string;
  count: number;
}
export interface StatsTrack {
  trackName: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  count: number;
}
interface StatsArtist {
  artist: string;
  artistId?: string;
  count: number;
}
interface StatsAlbum {
  album: string;
  albumId?: string;
  artist: string;
  artistId?: string;
  imageUrl?: string;
  count: number;
}
interface StatsResult {
  topUsers: StatsUser[];
  topTracks: StatsTrack[];
  topArtists: StatsArtist[];
  topAlbums: StatsAlbum[];
  totalEvents: number;
  periodStart: number;
  error?: string;
}

interface SonosPreload {
  getVersion: () => Promise<string>;
  onAuthReady: (cb: VoidCallback) => Unsubscribe;
  onAuthExpired: (cb: VoidCallback) => Unsubscribe;
  fetch: (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage: (cb: (header: unknown, payload: unknown) => void) => Unsubscribe;
  onWsReady: (cb: VoidCallback) => Unsubscribe;
  onWsGroups: (cb: (groups: unknown[]) => void) => Unsubscribe;
  setGroup: (groupId: string) => Promise<{ ok?: boolean; error?: string }>;
  setGroupVolume: (volume: number) => Promise<unknown>;
  setQueueId: (queueId: string) => Promise<void>;
  loadContent: (payload: Record<string, unknown>) => Promise<unknown>;
  fetchImage: (url: string) => Promise<{ data: string; mimeType: string } | { error: string }>;
  refreshPlayback: () => Promise<void>;
  resync: () => Promise<void>;
  setPlayModes: (modes: Record<string, unknown>) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => Promise<unknown>;
  skipNext: () => Promise<unknown>;
  skipPrev: () => Promise<unknown>;
  skipToTrack: (trackNumber: number) => Promise<unknown>;
  reorderQueue: (fromIndices: number[], toIndex: number, queueLength: number) => Promise<unknown>;
  removeFromQueue: (indices: number[]) => Promise<unknown>;
  clearQueue: () => Promise<unknown>;
  openWsMonitor: () => Promise<void>;
  openHttpMonitor: () => Promise<void>;
  openMiniPlayer: () => Promise<void>;
  closeMiniPlayer: () => Promise<void>;
  // Attribution / office presence
  getDisplayName: () => Promise<string | null>;
  setDisplayName: (name: string) => Promise<void>;
  publishQueued: (item: {
    uri: string;
    trackName: string;
    artist: string;
    artistId?: string;
    album?: string;
    albumId?: string;
    imageUrl?: string;
  }) => Promise<void>;
  fetchStats: (period: string, userId?: string) => Promise<StatsResult>;
  refreshAttribution: () => Promise<void>;
  onAttributionMap: (cb: (map: AttributionMap) => void) => Unsubscribe;
  onAttributionEvent: (cb: (event: AttributionEvent) => void) => Unsubscribe;
}

declare global {
  interface Window {
    sonos: SonosPreload;
  }
}

export {};
