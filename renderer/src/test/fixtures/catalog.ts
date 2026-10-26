// An invented music catalogue: artists, albums and tracks that exist nowhere. Built from word lists by index, so it is
// identical on every run (no Math.random, no clock).

export const SERVICE_ID = '72711';
export const ACCOUNT_ID = 'mock-account';

export interface CatTrack {
  id: string;
  title: string;
  artistId: string;
  artist: string;
  albumId: string;
  album: string;
  ordinal: number;
  durationSec: number;
  explicit: boolean;
}

export interface CatAlbum {
  id: string;
  title: string;
  artistId: string;
  artist: string;
  year: number;
  tracks: CatTrack[];
}

export interface CatArtist {
  id: string;
  name: string;
  /** One line for the Genius-style bio. */
  blurb: string;
  albums: CatAlbum[];
}

const ADJ = [
  'Slow',
  'Paper',
  'Glass',
  'Midnight',
  'Golden',
  'Quiet',
  'Electric',
  'Salt',
  'Velvet',
  'Hollow',
  'Copper',
  'Winter',
  'Distant',
  'Burning',
  'Silver',
  'Tender',
  'Crooked',
  'Wild',
  'Pale',
  'Neon-less',
  'Drifting',
  'Open',
  'Faded',
  'Lucky',
  'Restless',
  'Gentle',
  'Broken',
  'Painted',
  'Hidden',
  'Northern',
  'Sunday',
]; // 31
const NOUN = [
  'Harbour',
  'Lanterns',
  'Weather',
  'Orchard',
  'Signals',
  'Rivers',
  'Kitchen',
  'Garden',
  'Telegram',
  'Compass',
  'Static',
  'Bridges',
  'Satellites',
  'Morning',
  'Engine',
  'Postcards',
  'Shoreline',
  'Tides',
  'Anthem',
  'Carousel',
  'Lighthouse',
  'Mirrors',
  'Staircase',
  'Balloons',
  'Thunder',
  'Meadow',
  'Cinema',
  'Archive',
  'Fireflies',
  'Overpass',
  'Parade',
  'Villa',
  'Radio',
  'Canyon',
  'Ferry',
  'Blueprint',
  'Daylight',
]; // 37

const trackTitle = (n: number) => `${ADJ[n % ADJ.length]} ${NOUN[n % NOUN.length]}`;

const ARTIST_SEEDS: Array<{ name: string; blurb: string; albums: string[] }> = [
  {
    name: 'The Velvet Anchors',
    blurb: 'A made-up four-piece who write guitar songs about leaving harbour towns.',
    albums: ['Paper Lanterns at Low Tide', 'Salt and Static', 'The Long Way Round the Pier'],
  },
  {
    name: 'Lumen Harbour',
    blurb: 'An invented electronic duo with a fondness for night buses.',
    albums: ['Night Bus Cathedral', 'Soft Machines', 'Low Orbit Lullabies'],
  },
  {
    name: 'Pale Cartographers',
    blurb: 'Fictional folk singers who map places that were never built.',
    albums: ['Atlas of Small Rooms', 'Rivers You Cannot Cross', 'Field Notes for Winter'],
  },
  {
    name: 'Marigold Static',
    blurb: 'A pretend pop group, all handclaps and bright synths.',
    albums: ['Sugar Telegram', 'Marigold Season', 'Fizz'],
  },
  {
    name: 'Nightjar Assembly',
    blurb: 'Imaginary post-rock, eleven minutes at a time.',
    albums: ['Eleven Minutes of Weather', 'Dark Sky Reserve', 'Understory'],
  },
  {
    name: 'Oona Vexley',
    blurb: 'A solo singer-songwriter who does not exist, at a piano that does not either.',
    albums: ['Kitchen Table Hymns', 'Porcelain', 'A Quiet Kind of Fire'],
  },
  {
    name: 'Cobalt Orchard',
    blurb: 'Made-up dream pop with the reverb turned all the way up.',
    albums: ['Blue Hour Fruit', 'Ferry to Nowhere'],
  },
  {
    name: 'Hollow Parade',
    blurb: 'A fictional punk trio, three chords and a van.',
    albums: ['Loud Weather', 'Small Town Thunder'],
  },
  {
    name: 'Sable & Finch',
    blurb: 'Invented harmonies, recorded in an imaginary church hall.',
    albums: ['Evensong for Engines', 'The Good Dark'],
  },
  {
    name: 'Tidewater Choir',
    blurb: 'A pretend choir of fourteen who only sing about the sea.',
    albums: ['Salt Hymnal', 'Slack Water'],
  },
];

let trackCounter = 0;

export const ARTISTS: CatArtist[] = ARTIST_SEEDS.map((a, ai) => {
  const artistId = `ar-${ai + 1}`;
  return {
    id: artistId,
    name: a.name,
    blurb: a.blurb,
    albums: a.albums.map((title, bi) => {
      const albumId = `al-${ai + 1}-${bi + 1}`;
      // The hero album (artist 1, album 1) has twelve tracks; the rest vary between eight and eleven.
      const count = ai === 0 && bi === 0 ? 12 : 8 + ((ai * 3 + bi * 2) % 4);
      return {
        id: albumId,
        title,
        artistId,
        artist: a.name,
        year: 2012 + ai + bi * 3,
        tracks: Array.from({ length: count }, (_, ti): CatTrack => {
          const n = trackCounter++;
          return {
            id: `tr-${ai + 1}-${bi + 1}-${ti + 1}`,
            title: trackTitle(n),
            artistId,
            artist: a.name,
            albumId,
            album: title,
            ordinal: ti + 1,
            durationSec: 150 + ((n * 37) % 150),
            explicit: ai === 7 && ti % 4 === 0,
          };
        }),
      };
    }),
  };
});

export const ALBUMS: CatAlbum[] = ARTISTS.flatMap((a) => a.albums);
export const TRACKS: CatTrack[] = ALBUMS.flatMap((a) => a.tracks);

export const artistById = (id: string) => ARTISTS.find((a) => a.id === id);
export const albumById = (id: string) => ALBUMS.find((a) => a.id === id);
export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

/** An artist's best-known songs: the first two of each of their albums, in album order. */
export const topSongsOf = (artistId: string): CatTrack[] =>
  (artistById(artistId)?.albums ?? []).flatMap((al) => al.tracks.slice(0, 3)).slice(0, 8);

/** The album the Album page story opens: twelve tracks, with two more albums by the same artist for "More by". */
export const HERO_ALBUM = ALBUMS[0];
export const HERO_ARTIST = ARTISTS[0];

/** UTF-8 safe base64 of a JSON object: the `defaults` blob Sonos hands out with each resource. */
export function encodeDefaults(obj: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
