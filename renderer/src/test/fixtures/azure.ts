// What the Azure Functions behind the app return (stats, the daily game, profiles, playlists, the DJ and music stats),
// invented from the synthetic catalogue and office. Everything is a pure function of its arguments and the frozen
// clock, so a story renders the same pixels every time.

import { ACCOUNT_ID, ALBUMS, ARTISTS, SERVICE_ID, TRACKS, topSongsOf, albumById, type CatTrack } from './catalog';
import { artUrl } from './art';
import { IN_OFFICE, ME, PEOPLE, names, photoOf } from './people';
import { TODAY_ID, daysAgo, gameIdDaysAgo, hoursAgo, minutesAgo, FROZEN_NOW } from './time';
import { albumArt, artistArt, trackArt } from './sonosShapes';

const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const rotate = <T>(arr: T[], n: number): T[] => {
  const k = arr.length ? ((n % arr.length) + arr.length) % arr.length : 0;
  return [...arr.slice(k), ...arr.slice(0, k)];
};

// ── Users and profiles ──

export function users(includeSelf: boolean): UserSummary[] {
  return PEOPLE.filter((p) => includeSelf || p.name !== ME).map((p, i) => ({
    userId: p.name,
    lastQueued: minutesAgo(5 + i * 47),
    imageUrl: photoOf(p.name) ?? null,
  }));
}

export const userProfile = (name: string): UserProfile | null => {
  const photo = photoOf(name);
  return photo ? { id: name, imageUrl: photo, updatedAt: daysAgo(30) } : { id: name, imageUrl: null };
};

export const presence = (): OfficePresence => ({
  inOffice: IN_OFFICE,
  basis: 'sensed',
  observed: IN_OFFICE.length,
  detail: [],
});

// ── Stats ──

const asStatsTrack = (t: CatTrack, count: number): StatsTrack => ({
  trackName: t.title,
  artist: t.artist,
  serviceId: SERVICE_ID,
  accountId: ACCOUNT_ID,
  artistId: t.artistId,
  album: t.album,
  albumId: t.albumId,
  imageUrl: trackArt(t),
  uri: t.id,
  count,
});

export function stats(period: string, userId?: string, count = 10): StatsResult {
  const scale = period === 'today' ? 1 : period === 'week' ? 3 : 7;
  const seed = userId ? hashStr(userId) : 0;
  const personal = userId ? 0.4 : 1;
  // Counts fall away down a chart, and stay modest whatever the page asked for (`count` only caps the list length).
  const c = (rank: number) => Math.max(1, Math.round((12 - rank * 0.4) * scale * personal));
  const trackPool = rotate(
    TRACKS.filter((_, i) => i % 3 === 0),
    seed
  );
  // The hero album's artist leads every all-time chart, so its pages can say how often the office has queued it.
  const artists = rotate(ARTISTS, userId ? seed : 0);
  const albums = rotate(ALBUMS, userId ? seed : 0);
  return {
    topUsers: PEOPLE.slice(0, 8).map((p, i) => ({ userId: p.name, count: Math.round((40 - i * 4) * scale) })),
    topTracks: trackPool.slice(0, count).map((t, i) => asStatsTrack(t, c(i))),
    topArtists: artists.slice(0, count).map((a, i) => ({
      artist: a.name,
      serviceId: SERVICE_ID,
      accountId: ACCOUNT_ID,
      artistId: a.id,
      imageUrl: artistArt(a),
      count: c(i) + 3,
    })),
    topAlbums: albums.slice(0, count).map((al, i) => ({
      album: al.title,
      albumId: al.id,
      artist: al.artist,
      serviceId: SERVICE_ID,
      accountId: ACCOUNT_ID,
      artistId: al.artistId,
      imageUrl: albumArt(al),
      count: c(i),
    })),
    totalEvents: Math.round(120 * scale * personal),
    periodStart: period === 'today' ? FROZEN_NOW - 12 * 3_600_000 : daysAgo(period === 'week' ? 7 : 400),
  };
}

