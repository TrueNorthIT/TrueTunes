import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { fetchImage } from '../lib/imageCache';
import { withArtworkSize } from '../lib/artworkUrl';
import { isArtist, parseServiceSearch } from '../lib/itemHelpers';
import type { AlbumTrack } from './useAlbumBrowse';
import { parsePlaylistTracks } from './usePlaylistBrowse';
import type { ServiceSearch } from '../types/ServiceSearch';
import type { SonosItem, SonosItemId } from '../types/sonos';
import { ArtistResponse } from '../types/ArtistResponse';

export interface ArtistData {
  name: string;
  imageUrl: string | null;
  albums: SonosItem[];
  playlists: SonosItem[]; // Artist Shuffle, Artist Radio (no Top Songs)
  topSongs: AlbumTrack[];
  genius: GeniusArtistInfo | null;
}

function parseArtist(data: ArtistResponse): {
  parsed: Omit<ArtistData, 'topSongs' | 'genius'>;
  topSongsItem: SonosItem | null;
} {
  const name = data.title ?? '';
  const imageUrl = data.images?.tile1x1 ?? null;
  const allItems = (data.sections?.items?.[0]?.items ?? []) as unknown as SonosItem[];

  const topSongsItem =
    allItems.find((i) => i.type === 'ITEM_PLAYLIST' && (i.title as string)?.toLowerCase().includes('top songs')) ??
    null;

  const albums = allItems.filter((i) => i.type === 'ITEM_ALBUM');
  const playlists = allItems.filter((i) => i.type === 'ITEM_PLAYLIST' && i !== topSongsItem);

  return { parsed: { name, imageUrl, albums, playlists }, topSongsItem };
}

export const artistKeys = {
  all: ['artist'] as const,
  /** The full artist: browse plus top songs and the Genius bio. */
  detail: (artistId: string | undefined) => ['artist', artistId] as const,
  /** Just the browse call: name, photo, releases. The full artist and the image tiles both build on it. */
  browse: (artistId: string | undefined) => ['artist-browse', artistId] as const,
  image: (artistId: string | undefined) => ['artist-image', artistId] as const,
};

type ArtistBrowse = ReturnType<typeof parseArtist>;

async function fetchArtistBrowse(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
  fallbackName?: string
): Promise<ArtistBrowse> {
  // First attempt: direct browse with whatever defaults we already have.
  let r = await api.browse.artist(artistId!, { serviceId, accountId, defaults, muse2: true });

  // YT Music (and some other services) need an opaque `defaults` blob to
  // return a populated artist response. Navigation sources like the
  // leaderboard don't capture defaults, so the direct browse comes back
  // with no title/sections. Resolve via search to get a properly-defaulted
  // item, then retry the browse.
  const looksEmpty = !!r.error || !(r.data as ArtistResponse | undefined)?.title;
  if (looksEmpty && fallbackName) {
    const sResp = await api.search.serviceQuery(fallbackName, { count: 20 });
    if (!sResp.error && sResp.data) {
      const items = parseServiceSearch(sResp.data as ServiceSearch);
      const artists = items.filter(isArtist);
      const matched =
        artists.find((a) => {
          const rid = a.resource?.id as SonosItemId | undefined;
          return rid?.objectId === artistId;
        }) ?? artists[0];
      if (matched) {
        const mid = matched.resource?.id as SonosItemId | undefined;
        const mDefaults = matched.resource?.defaults as string | undefined;
        r = await api.browse.artist(mid?.objectId ?? artistId!, {
          serviceId: mid?.serviceId ?? serviceId,
          accountId: mid?.accountId ?? accountId,
          defaults: mDefaults ?? defaults,
          muse2: true,
        });
      }
    }
  }
  if (r.error) throw new Error(r.error);

  const browse = parseArtist(r.data as ArtistResponse);
  // Start the hero photo now, alongside top songs and Genius: the image service takes about two seconds for
  // a size it hasn't served, and waiting for the whole artist query first made the hero the last thing on the page.
  // usePhotoState asks for the same URL and joins this request.
  if (browse.parsed.imageUrl) void fetchImage(withArtworkSize(browse.parsed.imageUrl), true);
  return browse;
}

