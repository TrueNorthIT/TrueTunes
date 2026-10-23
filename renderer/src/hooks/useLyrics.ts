import { useQuery } from '@tanstack/react-query';
import { primaryArtistName } from '../lib/homeData';

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

/** Lines show a touch early so the highlight lands as the word is sung. */
const LYRIC_LEAD_MS = 250;

/** Elapsed time used to pick the active line, from the player's progress percentage. */
export function lyricElapsedMs(progressPct: number, durationMs: number): number {
  return Math.round((progressPct / 100) * durationMs) + LYRIC_LEAD_MS;
}

/** Index of the last line whose timestamp has passed, or -1 before the first line. */
export function activeLyricIndex(lines: LyricLine[], elapsedMs: number): number {
  return lines.reduce((acc, l, i) => (l.timeMs <= elapsedMs ? i : acc), -1);
}

type LyricsData = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
} | null;

/** Same song under different spellings (queue title, playback title, track details) must share one key. */
function normTrack(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+-\s+(?:\d{4}\s+)?(?:remaster|mono|stereo|single version|radio edit|live).*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type LyricsResult = NonNullable<LyricsData>;
const hasLyrics = (r: LyricsResult & { duration?: number }) => !!(r.syncedLyrics || r.plainLyrics || r.instrumental);

async function getLyrics(params: URLSearchParams): Promise<LyricsResult | null> {
  const res = await fetch(`https://lrclib.net/api/get?${params}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

/** Best search hit: synced first, then closest duration (within 3s when the duration is known). */
async function searchLyrics(track: string, artist: string, durationMs: number): Promise<LyricsResult | null> {
  const res = await fetch(
    `https://lrclib.net/api/search?${new URLSearchParams({ track_name: track, artist_name: artist })}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  const hits = ((await res.json()) as (LyricsResult & { duration?: number })[]).filter(hasLyrics);
  const secs = durationMs / 1000;
  const near = secs ? hits.filter((h) => h.duration == null || Math.abs(h.duration - secs) <= 3) : hits;
  const dist = (h: { duration?: number }) => (secs && h.duration != null ? Math.abs(h.duration - secs) : 0);
  near.sort((x, y) => Number(!!y.syncedLyrics) - Number(!!x.syncedLyrics) || dist(x) - dist(y));
  return near[0] ?? null;
}

/**
 * Album and duration are hints only, not part of the key: the queue, the player and track
 * details spell one song differently, and each distinct key used to cache its own 404.
 */
export function lyricsQueryOptions(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
  albumName: string | null | undefined,
  durationMs: number
) {
  const track = trackName ?? '';
  const artist = primaryArtistName(artistName ?? '');
  return {
    queryKey: ['lyrics', normTrack(trackName), artist.toLowerCase()] as const,
    queryFn: async (): Promise<LyricsData> => {
      const p = new URLSearchParams({ track_name: track, artist_name: artist });
      if (durationMs) p.set('duration', String(Math.round(durationMs / 1000)));
      if (albumName) {
        const withAlbum = new URLSearchParams(p);
        withAlbum.set('album_name', albumName);
        const hit = await getLyrics(withAlbum);
        if (hit) return hit;
      }
      return (await getLyrics(p)) ?? (await searchLyrics(track, artist, durationMs));
    },
    staleTime: Infinity,
    // LRCLIB has brief outages (503) and rate-limits (429). Retry those and network errors with
    // backoff so one blip doesn't hide a song's lyrics; other 4xx won't change, so don't retry.
    retry: (failures: number, err: Error) => failures < 3 && !/LRCLIB 4(?!29)\d\d/.test(err.message),
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    enabled: !!normTrack(trackName) && !!artist,
  };
}

export function useLyrics(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
  albumName: string | null | undefined,
  durationMs: number
) {
  const { data, isLoading } = useQuery(lyricsQueryOptions(trackName, artistName, albumName, durationMs));

  return {
    lines: data?.syncedLyrics ? parseLrc(data.syncedLyrics) : [],
    plainLyrics: data?.plainLyrics ?? null,
    isLoading,
    isInstrumental: data?.instrumental ?? false,
    notFound: data === null && !isLoading,
  };
}
