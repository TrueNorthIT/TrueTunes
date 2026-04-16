export interface ServiceSearch {
  info: Info;
  errors: any[];
  ALBUMS: Albums;
  ARTISTS: Artists;
  PLAYLISTS: Playlists;
  PODCASTS: Podcasts;
  TRACKS: Tracks;
  resourceOrder: string[];
  externalLinks: any[];
}

interface Info {
  count: number;
}

interface Albums {
  info: Info2;
  resources: Resource[];
}

interface Info2 {
  count: number;
  offset: number;
  pageSize: number;
}

interface Resource {
  id: Id;
  name: string;
  type: string;
  artists: Artist[];
  playable: boolean;
  images: Image[];
  explicit: boolean;
  summary: Summary;
  enumerable: boolean;
  defaults: string;
}

interface Id {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Artist {
  name: string;
  id: Id2;
  type: string;
  playable: boolean;
  images: any[];
}

interface Id2 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Image {
  url: string;
}

interface Summary {
  content: string;
}

interface Artists {
  info: Info3;
  resources: Resource2[];
}

interface Info3 {
  count: number;
  offset: number;
  pageSize: number;
}

interface Resource2 {
  id: Id3;
  name: string;
  type: string;
  playable: boolean;
  images: Image2[];
  bio: Bio;
  defaults: string;
}

interface Id3 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Image2 {
  url: string;
}

interface Bio {
  content: string;
}

interface Playlists {
  info: Info4;
  resources: Resource3[];
}

interface Info4 {
  count: number;
  offset: number;
  pageSize: number;
}

interface Resource3 {
  id: Id4;
  name: string;
  type: string;
  images: Image3[];
  playable: boolean;
  explicit: boolean;
  enumerable: boolean;
  readOnly: boolean;
  renameable: boolean;
  userContent: boolean;
  summary: Summary2;
  owner: Owner;
  defaults: string;
}

interface Id4 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Image3 {
  url: string;
}

interface Summary2 {
  content: string;
}

interface Owner {
  id: Id5;
  name: string;
  images: any[];
  type: string;
}

interface Id5 {
  objectId: string;
  serviceId: string;
  accountId: string;
  type: string;
}

interface Podcasts {
  info: Info5;
  resources: Resource4[];
}

interface Info5 {
  count: number;
  offset: number;
  pageSize: number;
}

interface Resource4 {
  id: Id6;
  name: string;
  type: string;
  hosts: any[];
  images: Image4[];
  playable: boolean;
  explicit: boolean;
  summary: Summary3;
  enumerable: boolean;
  producers: Producer[];
  defaults: string;
}

interface Id6 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Image4 {
  url: string;
}

interface Summary3 {
  content: string;
}

interface Producer {
  name: string;
  id: Id7;
  type: string;
  playable: boolean;
}

interface Id7 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Tracks {
  info: Info6;
  resources: Resource5[];
}

interface Info6 {
  count: number;
  offset: number;
  pageSize: number;
}

interface Resource5 {
  id: Id8;
  name: string;
  type: string;
  artists: Artist2[];
  explicit: boolean;
  playable: boolean;
  summary: Summary4;
  images: Image5[];
  ordinal: number;
  durationMs: number;
  defaults: string;
  container?: Container;
}

interface Id8 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Artist2 {
  name: string;
  id: Id9;
  type: string;
  playable: boolean;
}

interface Id9 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Summary4 {
  content: string;
}

interface Image5 {
  url: string;
}

interface Container {
  id: Id10;
  name: string;
  type: string;
  artists: Artist3[];
  images: Image6[];
  playable: boolean;
}

interface Id10 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Artist3 {
  name: string;
  id: Id11;
  type: string;
  playable: boolean;
}

interface Id11 {
  objectId: string;
  serviceId: string;
  accountId: string;
  serviceName: string;
  serviceNameId: string;
}

interface Image6 {
  url: string;
}
