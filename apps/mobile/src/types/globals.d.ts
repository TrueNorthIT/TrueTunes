// Ambient declarations for contextBridge APIs injected by preload.ts

type GeniusDomNode = string | { tag: string; children?: GeniusDomNode[]; attributes?: Record<string, string> };

interface GeniusArtistInfo {
  description: GeniusDomNode | null;
  alternateNames: string[];
  imageUrl: string | null;
  headerImageUrl: string | null;
  instagram: string | null;
  twitter: string | null;
}

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
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  count: number;
}
interface StatsArtist {
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  imageUrl?: string;
  count: number;
}
interface StatsAlbum {
  album: string;
  albumId?: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
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

interface GameMyScoreResult {
  score?: {
    mainScore: number;
    bonusScore: number;
    total: number;
    guesses?: { main: Array<'left' | 'right'>; bonus: string[] };
  };
  error?: string;
}

interface GameQuestionStat {
  questionIndex: number;
  leftPct: number;
  rightPct: number;
  bonusOptions: { name: string; pct: number }[];
}

interface GameStatsResult {
  gameId?: string;
  totalPlayers: number;
  questions: GameQuestionStat[];
  error?: string;
}

interface RecentTrack {
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  lastPlayed: number;
}

interface RecentArtist {
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  imageUrl?: string;
  lastPlayed: number;
}

interface RecentAlbum {
  album: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  albumId?: string;
  imageUrl?: string;
  lastPlayed: number;
}

interface RecentlyPlayedData {
  tracks: RecentTrack[];
  artists: RecentArtist[];
  albums: RecentAlbum[];
  availableUsers?: string[];
}

interface DjTrack {
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  albumId?: string;
  imageUrl?: string;
  /** Group score, 0..1 — higher means less likely to annoy anyone listening. */
  score: number;
  /** Why this track was picked, e.g. "Rich and Alex queue Royal Blood". */
  because: string;
}

/** What the autoplay coordinator decided this round. */
interface AutoplayResult {
  enabled: boolean;
  /** Only the lease holder may act on `enqueue`. */
  leaseHeld: boolean;
  /** The track this client should append to the queue, unattributed. */
  enqueue: DjTrack | null;
  /** The three picks every client previews below the queue. */
  upcoming: DjTrack[];
  /** URI of the filler parked at the tail — user picks go in front of it. */
  fillerUri: string | null;
  error?: string;
}

interface AutoplayRequestBody {
  groupId: string;
  clientId: string;
  queueUris: string[];
  /** Name-based identity per queue entry, index-aligned with queueUris. */
  queueKeys?: string[];
  nowPlayingUri?: string | null;
  nowPlayingKey?: string | null;
  /** Zero-based playhead position — the reliable signal. */
  nowPlayingIndex?: number | null;
  users?: string[];
  setEnabled?: boolean;
}

/** Who Graph says is in the office, and how confident that is. */
interface OfficePresence {
  inOffice: string[];
  /**
   * 'sensed'       — Teams detected them on the office network (trusted)
   * 'rostered'     — their Outlook working pattern claims office today
   * 'availability' — merely online; includes people working from home
   * 'none'         — no presence available; fall back to queue inference
   */
  basis: 'sensed' | 'rostered' | 'availability' | 'none';
  /** How many of `inOffice` Teams detected on the network, rather than rostered. */
  observed: number;
  detail: Array<{ userId: string; availability?: string; workLocationType?: string; source?: string }>;
  error?: string;
}

/** A ranked act, plus what the office has already played by them. */
interface DjArtist {
  artist: string;
  artistId?: string;
  serviceId?: string;
  accountId?: string;
  imageUrl?: string;
  score: number;
  because: string;
  /** "trackName||artist" for each track by this act already in the history. */
  heardTrackKeys: string[];
}

interface DjSetResult {
  tracks: DjTrack[];
  /** Acts to browse for music the office has genuinely never played. */
  artists: DjArtist[];
  /** Listeners the set was built for, after dropping anyone with no history. */
  listeners: string[];
  artistsConsidered: number;
  /** True when the room was inferred from recent activity rather than supplied. */
  inferredListeners: boolean;
  error?: string;
}

/**
 * What the IPC bridge actually hands back. A failed fetch returns `{ error }`
 * alone, so every field is optional here — `useDjSet` fills the gaps once so
 * components never touch a half-shaped object.
 */
type DjSetResponse = Partial<DjSetResult> & { error?: string };

interface EntraUser {
  oid: string;
  name: string;
  email: string;
}

interface UserProfile {
  id: string;
  imageUrl?: string | null;
  updatedAt?: number;
}

interface UserSummary {
  userId: string;
  lastQueued: number;
  imageUrl?: string | null;
}

interface PlaylistTrack {
  uri: string;
  trackName: string;
  artist: string;
  albumName?: string;
  imageUrl?: string | null;
  serviceId: string;
  accountId: string;
  addedBy: string;
  addedAt: number;
}

interface PlaylistMeta {
  id: string;
  name: string;
  owner: string;
  isPublic: boolean;
  isFavourites?: boolean;
  memberCount: number;
  trackCount: number;
  updatedAt: number;
  imageUrl?: string | null;
}

interface PlaylistDoc extends PlaylistMeta {
  members: string[];
  tracks: PlaylistTrack[];
  createdAt: number;
  imageUrl?: string | null;
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
  seek: (positionMillis: number) => Promise<unknown>;
  reorderQueue: (fromIndices: number[], toIndex: number, queueLength: number) => Promise<unknown>;
  removeFromQueue: (indices: number[]) => Promise<unknown>;
  clearQueue: () => Promise<unknown>;
  openWsMonitor: () => Promise<void>;
  openHttpMonitor: () => Promise<void>;
  openDevTools: () => Promise<void>;
  openMiniPlayer: () => Promise<void>;
  closeMiniPlayer: () => Promise<void>;
  // Attribution / office presence
  getDisplayName: () => Promise<string | null>;
  setDisplayName: (name: string) => Promise<{ error: string } | null>;
  getQueueDockedWidth: () => Promise<number>;
  setQueueDockedWidth: (width: number) => Promise<void>;
  publishQueued: (item: {
    eventType: 'track' | 'album';
    uri: string;
    trackName: string;
    artist: string;
    serviceId?: string;
    accountId?: string;
    artistId?: string;
    album?: string;
    albumId?: string;
    imageUrl?: string;
  }) => Promise<void>;
  fetchRecentlyPlayed: (userId: string) => Promise<RecentlyPlayedData | null>;
  fetchDjSet: (opts?: { users?: string[]; limit?: number; excludeUris?: string[] }) => Promise<DjSetResponse>;
  fetchOfficePresence: () => Promise<OfficePresence>;
  djAutoplay: (body: AutoplayRequestBody) => Promise<AutoplayResult>;
  fetchStats: (period: string, userId?: string, count?: number) => Promise<StatsResult>;
  fetchDailyGame: (date?: string) => Promise<GameFetchResult>;
  submitGameScore: (input: {
    gameId: string;
    userName: string;
    guesses: { main: Array<'left' | 'right'>; bonus: string[] };
  }) => Promise<GameSubmitResult>;
  fetchGameLeaderboard: (date?: string) => Promise<GameLeaderboardResult>;
  fetchGameDates: (userName: string) => Promise<GameDatesResult>;
  fetchMyScore: (gameId: string, userName: string) => Promise<GameMyScoreResult>;
  fetchGameStats: (date?: string) => Promise<GameStatsResult>;
  refreshAttribution: () => Promise<void>;
  onAttributionMap: (cb: (map: AttributionMap) => void) => Unsubscribe;
  onAttributionEvent: (cb: (event: AttributionEvent) => void) => Unsubscribe;
  geniusDescription: (trackName: string, artistName: string) => Promise<GeniusDomNode | null>;
  geniusArtist: (artistName: string, trackHint?: string) => Promise<GeniusArtistInfo | null>;
  geniusAlbumYear: (albumName: string, artistName: string) => Promise<number | null>;
  /** Fire-and-forget telemetry event routed through the main process. No-op when App Insights is not configured. */
  trackEvent: (name: string, properties?: Record<string, string>) => Promise<void>;
  minimizeWindow:    () => Promise<void>;
  maximizeWindow:    () => Promise<void>;
  closeWindow:       () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximized: (cb: (maximized: boolean) => void) => Unsubscribe;
  onUpdateDownloaded: (cb: (version: string) => void) => Unsubscribe;
  installUpdate: () => Promise<void>;
  ensureFavourites: () => Promise<PlaylistDoc>;
  fetchPlaylists: (filter: { owner?: string; member?: string }) => Promise<PlaylistMeta[]>;
  fetchPlaylist: (id: string) => Promise<PlaylistDoc>;
  createPlaylist: (name: string, isPublic: boolean) => Promise<PlaylistDoc>;
  updatePlaylist: (playlistId: string, patch: { name?: string; isPublic?: boolean }) => Promise<PlaylistDoc>;
  deletePlaylist: (playlistId: string) => Promise<{ ok?: boolean; error?: string }>;
  addTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => Promise<PlaylistDoc>;
  removeTrackFromPlaylist: (playlistId: string, uri: string) => Promise<PlaylistDoc>;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => Promise<PlaylistDoc>;
  joinPlaylist: (playlistId: string, action: 'join' | 'leave') => Promise<PlaylistMeta>;
  uploadPlaylistImage: (playlistId: string, data: ArrayBuffer, mimeType: string, userName: string) => Promise<{ imageUrl: string } | { error: string }>;
  fetchUsers: (includeSelf?: boolean) => Promise<UserSummary[]>;
  fetchUserProfile: (userName: string) => Promise<UserProfile | null>;
  uploadProfileImage: (userName: string, data: ArrayBuffer, mimeType: string) => Promise<{ imageUrl: string } | { error: string }>;
  getEntraUser: () => Promise<EntraUser | null>;
  entraSignOut: () => Promise<void>;
  entraReLogin: () => Promise<void>;
  onEntraReady: (cb: (user: EntraUser) => void) => Unsubscribe;
  renameUser: (oldName: string, newName: string) => Promise<{ ok?: boolean; error?: string }>;
}

interface Window {
  sonos: SonosPreload;
}
