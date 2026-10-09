export interface ArtistResponse {
  type: string;
  id: string;
  resource: Resource;
  title: string;
  images: Images;
  actions: string[];
  customActions: any[];
  sections: Sections;
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
  items: Item[];
}

interface Item {
  id: string;
  type: string;
  href: string;
  items: Item2[];
  total: number;
  fastScrollUri: string;
}

interface Item2 {
  id: string;
  title: string;
  images: Images2;
  actions: string[];
  type: string;
  resource: Resource2;
  isExplicit: boolean;
  subtitle?: string;
  href?: string;
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

interface ProviderInfo {
  id: string;
  slug: string;
  name: string;
}
