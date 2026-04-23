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
  eventType?: 'track' | 'album';
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
  headers?: Record<string, string>;
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
interface StatsTrack {
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

type GameItemCategory = 'track' | 'artist' | 'album';

interface GameItem {
  category: GameItemCategory;
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  uri?: string;
  count: number;
  topQueuer: string;
  queuerCandidates: string[];
  artistKey?: string;
  albumKey?: string;
}

interface GameQuestion {
  index: number;
  left: GameItem;
  right: GameItem;
  winner: 'left' | 'right';
  carryover?: 'left' | 'right';
  bonusItem?: 'left' | 'right';
}

interface GameDoc {
  id: string;
  status: 'generating' | 'ready';
  generatedAt: number;
  lowData: boolean;
  questions: GameQuestion[];
}

interface GamePending {
  status: 'pending';
  gameId?: string;
}

type GameFetchResult = GameDoc | GamePending | { error: string };

interface GameScoreDoc {
  id: string;
  gameId: string;
  userName: string;
  mainScore: number;
  bonusScore: number;
  total: number;
  completedAt: number;
}

interface GameLeaderboardResult {
  gameId: string;
  scores: GameScoreDoc[];
  error?: string;
}

interface GameDateEntry {
  gameId: string;
  status: 'generating' | 'ready';
  userPlayed: boolean;
}

interface GameDatesResult {
  dates?: GameDateEntry[];
  error?: string;
}

interface GameSubmitResult {
  ok?: boolean;
  duplicate?: boolean;
  existing?: GameScoreDoc;
  score?: GameScoreDoc;
  error?: string;
}

interface SonosPreload {
  getVersion: () => Promise<string>;
  isNewVersion: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  onAuthReady: (cb: VoidCallback) => Unsubscribe;
  onAuthExpired: (cb: VoidCallback) => Unsubscribe;
  fetch: (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage: (cb: (header: unknown, payload: unknown) => void) => Unsubscribe;
  onWsReady: (cb: VoidCallback) => Unsubscribe;
  onWsGroups: (cb: (groups: unknown[]) => void) => Unsubscribe;
  getActiveGroup: () => Promise<string | null>;
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
    eventType: 'track' | 'album';
    uri: string;
    trackName: string;
    artist: string;
    artistId?: string;
    album?: string;
    albumId?: string;
    imageUrl?: string;
  }) => Promise<void>;
  fetchStats: (period: string, userId?: string) => Promise<StatsResult>;
  fetchDailyGame: (date?: string) => Promise<GameFetchResult>;
  submitGameScore: (input: {
    gameId: string;
    userName: string;
    guesses: { main: Array<'left' | 'right'>; bonus: string[] };
  }) => Promise<GameSubmitResult>;
  fetchGameLeaderboard: (date?: string) => Promise<GameLeaderboardResult>;
  fetchGameDates: (userName: string) => Promise<GameDatesResult>;
  refreshAttribution: () => Promise<void>;
  onAttributionMap: (cb: (map: AttributionMap) => void) => Unsubscribe;
  onAttributionEvent: (cb: (event: AttributionEvent) => void) => Unsubscribe;
  /** Fire-and-forget telemetry event routed through the main process. No-op when App Insights is not configured. */
  trackEvent: (name: string, properties?: Record<string, string>) => Promise<void>;
  minimizeWindow:    () => Promise<void>;
  maximizeWindow:    () => Promise<void>;
  closeWindow:       () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximized: (cb: (maximized: boolean) => void) => Unsubscribe;
  onUpdateDownloaded: (cb: (version: string) => void) => Unsubscribe;
  installUpdate: () => Promise<void>;
}

interface Window {
  sonos: SonosPreload;
}
