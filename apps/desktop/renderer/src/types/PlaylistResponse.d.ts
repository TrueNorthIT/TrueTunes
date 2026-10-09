export interface PlaylistResponse {
  type: string;
  id: string;
  resource: Resource;
  title: string;
  subtitle: string;
  images: Images;
  owner: Owner;
  isEditable: boolean;
  isExplicit: boolean;
  providersInfo: any[];
  actions: string[];
  customActions: any[];
  sections: Sections;
  tracks: Tracks;
  resources: Resources;
  providerInfo: ProviderInfo;
}

interface Resource {
  type: string;
  id: Id;
  defaults: string;
}

interface Id {
  objectId: string;
  serviceId: string;
  accountId: string;
}

interface Images {
  tile1x1: string;
}

interface Owner {
  id: string;
  name: string;
}

interface Sections {
  items: any[];
}

interface Tracks {
  nextUri: string;
  items: Item[];
}

interface Item {
  id: string;
  title: string;
  subtitle: string;
  images: Images2;
  actions: string[];
  type: string;
  resource: Resource2;
  artists: Artist[];
  isExplicit: boolean;
  duration: string;
}

interface Images2 {
  tile1x1: string;
}

interface Resource2 {
  id: Id2;
  type: string;
  defaults: string;
}

interface Id2 {
  objectId: string;
  serviceId: string;
  accountId: string;
}

interface Artist {
  id: string;
  name: string;
}

interface Resources {
  nextUri: string;
  items: Item2[];
}

interface Item2 {
  id: string;
  title: string;
  subtitle: string;
  images: Images3;
  actions: string[];
  type: string;
  resource: Resource3;
  artists: Artist2[];
  isExplicit: boolean;
  duration: string;
}

interface Images3 {
  tile1x1: string;
}

interface Resource3 {
  id: Id3;
  type: string;
  defaults: string;
}

interface Id3 {
  objectId: string;
  serviceId: string;
  accountId: string;
}

interface Artist2 {
  id: string;
  name: string;
}

interface ProviderInfo {
  id: string;
  slug: string;
  name: string;
}
