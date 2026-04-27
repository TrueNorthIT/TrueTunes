export type ProviderId = 'sonos'; // | 'spotify' — extend per new provider

export interface NormalizedTrack {
  id: string;               // provider-scoped unique ID (objectId for Sonos)
  title: string;
  artist: string;
  albumName: string | null;
  albumId: string | null;
  imageUrl: string | null;
  durationMs: number;
  isExplicit: boolean;
  // Kept for attribution / loadContent until those are also abstracted
  serviceId: string | null;
  accountId: string | null;
}

export interface NormalizedQueueItem {
  index: number;
  track: NormalizedTrack;
}

export interface NormalizedPlaybackState {
  status: 'playing' | 'paused' | 'idle';
  isPlaying: boolean; // convenience alias: status === 'playing'
  positionMs: number;
  durationMs: number;
  currentTrack: NormalizedTrack | null;
  shuffle: boolean;
  repeatMode: 'none' | 'one' | 'all';
  queueId: string | null;
  queueVersion: string | null;
  queueItemId: string | null;
}

export interface NormalizedGroup {
  id: string;
  name: string;
  providerId: ProviderId;
  coordinatorId?: string; // Sonos-specific; persists across sessions as the stable device ID
}
