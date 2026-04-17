// Shared TypeScript interfaces for Sonos API response shapes

export interface GroupInfo {
  id: string;            // full groupId with session suffix
  coordinatorId: string; // bare RINCON ID
  name: string;
  playerIds: string[];
}

export interface SonosItemId {
  objectId?: string;
  serviceId?: string;
  accountId?: string;
  serviceName?: string;
  serviceNameId?: string;
}

export interface SonosArtist {
  name: string;
  id?: SonosItemId;
  type?: string;
  images?: Array<{ url: string }>;
}

export interface SonosAlbum {
  name: string;
  id?: SonosItemId;
}

export interface SonosTrack {
  name?: string;
  title?: string;
  type?: string;
  imageUrl?: string;
  images?: Array<{ url: string }>;
  album?: SonosAlbum;
  artist?: SonosArtist | string;
  primaryArtist?: SonosArtist | string;
  id?: SonosItemId;
  durationMillis?: number;
  explicit?: boolean;
}

// Generic item shape covering history, search results, browse results
export interface SonosItem {
  name?: string;
  title?: string;
  type?: string;
  imageUrl?: string;
  images?: Array<{ url: string }>;
  artist?: SonosArtist | string;
  primaryArtist?: SonosArtist | string;
  artists?: SonosArtist[];
  album?: SonosAlbum | string;
  description?: string;
  track?: SonosTrack;
  resource?: {
    name?: string;
    artist?: SonosArtist | string;
    type?: string;
    id?: SonosItemId;
    defaults?: string;
  };
  id?: SonosItemId | string;
  serviceId?: string;
  accountId?: string;
  objectId?: string;
  summary?: { content?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Queue item as returned by getQueueResources
export interface QueueItem extends SonosItem {
  track?: SonosTrack;
}

// Art patch applied asynchronously after nowPlaying API calls
export interface ArtPatch {
  artUrl?: string;
  subtitle?: string;
}

// Shape of the extendedPlaybackStatus WS payload
export interface PlaybackPayload {
  playback?: {
    playbackState?: string;
    positionMillis?: number;
    itemId?: string;
    queueId?: string;
    queueVersion?: string;
    playModes?: {
      shuffle?: boolean;
      repeat?: boolean;
      repeatOne?: boolean;
      crossfade?: boolean;
    };
  };
  metadata?: {
    currentItem?: {
      track?: SonosTrack;
    };
    nextItem?: {
      track?: SonosTrack;
    };
    container?: {
      name?: string;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
