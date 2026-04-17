export interface GetPlaybackExtendedResponse {
  namespace?: string;
  householdId?: string;
  locationId?: string;
  groupId?: string;
  apiVersion?: number;
  name?: string;
  type?: string;
  _objectType?: string;
  playback?: Playback;
  metadata?: Metadata;
}

interface Playback {
  _objectType: string;
  playbackState: string;
  isDucking: boolean;
  queueVersion: string;
  queueId: string;
  itemId: string;
  positionMillis: number;
  previousItemId: string;
  previousPositionMillis: number;
  playModes: PlayModes;
  availablePlaybackActions: AvailablePlaybackActions;
}

interface PlayModes {
  _objectType: string;
  repeat: boolean;
  repeatOne: boolean;
  shuffle: boolean;
  crossfade: boolean;
}

interface AvailablePlaybackActions {
  _objectType: string;
  canPlay: boolean;
  canSkip: boolean;
  canSkipBack: boolean;
  canSkipToPrevious: boolean;
  canSeek: boolean;
  canPause: boolean;
  canStop: boolean;
  canRepeat: boolean;
  canRepeatOne: boolean;
  canCrossfade: boolean;
  canShuffle: boolean;
}

interface Metadata {
  _objectType: string;
  container: Container;
  currentItem: CurrentItem;
  nextItem: NextItem;
}

interface Container {
  _objectType: string;
  type: string;
  id: Id;
  service: Service;
  images: any[];
}

interface Id {
  _objectType: string;
  serviceId: string;
  objectId: string;
  accountId: string;
}

interface Service {
  _objectType: string;
  name: string;
  id: string;
  images: any[];
}

interface CurrentItem {
  _objectType: string;
  track: Track;
  policies: Policies;
}

interface Track {
  _objectType: string;
  type: string;
  name: string;
  imageUrl: string;
  images: Image[];
  album: Album;
  artist: Artist;
  id: Id2;
  service: Service2;
  durationMillis: number;
  quality: Quality;
}

interface Image {
  _objectType: string;
  url: string;
}

interface Album {
  _objectType: string;
  name: string;
}

interface Artist {
  _objectType: string;
  name: string;
}

interface Id2 {
  _objectType: string;
  serviceId: string;
  objectId: string;
  accountId: string;
}

interface Service2 {
  _objectType: string;
  name: string;
  id: string;
  images: any[];
}

interface Quality {
  _objectType: string;
}

interface Policies {
  _objectType: string;
}

interface NextItem {
  _objectType: string;
  track: Track2;
  policies: Policies2;
}

interface Track2 {
  _objectType: string;
  type: string;
  name: string;
  imageUrl: string;
  images: Image2[];
  album: Album2;
  artist: Artist2;
  id: Id3;
  service: Service3;
  durationMillis: number;
  quality: Quality2;
}

interface Image2 {
  _objectType: string;
  url: string;
}

interface Album2 {
  _objectType: string;
  name: string;
}

interface Artist2 {
  _objectType: string;
  name: string;
}

interface Id3 {
  _objectType: string;
  serviceId: string;
  objectId: string;
  accountId: string;
}

interface Service3 {
  _objectType: string;
  name: string;
  id: string;
  images: any[];
}

interface Quality2 {
  _objectType: string;
}

interface Policies2 {
  _objectType: string;
}
