import { useQuery } from '@tanstack/react-query';

export interface LyricLine {
  timeMs: number;
  text: string;
}

function parseLrc(lrc: string): LyricLine[] {
  return lrc.split('\n').flatMap((line) => {
    const m = line.match(/^\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/);
    if (!m) return [];
    const text = m[3].trim();
    if (!text) return [];
    return [{ timeMs: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text }];
  });
}

type LyricsData = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
} | null;

export function lyricsQueryOptions(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
  albumName: string | null | undefined,
  durationMs: number,
) {
  return {
    queryKey: ['lyrics', trackName, artistName, albumName] as const,
    queryFn: async (): Promise<LyricsData> => {
      const p = new URLSearchParams({ track_name: trackName!, artist_name: artistName! });
      if (albumName) p.set('album_name', albumName);
      if (durationMs) p.set('duration', String(Math.round(durationMs / 1000)));
      const res = await fetch(`https://lrclib.net/api/get?${p}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
    retry: false,
    enabled: !!trackName && !!artistName,
  };
}

export function useLyrics(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
  albumName: string | null | undefined,
  durationMs: number,
) {
  const { data, isLoading } = useQuery(lyricsQueryOptions(trackName, artistName, albumName, durationMs));

  return {
    lines: data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [],
    isLoading,
    isInstrumental: data?.instrumental ?? false,
    notFound: data === null && !isLoading,
  };
}
