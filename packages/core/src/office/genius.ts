// Ported from TrueTunes/src/main.ts (genius:description / genius:artist / genius:albumYear).
// Debug-window plumbing dropped. Every failure or a missing key resolves to null.

export interface GeniusDeps {
  getKey: () => string | undefined;
  fetchImpl?: typeof fetch;
  log?: (...a: unknown[]) => void;
}

const API = 'https://api.genius.com';

export function createGenius(deps: GeniusDeps) {
  const doFetch: typeof fetch = deps.fetchImpl ?? ((...a) => fetch(...a));
  const log = deps.log ?? (() => {});

  /** Returns the response body text, or null on non-2xx. */
  async function get(path: string, key: string): Promise<string | null> {
    const res = await doFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
    const body = await res.text();
    return res.ok ? body : null;
  }

  async function description(trackName: string, artistName: string): Promise<unknown> {
    const key = deps.getKey();
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping');
      return null;
    }
    try {
      const searchBody = await get(`/search?q=${encodeURIComponent(`${trackName} ${artistName}`)}`, key);
      if (searchBody === null) return null;
      const searchData = JSON.parse(searchBody) as { response: { hits: { result: { id: number } }[] } };
      const songId = searchData.response?.hits?.[0]?.result?.id;
      if (!songId) return null;

      const songBody = await get(`/songs/${songId}`, key);
      if (songBody === null) return null;
      const songData = JSON.parse(songBody) as { response: { song: { description: { dom: unknown } } } };
      return songData.response?.song?.description?.dom ?? null;
    } catch (err) {
      log(`[genius] error: ${err}`);
      return null;
    }
  }

  async function artist(artistName: string, trackHint?: string): Promise<unknown> {
    const key = deps.getKey();
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping artist lookup');
      return null;
    }
    try {
      const q = trackHint ? `${trackHint} ${artistName}` : artistName;
      const searchBody = await get(`/search?q=${encodeURIComponent(q)}`, key);
      if (searchBody === null) return null;

      type SearchHit = { result: { primary_artist: { id: number; name: string } } };
      const searchData = JSON.parse(searchBody) as { response: { hits: SearchHit[] } };
      const hits = searchData.response?.hits ?? [];
      const artistNameLower = artistName.toLowerCase();
      const hit = hits.find((h) => h.result.primary_artist.name.toLowerCase().includes(artistNameLower)) ?? hits[0];
      const artistId = hit?.result?.primary_artist?.id;
      if (!artistId) return null;

      const artistBody = await get(`/artists/${artistId}`, key);
      if (artistBody === null) return null;

      type ArtistPayload = {
        response: {
          artist: {
            description: { dom: unknown };
            alternate_names: string[];
            image_url: string | null;
            header_image_url: string | null;
            instagram_name: string | null;
            twitter_name: string | null;
          };
        };
      };
      const a = (JSON.parse(artistBody) as ArtistPayload).response?.artist;
      if (!a) return null;

      return {
        description: a.description?.dom ?? null,
        alternateNames: a.alternate_names ?? [],
        imageUrl: a.image_url ?? null,
        headerImageUrl: a.header_image_url ?? null,
        instagram: a.instagram_name ?? null,
        twitter: a.twitter_name ?? null,
      };
    } catch (err) {
      log(`[genius] artist error: ${err}`);
      return null;
    }
  }

  async function albumYear(albumName: string, artistName: string): Promise<number | null> {
    const key = deps.getKey();
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping albumYear');
      return null;
    }
    try {
      const searchBody = await get(`/search?q=${encodeURIComponent(`${albumName} ${artistName}`)}`, key);
      if (searchBody === null) return null;

      type Hit = {
        result: {
          primary_artist: { name: string } | null;
          release_date_components: { year: number | null } | null;
        };
      };
      const searchData = JSON.parse(searchBody) as { response: { hits: Hit[] } };
      const hits = searchData.response?.hits ?? [];
      const lower = artistName.toLowerCase();
      const hit = hits.find((h) => h.result.primary_artist?.name?.toLowerCase().includes(lower)) ?? hits[0];
      return hit?.result?.release_date_components?.year ?? null;
    } catch (err) {
      log(`[genius] albumYear error: ${err}`);
      return null;
    }
  }

  return { description, artist, albumYear };
}