export function recentlyPlayed(userId: string): RecentlyPlayedData {
  const seed = hashStr(userId);
  const albums = rotate(ALBUMS, seed).slice(0, 5);
  const tracks = rotate(TRACKS, seed + 3).slice(0, 8);
  return {
    tracks: tracks.map((t, i) => ({
      trackName: t.title,
      artist: t.artist,
      serviceId: SERVICE_ID,
      accountId: ACCOUNT_ID,
      artistId: t.artistId,
      album: t.album,
      albumId: t.albumId,
      imageUrl: trackArt(t),
      uri: t.id,
      lastPlayed: hoursAgo(3 + i * 20),
    })),
    artists: rotate(ARTISTS, seed)
      .slice(0, 6)
      .map((a, i) => ({
        artist: a.name,
        serviceId: SERVICE_ID,
        accountId: ACCOUNT_ID,
        artistId: a.id,
        imageUrl: artistArt(a),
        lastPlayed: hoursAgo(5 + i * 26),
      })),
    albums: albums.map((al, i) => ({
      album: al.title,
      artist: al.artist,
      serviceId: SERVICE_ID,
      accountId: ACCOUNT_ID,
      artistId: al.artistId,
      albumId: al.id,
      imageUrl: albumArt(al),
      lastPlayed: hoursAgo(4 + i * 30),
    })),
    availableUsers: names,
  };
}

// ── The DJ ──

export function djSet(): DjSetResult {
  const acts = ARTISTS.slice(0, 7);
  const fansFor = (i: number) => [
    { user: IN_OFFICE[i % IN_OFFICE.length], count: 30 - i * 2 },
    { user: IN_OFFICE[(i + 1) % IN_OFFICE.length], count: 18 - i },
  ];
  return {
    tracks: acts.flatMap((a, i) =>
      topSongsOf(a.id)
        .slice(0, 2)
        .map((t) => ({
          uri: t.id,
          trackName: t.title,
          artist: t.artist,
          serviceId: SERVICE_ID,
          accountId: ACCOUNT_ID,
          albumId: t.albumId,
          imageUrl: trackArt(t),
          score: 0.92 - i * 0.05,
          because: `${fansFor(i)[0].user} queues ${a.name}`,
          fans: fansFor(i),
          trackFans: [fansFor(i)[0]],
        }))
    ),
    artists: acts.map((a, i) => ({
      artist: a.name,
      artistId: a.id,
      serviceId: SERVICE_ID,
      accountId: ACCOUNT_ID,
      imageUrl: artistArt(a),
      score: 0.95 - i * 0.06,
      because: `${fansFor(i)[0].user} and ${fansFor(i)[1].user} queue ${a.name}`,
      fans: fansFor(i),
      // The office has heard each act's first two top songs; the rest are "never played here".
      heardTrackKeys: topSongsOf(a.id)
        .slice(0, 2)
        .map((t) => `${t.title}||${t.artist}`),
    })),
    listeners: IN_OFFICE,
    artistsConsidered: ARTISTS.length,
    inferredListeners: false,
  };
}

// ── Genius ──

const dom = (...paras: string[]): GeniusDomNode => ({
  tag: 'root',
  children: paras.map((p) => ({ tag: 'p', children: [p] })),
});

export const geniusArtist = (name: string): GeniusArtistInfo | null => {
  const ar = ARTISTS.find((a) => a.name === name);
  if (!ar) return null;
  return {
    description: dom(
      `${ar.name} are not a real band. ${ar.blurb}`,
      'This paragraph is placeholder prose for the Storybook mock backend, so the About card has something to lay out.'
    ),
    alternateNames: [],
    imageUrl: artistArt(ar),
    headerImageUrl: null,
    instagram: null,
    twitter: null,
    url: null,
  };
};

export const geniusAlbumAbout = (albumName: string): GeniusAlbumAbout | null => {
  const al = ALBUMS.find((a) => a.title === albumName);
  if (!al) return null;
  return {
    description: dom(
      `${al.title} is an invented record by ${al.artist}, made up for the mock backend.`,
      'It exists so the album page can show its about card beside the tracklist.'
    ),
    releaseDate: `${al.year}-03-14`,
    url: undefined,
  };
};

