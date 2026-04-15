import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import type { SonosItem, SonosItemId } from '../types/sonos';

export interface AlbumTrack {
  title: string;
  ordinal: number;
  durationSeconds: number;
  artUrl: string | null;
  id: SonosItemId;
  artists: string[];
  explicit: boolean;
  raw: SonosItem;
}

export interface AlbumData {
  title: string;
  artist: string;
  artUrl: string | null;
  tracks: AlbumTrack[];
  totalTracks: number;
}

function parseAlbum(data: unknown): AlbumData {
  const d = data as Record<string, unknown>;
  const title  = (d['title'] ?? d['name'] ?? '') as string;
  const artist = (d['subtitle'] ?? '') as string;
  const images = d['images'] as Record<string, string> | undefined;
  const artUrl = images?.['tile1x1'] ?? null;

  const tracksSection = d['tracks'] as { items?: unknown[]; total?: number } | undefined;
  const rawTracks     = tracksSection?.items ?? [];
  const totalTracks   = tracksSection?.total ?? rawTracks.length;

  const tracks: AlbumTrack[] = rawTracks.map((t: unknown) => {
    const track    = t as Record<string, unknown>;
    const resource = track['resource'] as Record<string, unknown> | undefined;
    const id       = (resource?.['id'] as SonosItemId | undefined) ?? {};
    const imgs     = track['images'] as Record<string, string> | undefined;
    const artists  = (track['artists'] as Array<{ name: string }> | undefined)?.map(a => a.name) ?? [];

    return {
      title:           (track['title'] ?? track['name'] ?? '') as string,
      ordinal:         Number(track['ordinal'] ?? 0),
      durationSeconds: Number(track['duration'] ?? 0),
      artUrl:          imgs?.['tile1x1'] ?? null,
      id,
      artists,
      explicit:        !!(track['explicit'] ?? track['isExplicit']),
      raw: track as SonosItem,
    };
  });

  return { title, artist, artUrl, tracks, totalTracks };
}

export function albumQueryOptions(
  albumId:   string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults:  string | undefined,
) {
  return {
    queryKey: ['album', albumId] as const,
    queryFn:  async () => {
      const r = await api.browse.album(albumId!, { serviceId, accountId, defaults, muse2: true, count: 50 });
      if (r.error) throw new Error(r.error);
      return parseAlbum(r.data);
    },
    staleTime: Infinity,
    gcTime:    60 * 60 * 1000,
  };
}

export function useAlbumBrowse(
  albumId:   string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults:  string | undefined,
) {
  return useQuery({
    ...albumQueryOptions(albumId, serviceId, accountId, defaults),
    enabled: !!(albumId && serviceId && accountId),
  });
}
