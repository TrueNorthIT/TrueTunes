export interface AlbumResponse {
  type: string;
  id: string;
  resource: Resource;
  title: string;
  subtitle: string;
  images: Images;
  isExplicit: boolean;
  providersInfo: any[];
  actions: string[];
  customActions: any[];
  sections: Sections;
  tracks: Tracks;
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

interface Sections {
  items: any[];
}

interface Tracks {
  items: Item[];
  total: number;
  fastScrollUri: string;
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
  ordinal: number;
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

interface ProviderInfo {
  id: string;
  slug: string;
  name: string;
}