export const geniusAlbumYear = (albumName: string): number | null =>
  ALBUMS.find((a) => a.title === albumName)?.year ?? null;

export const geniusArtistAlbums = (artistName: string) =>
  (ARTISTS.find((a) => a.name === artistName)?.albums ?? []).map((a) => ({ name: a.title, year: a.year }));

export const geniusTrackDescription = (trackName: string): GeniusDomNode | null =>
  TRACKS.some((t) => t.title === trackName) ? dom(`"${trackName}" is a made-up song with a made-up story.`) : null;

// ── Lyrics (LRCLIB's response, for the fetch the app makes to lrclib.net) ──

const LYRIC_LINES = [
  'The harbour lights are folding in',
  'I left a note beneath the door',
  'We counted every passing train',
  'And called it something close to home',
  'Hold the weather in your hands',
  'Let the water do the rest',
  'Nobody told us where it ends',
  'So we sang until the street went dark',
  'Paper boats along the kerb',
  'A radio in someone else’s room',
  'Every window had a name',
  'Every name a different tune',
  'Carry me to the overpass',
  'Where the morning comes in slow',
  'I will meet you at the lanterns',
  'When the tide is low',
  'Oh, the harbour lights are folding in',
  'And I am nearly home',
  'Nearly home',
  'Nearly home',
];

export function lyrics(durationSec: number) {
  const step = 8;
  const mm = (s: number) => `[${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.00]`;
  return {
    id: 1,
    duration: durationSec,
    instrumental: false,
    plainLyrics: LYRIC_LINES.join('\n'),
    syncedLyrics: LYRIC_LINES.map((l, i) => `${mm(10 + i * step)} ${l}`).join('\n'),
  };
}

// ── Playlists ──

const asPlaylistTrack = (t: CatTrack, i: number, addedBy: string): PlaylistTrack => ({
  uri: t.id,
  trackName: t.title,
  artist: t.artist,
  albumName: t.album,
  imageUrl: trackArt(t),
  serviceId: SERVICE_ID,
  accountId: ACCOUNT_ID,
  addedBy,
  addedAt: daysAgo(10 - (i % 9)),
});

export const ROAD_TRIP_ID = 'pl-friday-drive';

const PLAYLIST_SEEDS: Array<{ id: string; name: string; owner: string; isPublic: boolean; n: number }> = [
  { id: ROAD_TRIP_ID, name: 'Friday Drive Home', owner: ME, isPublic: true, n: 14 },
  { id: 'pl-focus', name: 'Heads-Down Focus', owner: ME, isPublic: false, n: 9 },
  { id: 'pl-sunday', name: 'Sunday Slow Burners', owner: 'Tamsin Okoro-Vale', isPublic: true, n: 11 },
];

export function playlistDoc(id: string): PlaylistDoc | null {
  const fav = id.startsWith('fav-');
  const seed = fav
    ? { id, name: 'Favourites', owner: id.slice(4), isPublic: false, n: 7 }
    : PLAYLIST_SEEDS.find((p) => p.id === id);
  if (!seed) return null;
  const tracks = rotate(TRACKS, hashStr(seed.id)).slice(0, seed.n);
  const members = fav ? [seed.owner] : [seed.owner, ...IN_OFFICE.filter((n) => n !== seed.owner).slice(0, 2)];
  return {
    id: seed.id,
    name: seed.name,
    owner: seed.owner,
    isPublic: seed.isPublic,
    isFavourites: fav,
    memberCount: members.length,
    trackCount: tracks.length,
    updatedAt: daysAgo(2),
    imageUrl: null,
    members,
    tracks: tracks.map((t, i) => asPlaylistTrack(t, i, members[i % members.length])),
    createdAt: daysAgo(40),
  };
}

export function playlists(filter: { owner?: string; member?: string }): PlaylistMeta[] {
  const all = [...PLAYLIST_SEEDS.map((p) => p.id), `fav-${filter.owner ?? filter.member ?? ME}`]
    .map((id) => playlistDoc(id))
    .filter((d): d is PlaylistDoc => !!d);
  const mine = filter.owner
    ? all.filter((d) => d.owner === filter.owner)
    : all.filter((d) => d.members.includes(filter.member ?? '') && d.owner !== filter.member);
  return mine.map(({ members: _m, tracks: _t, createdAt: _c, ...meta }) => meta);
}

