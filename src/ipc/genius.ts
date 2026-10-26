// Genius lookups (official API with a token, plus the unofficial genius.com web API).

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'crypto';
import { albumBaseTitle, geniusHasText, pickAlbumHits, pickArtistHit } from '../genius-match';
import { state, log } from '../state';

// ponytail: genius.com/api is Genius's unofficial web API (no token); it may change or vanish without notice.
/** A JSON GET against genius.com/api, logged to the HTTP debug window. Throws on a non-2xx. */
function geniusWebGet(operationId: string) {
  return async (url: string): Promise<unknown> => {
    const id = randomUUID();
    const ts = Date.now();
    state.httpDebugWin?.webContents.send('http:req', { id, ts, operationId, method: 'GET', url, headers: {} });
    const res = await fetch(url);
    const body = await res.text();
    state.httpDebugWin?.webContents.send('http:res', {
      id,
      status: res.status,
      statusText: String(res.status),
      headers: {},
      body,
      durationMs: Date.now() - ts,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return JSON.parse(body);
  };
}

export function register(): void {
  // ─── Genius API ───────────────────────────────────────────────────────────────

  ipcMain.handle('genius:description', async (_: IpcMainInvokeEvent, trackName: string, artistName: string) => {
    const key = process.env.GENIUS_ACCESS_TOKEN;
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping');
      return null;
    }

    const debugReq = (id: string, url: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:req', {
        id,
        ts,
        operationId: 'genius',
        method: 'GET',
        url,
        headers: { Authorization: 'Bearer ***' },
      });
    const debugRes = (id: string, status: number, body: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:res', {
        id,
        status,
        statusText: String(status),
        headers: {},
        body,
        durationMs: Date.now() - ts,
      });

    try {
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(`${trackName} ${artistName}`)}`;
      const searchId = randomUUID();
      const searchTs = Date.now();
      debugReq(searchId, searchUrl, searchTs);
      const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${key}` } });
      const searchBody = await searchRes.text();
      debugRes(searchId, searchRes.status, searchBody, searchTs);
      if (!searchRes.ok) return null;
      const searchData = JSON.parse(searchBody) as { response: { hits: { result: { id: number } }[] } };
      const songId = searchData.response?.hits?.[0]?.result?.id;
      if (!songId) return null;

      const songUrl = `https://api.genius.com/songs/${songId}`;
      const songId2 = randomUUID();
      const songTs = Date.now();
      debugReq(songId2, songUrl, songTs);
      const songRes = await fetch(songUrl, { headers: { Authorization: `Bearer ${key}` } });
      const songBody = await songRes.text();
      debugRes(songId2, songRes.status, songBody, songTs);
      if (!songRes.ok) return null;
      const songData = JSON.parse(songBody) as { response: { song: { description: { dom: unknown } } } };
      return songData.response?.song?.description?.dom ?? null;
    } catch (err) {
      log(`[genius] error: ${err}`);
      return null;
    }
  });

  ipcMain.handle('genius:artist', async (_: IpcMainInvokeEvent, artistName: string, trackHint?: string) => {
    const key = process.env.GENIUS_ACCESS_TOKEN;
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping artist lookup');
      return null;
    }

    const debugReq = (id: string, url: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:req', {
        id,
        ts,
        operationId: 'genius:artist',
        method: 'GET',
        url,
        headers: { Authorization: 'Bearer ***' },
      });
    const debugRes = (id: string, status: number, body: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:res', {
        id,
        status,
        statusText: String(status),
        headers: {},
        body,
        durationMs: Date.now() - ts,
      });

    try {
      const q = trackHint ? `${trackHint} ${artistName}` : artistName;
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(q)}`;
      const searchId = randomUUID();
      const searchTs = Date.now();
      debugReq(searchId, searchUrl, searchTs);
      const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${key}` } });
      const searchBody = await searchRes.text();
      debugRes(searchId, searchRes.status, searchBody, searchTs);
      if (!searchRes.ok) return null;

      type SearchHit = { result: { primary_artist: { id: number; name: string } } };
      const searchData = JSON.parse(searchBody) as { response: { hits: SearchHit[] } };
      const hits = searchData.response?.hits ?? [];
      // A near miss is worse than nothing: Genius once handed back Wiley's names and bio for another artist.
      const artistId = pickArtistHit(hits, artistName)?.result.primary_artist.id;
      if (!artistId) return null;

      const artistUrl = `https://api.genius.com/artists/${artistId}`;
      const artistReqId = randomUUID();
      const artistTs = Date.now();
      debugReq(artistReqId, artistUrl, artistTs);
      const artistRes = await fetch(artistUrl, { headers: { Authorization: `Bearer ${key}` } });
      const artistBody = await artistRes.text();
      debugRes(artistReqId, artistRes.status, artistBody, artistTs);
      if (!artistRes.ok) return null;

      type ArtistPayload = {
        response: {
          artist: {
            description: { dom: unknown };
            alternate_names: string[];
            image_url: string | null;
            header_image_url: string | null;
            instagram_name: string | null;
            twitter_name: string | null;
            url: string | null;
          };
        };
      };
      const artistData = JSON.parse(artistBody) as ArtistPayload;
      const a = artistData.response?.artist;
      if (!a) return null;

      return {
        description: a.description?.dom ?? null,
        alternateNames: a.alternate_names ?? [],
        imageUrl: a.image_url ?? null,
        headerImageUrl: a.header_image_url ?? null,
        instagram: a.instagram_name ?? null,
        twitter: a.twitter_name ?? null,
        url: a.url ?? null,
      };
    } catch (err) {
      log(`[genius] artist error: ${err}`);
      return null;
    }
  });

  ipcMain.handle('genius:albumYear', async (_: IpcMainInvokeEvent, albumName: string, artistName: string) => {
    const key = process.env.GENIUS_ACCESS_TOKEN;
    if (!key) {
      log('[genius] GENIUS_ACCESS_TOKEN not set — skipping albumYear');
      return null;
    }

    const debugReq = (id: string, url: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:req', {
        id,
        ts,
        operationId: 'genius:albumYear',
        method: 'GET',
        url,
        headers: { Authorization: 'Bearer ***' },
      });
    const debugRes = (id: string, status: number, body: string, ts: number) =>
      state.httpDebugWin?.webContents.send('http:res', {
        id,
        status,
        statusText: String(status),
        headers: {},
        body,
        durationMs: Date.now() - ts,
      });

    try {
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(`${albumName} ${artistName}`)}`;
      const searchId = randomUUID();
      const searchTs = Date.now();
      debugReq(searchId, searchUrl, searchTs);
      const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${key}` } });
      const searchBody = await searchRes.text();
      debugRes(searchId, searchRes.status, searchBody, searchTs);
      if (!searchRes.ok) return null;

      type Hit = {
        result: {
          primary_artist: { name: string };
          release_date_components: { year: number | null } | null;
        };
      };
      const searchData = JSON.parse(searchBody) as { response: { hits: Hit[] } };
      const hits = (searchData.response?.hits ?? []).filter((h) => h.result.primary_artist);
      // Only this artist's hit: falling back to the first hit gave a stranger's song year (Adele's live single as 2000).
      return pickArtistHit(hits, artistName)?.result?.release_date_components?.year ?? null;
    } catch (err) {
      log(`[genius] albumYear error: ${err}`);
      return null;
    }
  });

  ipcMain.handle('genius:artistAlbums', async (_: IpcMainInvokeEvent, artistName: string) => {
    const get = geniusWebGet('genius:artistAlbums');

    try {
      type Search = { response: { sections: { hits: { result: { id: number; name: string } }[] }[] } };
      const search = (await get(`https://genius.com/api/search/artist?q=${encodeURIComponent(artistName)}`)) as Search;
      const hits = search.response?.sections?.[0]?.hits ?? [];
      const lower = artistName.toLowerCase();
      const artist = (hits.find((h) => h.result.name?.toLowerCase() === lower) ?? hits[0])?.result;
      if (!artist) return [];

      type Albums = {
        response: {
          albums: { name: string; release_date_components: { year: number | null } | null }[];
          next_page: number | null;
        };
      };
      const out: { name: string; year: number | null }[] = [];
      for (let page: number | null = 1, n = 0; page && n < 4; n++) {
        const data = (await get(
          `https://genius.com/api/artists/${artist.id}/albums?per_page=50&page=${page}`
        )) as Albums;
        for (const a of data.response?.albums ?? [])
          out.push({ name: a.name, year: a.release_date_components?.year ?? null });
        page = data.response?.next_page ?? null;
      }
      return out;
    } catch (err) {
      log(`[genius] artistAlbums error: ${err}`);
      return [];
    }
  });

  // The album's own Genius page, by album search (the song search ranks strangers first and its hits carry no album).
  // Exact title first, then another edition of it; only this artist's albums. Null when none matches.
  ipcMain.handle('genius:albumAbout', async (_: IpcMainInvokeEvent, albumName: string, artistName: string) => {
    const get = geniusWebGet('genius:albumAbout');
    try {
      type Search = {
        response: { sections: { hits: { result: { id: number; name: string; artist: { name: string } | null } }[] }[] };
      };
      const q = `${albumBaseTitle(albumName)} ${artistName}`;
      const search = (await get(`https://genius.com/api/search/album?q=${encodeURIComponent(q)}`)) as Search;
      const hits = pickAlbumHits(search.response?.sections?.[0]?.hits ?? [], albumName, artistName).slice(0, 2);

      type Album = {
        response: {
          album: {
            url: string;
            release_date: string | null;
            release_date_for_display: string | null;
            description_annotation: { annotations?: { body?: { dom?: unknown } }[] } | null;
          };
        };
      };
      let fallback: { description: null; releaseDate?: string; url: string } | null = null;
      for (const h of hits) {
        const a = ((await get(`https://genius.com/api/albums/${h.result.id}`)) as Album).response?.album;
        if (!a) continue;
        const releaseDate = a.release_date ?? a.release_date_for_display ?? undefined;
        const dom = a.description_annotation?.annotations?.[0]?.body?.dom;
        // An edition's page is often blank; then the original's description stands in, with its own date and link.
        if (geniusHasText(dom)) return { description: dom, releaseDate, url: a.url };
        fallback ??= { description: null, releaseDate, url: a.url };
      }
      return fallback;
    } catch (err) {
      log(`[genius] albumAbout error: ${err}`);
      return null;
    }
  });
}
