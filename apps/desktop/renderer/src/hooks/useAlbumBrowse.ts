import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/sonosApi";
import type { SonosItem, SonosItemId } from "../types/sonos";
import { AlbumResponse } from "../types/AlbumResponse";
import { decodeDefaults } from "../lib/itemHelpers";

function cleanArtistId(id: string): string {
  return id.replace(/^srn:content:audio:artist:/, '').replace(/#.*$/, '');
}

export interface AlbumTrack {
  title: string;
  ordinal: number;
  durationSeconds: number;
  artUrl: string | null;
  id: SonosItemId;
  artists: string[];
  /** Only populated for playlist tracks — carries objectId so artist is navigable. */
  artistObjects?: Array<{ name: string; objectId: string }>;
  /** Album/container name and id — decoded from track defaults, populated for playlist tracks. */
  albumName: string | null;
  albumId:   string | null;
  explicit: boolean;
  raw: SonosItem;
}

export interface AlbumData {
  title: string;
  artist: string;
  artUrl: string | null;
  tracks: AlbumTrack[];
  totalTracks: number;
  artistItem: SonosItem | null;
}

type RawTrack = NonNullable<AlbumResponse["tracks"]>["items"][number];

function parseTrack(track: RawTrack): AlbumTrack {
  return {
    title:           track.title ?? "",
    ordinal:         track.ordinal ?? 0,
    durationSeconds: Number(track.duration ?? 0),
    artUrl:          track.images?.tile1x1 ?? null,
    id:              (track.resource?.id ?? {}) as SonosItemId,
    artists:         track.artists?.map((a) => a.name) ?? [],
    artistObjects:   track.artists?.filter((a) => a.id).map((a) => ({ name: a.name, objectId: cleanArtistId(a.id as string) })),
    albumName:       null,
    albumId:         null,
    explicit:        track.isExplicit ?? false,
    raw:             track as unknown as SonosItem,
  };
}

function parseAlbum(data: AlbumResponse): AlbumData {
  const title  = data.title ?? "";
  const artist = data.subtitle ?? "";
  const artUrl = data.images?.tile1x1 ?? null;

  // Decode album defaults to find the artist's objectId
  const decoded   = decodeDefaults(data.resource?.defaults);
  const artistId  = decoded?.["artistId"] as string | undefined;
  const serviceId = data.resource?.id?.serviceId;
  const accountId = data.resource?.id?.accountId;
  const artistItem: SonosItem | null =
    artistId && serviceId && accountId
      ? ({
          type: "ARTIST",
          title: (decoded?.["artist"] as string | undefined) ?? artist,
          resource: {
            type: "ARTIST",
            id: { objectId: artistId, serviceId, accountId },
            defaults: undefined,
          },
        } as SonosItem)
      : null;

  const rawTracks   = data.tracks?.items ?? [];
  const totalTracks = data.tracks?.total ?? rawTracks.length;
  const tracks      = rawTracks.map(parseTrack);

  return { title, artist, artUrl, tracks, totalTracks, artistItem };
}

export function albumQueryOptions(
  albumId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
) {
  return {
    queryKey: ["album", albumId] as const,
    queryFn: async () => {
      const r = await api.browse.album(albumId!, { serviceId, accountId, defaults, muse2: true, count: 50 });
      if (r.error) throw new Error(r.error);
      const parsed = parseAlbum(r.data as AlbumResponse);

      // Fetch remaining pages if the album has more than 50 tracks
      let allTracks = [...parsed.tracks];
      let offset = allTracks.length;
      while (offset < parsed.totalTracks) {
        const page = await api.browse.album(albumId!, { serviceId, accountId, defaults, muse2: true, count: 50, offset });
        if (page.error) break;
        const newItems = (page.data as AlbumResponse).tracks?.items ?? [];
        if (!newItems.length) break;
        allTracks = [...allTracks, ...newItems.map(parseTrack)];
        offset += newItems.length;
      }

      return { ...parsed, tracks: allTracks };
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  };
}

export function useAlbumBrowse(
  albumId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
) {
  return useQuery({
    ...albumQueryOptions(albumId, serviceId, accountId, defaults),
    enabled: !!(albumId && serviceId && accountId),
  });
}