// ── Queuedle ──

const GAME_ITEMS = (() => {
  const items: GameItem[] = [];
  const pick = <T>(arr: T[], n: number) => arr[n % arr.length];
  for (let i = 0; i < 11; i++) {
    const cat: GameItemCategory = i % 3 === 0 ? 'track' : i % 3 === 1 ? 'artist' : 'album';
    const t = pick(TRACKS, i * 7 + 2);
    const candidates = [0, 1, 2, 3].map((k) => names[(i * 3 + k) % names.length]);
    items.push({
      category: cat,
      id: `item-${i}`,
      name: cat === 'track' ? t.title : cat === 'artist' ? t.artist : t.album,
      subtitle: cat === 'artist' ? '' : t.artist,
      imageUrl: cat === 'artist' ? artistArt(ARTISTS.find((a) => a.id === t.artistId)!) : trackArt(t),
      count: 40 + ((i * 37) % 90),
      topQueuer: candidates[i % candidates.length],
      queuerCandidates: candidates,
    });
  }
  return items;
})();

export function game(gameId: string): GameDoc {
  const shift = hashStr(gameId) % 3;
  const items = rotate(GAME_ITEMS, shift).map((it, i) => ({
    ...it,
    id: `${gameId}-${i}`,
    count: it.count + shift * 3,
  }));
  const questions: GameQuestion[] = Array.from({ length: 10 }, (_, i) => {
    const q: GameQuestion = {
      index: i,
      left: items[i],
      right: items[i + 1],
      winner: items[i].count >= items[i + 1].count ? 'left' : 'right',
      carryover: i === 0 ? undefined : 'left',
      bonusItem: 'right',
    };
    return q;
  });
  for (let i = 1; i < questions.length; i++) {
    const prev = questions[i - 1];
    const carried = prev.winner === 'left' ? prev.left : prev.right;
    questions[i].left = carried;
    questions[i].winner = carried.count >= questions[i].right.count ? 'left' : 'right';
  }
  questions[0].bonusItem = questions[0].winner;
  return { id: gameId, status: 'ready', generatedAt: 0, lowData: false, questions };
}

/** The ten days of Queuedle history: today (unplayed) and the nine before it. */
export const GAME_IDS = Array.from({ length: 10 }, (_, i) => gameIdDaysAgo(i));

export function gameScores(gameId: string): GameScoreDoc[] {
  const day = hashStr(gameId);
  // Everyone plays most days; who tops a day varies, and the previous week has a clear winner.
  return PEOPLE.filter((_, i) => (day + i) % 4 !== 0)
    .map((p, i) => {
      const main = 5 + ((day + i * 3) % 5);
      const bonus = 3 + ((day * 3 + i * 5) % 6);
      return {
        id: `${gameId}-${p.name}`,
        gameId,
        userName: p.name,
        mainScore: main,
        bonusScore: bonus,
        total: main + bonus,
        completedAt: hoursAgo(4 + i),
      };
    })
    .sort((a, b) => b.total - a.total || a.userName.localeCompare(b.userName));
}

export const gameLeaderboard = (gameId: string): GameLeaderboardResult => ({
  gameId,
  // Nobody has finished today's game yet: the page opens on the intro, as it does first thing in the morning.
  scores: gameId === TODAY_ID ? gameScores(gameId).slice(0, 3) : gameScores(gameId),
});

export const gameDates = (): GameDatesResult => ({
  dates: GAME_IDS.map((gameId) => ({ gameId, status: 'ready' as const, userPlayed: gameId !== TODAY_ID })),
});

export function myScore(gameId: string, userName: string): GameMyScoreResult {
  if (gameId === TODAY_ID) return {};
  const mine = gameScores(gameId).find((s) => s.userName === userName);
  if (!mine) return {};
  const g = game(gameId);
  return {
    score: {
      mainScore: mine.mainScore,
      bonusScore: mine.bonusScore,
      total: mine.total,
      guesses: {
        main: g.questions.map((q) => q.winner),
        bonus: g.questions.map((q) => (q.bonusItem === 'left' ? q.left : q.right).topQueuer),
      },
    },
  };
}

