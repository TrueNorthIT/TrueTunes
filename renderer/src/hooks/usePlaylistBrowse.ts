import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { decodeDefaults } from '../lib/itemHelpers';
import type { AlbumTrack } from './useAlbumBrowse';
import type { PlaylistResponse } from '../types/PlaylistResponse';

function cleanArtistId(id: string): string {
  return id.replace(/^srn:content:audio:artist:/, '').replace(/#.*$/, '');
}

function parseDuration(d: string | number | undefined): number {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  // ISO 8601: PT3M26S
  const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (m) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  return Number(d) || 0;
}

export function parsePlaylistTracks(data: unknown): AlbumTrack[] {
  const d = data as PlaylistResponse;
  const rawTracks = d.tracks?.items ?? [];

  return rawTracks.map((t, idx) => ({
    title:           t.title ?? '',
    ordinal:         idx + 1,
    durationSeconds: parseDuration(t.duration),
    artUrl:          t.images?.tile1x1 ?? null,
    id:              t.resource?.id ?? {},
    artists:         t.artists?.map(a => a.name) ?? [],
    artistObjects:   t.artists
      ?.filter(a => a.id)
      .map(a => ({ name: a.name, objectId: cleanArtistId(a.id) })),
    albumName:       (decodeDefaults(t.resource?.defaults)?.['containerName'] as string) ?? null,
    explicit:        t.isExplicit ?? false,
    raw:             t as never,
  }));
}

export function usePlaylistBrowse(
  playlistId: string | undefined,
  serviceId:  string | undefined,
  accountId:  string | undefined,
  defaults?:  string,
) {
  return useQuery({
    queryKey: ['playlist', playlistId] as const,
    queryFn: async () => {
      const r = await api.browse.playlist(playlistId!, { serviceId, accountId, defaults, muse2: true });
      if (r.error) throw new Error(r.error);
      return parsePlaylistTracks(r.data);
    },
    staleTime: Infinity,
    gcTime:    60 * 60 * 1000,
    enabled: !!(playlistId && serviceId && accountId),
  });
}