/** The browse call alone, cached apart from the full artist so a page that only needs releases or the photo can use it. */
export function artistBrowseQueryOptions(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
  fallbackName?: string
) {
  return queryOptions({
    queryKey: artistKeys.browse(artistId),
    queryFn: () => fetchArtistBrowse(artistId, serviceId, accountId, defaults, fallbackName),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

export function artistQueryOptions(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
  fallbackName?: string
) {
  return queryOptions({
    queryKey: artistKeys.detail(artistId),
    queryFn: async ({ client }: { client?: QueryClient } = {}): Promise<ArtistData> => {
      // Join the browse cache, so a page that already holds the browse (the album page, a leaderboard tile) doesn't pay twice.
      const { parsed, topSongsItem } = client
        ? await client.ensureQueryData(artistBrowseQueryOptions(artistId, serviceId, accountId, defaults, fallbackName))
        : await fetchArtistBrowse(artistId, serviceId, accountId, defaults, fallbackName);

      const fetchTopSongs = async (): Promise<AlbumTrack[]> => {
        if (!topSongsItem) return [];
        const rid = topSongsItem.resource?.id as SonosItemId | undefined;
        if (!rid?.objectId || !rid?.serviceId || !rid?.accountId) return [];
        const pr = await api.browse.playlist(rid.objectId, {
          serviceId: rid.serviceId,
          accountId: rid.accountId,
          defaults: topSongsItem.resource?.defaults as string | undefined,
          muse2: true,
        });
        return pr.error ? [] : parsePlaylistTracks(pr.data);
      };

      const [topSongs, genius] = await Promise.all([fetchTopSongs(), window.sonos.geniusArtist(parsed.name)]);

      return { ...parsed, topSongs, genius };
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

export function useArtistBrowse(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
  fallbackName?: string
) {
  return useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults, fallbackName),
    enabled: !!(artistId && serviceId && accountId),
  });
}

// Photos change rarely and a browse is about 57 KB, so remember the URL between sessions.
const IMAGE_CACHE_KEY = 'tt.artistImages.v1';
const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type ImageCache = Record<string, [url: string | null, savedAt: number]>;

function readImageCache(): ImageCache {
  try {
    return JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) ?? '{}') as ImageCache;
  } catch {
    return {};
  }
}

function rememberImage(artistId: string, url: string | null) {
  try {
    const cache = readImageCache();
    cache[artistId] = [url, Date.now()];
    localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable: just refetch next time */
  }
}

// A leaderboard asks for a couple of dozen photos at once. Eight at a time keeps the main process answering without stretching the load out.
const IMAGE_BROWSES_AT_ONCE = 8;
let imageBrowsesRunning = 0;
const imageBrowseQueue: Array<() => void> = [];

async function inImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (imageBrowsesRunning >= IMAGE_BROWSES_AT_ONCE) await new Promise<void>((go) => imageBrowseQueue.push(go));
  imageBrowsesRunning++;
  try {
    return await fn();
  } finally {
    imageBrowsesRunning--;
    imageBrowseQueue.shift()?.();
  }
}

/**
 * Just the artist's photo, for avatar tiles. Sonos has no lighter call than the browse, so this reuses it (the same
 * cache entry the artist page reads, so opening the artist afterwards costs nothing), eight at a time, and
 * remembers the answer between sessions.
 */
export function artistImageQueryOptions(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string
) {
  return queryOptions({
    queryKey: artistKeys.image(artistId),
    queryFn: async ({ client }: { client?: QueryClient } = {}): Promise<string | null> => {
      const saved = readImageCache()[artistId!];
      if (saved && Date.now() - saved[1] < IMAGE_CACHE_TTL_MS) return saved[0];
      const opts = artistBrowseQueryOptions(artistId, serviceId, accountId, defaults);
      try {
        const url = await inImageSlot(async () => {
          const { parsed } = client
            ? await client.ensureQueryData(opts)
            : await fetchArtistBrowse(artistId, serviceId, accountId, defaults);
          return parsed.imageUrl;
        });
        rememberImage(artistId!, url);
        return url;
      } catch {
        return null; // not remembered: try again next session
      }
    },
    enabled: !!(artistId && serviceId && accountId),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function useArtistImage(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string
) {
  return useQuery(artistImageQueryOptions(artistId, serviceId, accountId, defaults));
}