export const gameStats = (gameId: string): GameStatsResult => {
  const g = game(gameId);
  return {
    gameId,
    totalPlayers: 8,
    questions: g.questions.map((q, i) => {
      const item = q.bonusItem === 'left' ? q.left : q.right;
      return {
        questionIndex: i,
        leftPct: 40 + ((i * 7) % 30),
        rightPct: 60 - ((i * 7) % 30),
        bonusOptions: item.queuerCandidates.map((n, k) => ({ name: n, pct: [50, 25, 15, 10][k] })),
      };
    }),
  };
};

// ── Music stats ──

export function musicStats(): MusicStatsResult {
  const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const people = PEOPLE.map((p, i): MusicPersonStats => {
    const queues = 520 - i * 41;
    const trackQueues = Math.round(queues * 0.9);
    const top = rotate(ARTISTS, i).slice(0, 5);
    const fav = rotate(TRACKS, i * 5)[0];
    return {
      userId: p.name,
      queues,
      trackQueues,
      uniqueArtists: 30 + ((i * 11) % 40),
      variety: (30 + ((i * 11) % 40)) / trackQueues,
      topArtists: top.map((a, k) => ({ artist: a.name, count: 60 - k * 9 - i })),
      mostRequeued: { trackName: fav.title, artist: fav.artist, imageUrl: trackArt(fav), count: 9 - (i % 5) },
      airtimeMs: trackQueues * 215_000,
      timedQueues: trackQueues - 12,
      avgLengthMs: 190_000 + i * 9_000,
      explicitPct: (i * 3) % 14,
      tasteByMonth: months.map((month, mi) => ({
        month,
        queues: 60 + ((i + mi) % 5) * 20,
        topArtists: rotate(ARTISTS, i + mi)
          .slice(0, 3)
          .map((a, k) => ({ artist: a.name, count: 14 - k * 3 })),
      })),
    };
  });
  const long = rotate(TRACKS, 11).slice(0, 5);
  const short = rotate(TRACKS, 40).slice(0, 5);
  return {
    generatedAt: FROZEN_NOW,
    totalEvents: people.reduce((n, p) => n + p.queues, 0),
    trackEvents: people.reduce((n, p) => n + p.trackQueues, 0),
    uniqueTracks: 1480,
    tracksWithLength: 1310,
    busyHours: Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => (d < 5 && h >= 9 && h <= 17 ? 8 + ((d * 7 + h * 3) % 30) : (d + h) % 3))
    ),
    people,
    discoverers: rotate(ARTISTS, 2)
      .slice(0, 6)
      .map((a, i) => ({
        artist: a.name,
        imageUrl: artistArt(a),
        firstBy: PEOPLE[i % PEOPLE.length].name,
        firstAt: daysAgo(200 - i * 20),
        totalQueues: 80 - i * 8,
        othersQueues: 50 - i * 6,
      })),
    longest: long.map((t, i) => ({
      trackName: t.title,
      artist: t.artist,
      imageUrl: trackArt(t),
      durationMs: (540 - i * 40) * 1000,
      queues: 6 - (i % 3),
      firstBy: PEOPLE[i].name,
    })),
    shortest: short.map((t, i) => ({
      trackName: t.title,
      artist: t.artist,
      imageUrl: trackArt(t),
      durationMs: (62 + i * 11) * 1000,
      queues: 4 + (i % 3),
      firstBy: PEOPLE[i + 2].name,
    })),
  };
}

// ── Attribution: who queued the queue ──

export function attributionFor(track: CatTrack, index: number): AttributionEntry {
  return {
    user: IN_OFFICE[index % IN_OFFICE.length],
    timestamp: minutesAgo(20 + index * 3),
    trackName: track.title,
    artist: track.artist,
  };
}

/** For callers that want an arbitrary piece of art for a shelf. */
export const shelfArt = (id: string) => artUrl(`shelf:${id}`);
export const albumOf = (t: CatTrack) => albumById(t.albumId)!;
