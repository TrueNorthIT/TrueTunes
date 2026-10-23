import { describe, it, expect } from 'vitest';
import { filterShelves } from '../shelfSearch';
import { releaseKey, type ReleaseGroup, type groupReleases } from '../releaseShelves';
import type { SonosItem } from '../../types/sonos';

// Production code under test: renderer/src/lib/shelfSearch.ts (does not exist yet)
//   filterShelves(shelves, query, tracksByRelease) filters the artist page's three shelves
//   (albums / singles / other) at once by release title and by track titles inside each release.
//   It returns { shelves, trackHits }:
//     shelves   - the filtered shelves; shelf order, group order and version order follow the input
//     trackHits - releaseKey(version) -> matching track titles (tracklist order), only for versions
//                 that matched on tracks but NOT on their own title
//   tracksByRelease maps releaseKey -> track titles for releases whose tracklist has loaded
//   (a missing entry means "not loaded yet", so that release can only match on its title).

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Shelves = ReturnType<typeof groupReleases>;

function release(title: string, objectId: string): SonosItem {
  return {
    id: objectId,
    title,
    subtitle: '',
    images: [{ url: 'https://example.test/tile.jpg' }],
    type: 'ITEM_ALBUM',
    isExplicit: false,
    resource: { id: { objectId, serviceId: '9', accountId: 'a' }, defaults: '' },
  } as SonosItem;
}

/** A group whose primary is the first release given; versions keep the order given. */
const group = (...versions: SonosItem[]): ReleaseGroup => ({ primary: versions[0], versions });

const titles = (groups: ReleaseGroup[]) => groups.map((g) => g.primary.title);
const versionTitles = (g: ReleaseGroup) => g.versions.map((v) => v.title);

// Everything Everything releases
const mountainhead = release('Mountainhead', 'mountainhead');
const rawDataFeel = release('Raw Data Feel', 'raw-data-feel');
const manAlive = release('Man Alive', 'man-alive');
const manAliveDeluxe = release('Man Alive (Deluxe)', 'man-alive-deluxe');
const pizzaBoy = release('Pizza Boy', 'pizza-boy');
const pizzaBoySkream = release('Pizza Boy (Skream Remix)', 'pizza-boy-skream');
const naturals = release('Natural’s Not in It', 'naturals'); // curly apostrophe
const getToHeavenLive = release('Get to Heaven (Live at Brixton)', 'gth-live');

const ALBUMS = [group(mountainhead), group(rawDataFeel), group(manAlive, manAliveDeluxe)];
const SINGLES = [group(pizzaBoy, pizzaBoySkream), group(naturals)];

function buildShelves(): Shelves {
  return { albums: [...ALBUMS], singles: [...SINGLES], other: [group(getToHeavenLive)] };
}

function buildTracks(): Map<string, string[]> {
  return new Map([
    [releaseKey(mountainhead), ['Wild Guess', 'The End of the Contender', 'Cold Reactor', 'Buddy, Come Over']],
    [releaseKey(rawDataFeel), ['Teletype', 'Pizza Boy', 'I Want a Love Like This']],
    [releaseKey(manAlive), ['Kemosabe', 'Siren Song']],
    [releaseKey(manAliveDeluxe), ['Kemosabe', 'Siren Song']],
    [releaseKey(pizzaBoy), ['Pizza Boy']],
    [releaseKey(pizzaBoySkream), ['Pizza Boy (Skream Remix)']],
    [releaseKey(naturals), ['Natural’s Not in It']],
    [releaseKey(getToHeavenLive), ['Distortion Fields', 'Regret']],
  ]);
}

const search = (query: string, tracks: Map<string, string[]> = buildTracks(), shelves: Shelves = buildShelves()) =>
  filterShelves(shelves, query, tracks);

/** Runs a query against one local group on the albums shelf and returns that shelf's titles. */
const matchTitles = (query: string, ...items: SonosItem[]) =>
  titles(
    filterShelves({ albums: items.map((i) => group(i)), singles: [], other: [] }, query, new Map()).shelves.albums
  );

// ─── S-2: all three shelves are filtered in one call ──────────────────────────

describe('S-2 All three shelves are filtered in one call', () => {
  // Given a query that matches one group on each shelf, `filterShelves` keeps a matching group
  // on albums, singles and other together and drops the rest.
  it('S-2: filters albums, singles and other together in one call', () => {
    const tracks = buildTracks();
    tracks.set(releaseKey(getToHeavenLive), ['Distortion Fields', 'Regret', 'Pizza Boy']);

    const { shelves } = search('pizza', tracks);

    expect(titles(shelves.albums), 'Expected the albums shelf to keep only Raw Data Feel (track match)').toEqual([
      'Raw Data Feel',
    ]);
    expect(titles(shelves.singles), 'Expected the singles shelf to keep only the Pizza Boy group').toEqual([
      'Pizza Boy',
    ]);
    expect(
      titles(shelves.other),
      'Expected the other shelf to keep only Get to Heaven (Live at Brixton) (track match)'
    ).toEqual(['Get to Heaven (Live at Brixton)']);
  });

  // Given a query that matches only the "other" shelf, the albums and singles shelves come back
  // as empty arrays (not undefined, not omitted); the UI hides them.
  it('S-2: a shelf with no matching groups comes back as an empty array', () => {
    const { shelves } = search('heaven');

    expect(titles(shelves.other), 'Expected the other shelf to keep the live release').toEqual([
      'Get to Heaven (Live at Brixton)',
    ]);
    expect(shelves.albums, 'Expected an empty albums array when nothing on that shelf matches').toEqual([]);
    expect(shelves.singles, 'Expected an empty singles array when nothing on that shelf matches').toEqual([]);
  });

  it('S-2: a query that matches nothing returns three empty shelves and no track hits', () => {
    const { shelves, trackHits } = search('zzzz');

    expect(shelves, 'Expected every shelf to be an empty array when nothing matches').toEqual({
      albums: [],
      singles: [],
      other: [],
    });
    expect(trackHits.size, 'Expected no track hits when nothing matches').toBe(0);
  });
});

// ─── S-3: title matching and normalisation ────────────────────────────────────

describe('S-3 A version matches when its title contains the query', () => {
  // Example from the requirement: "mount" leaves just Mountainhead.
  it('S-3: "mount" leaves just Mountainhead', () => {
    const { shelves } = search('mount', new Map());

    expect(titles(shelves.albums), 'Expected only Mountainhead to remain on the albums shelf for "mount"').toEqual([
      'Mountainhead',
    ]);
    expect(shelves.singles, 'Expected no singles to match "mount"').toEqual([]);
    expect(shelves.other, 'Expected nothing on the other shelf to match "mount"').toEqual([]);
  });

  it('S-3: matches a substring from the middle of a title', () => {
    expect(
      matchTitles('tainhe', mountainhead, rawDataFeel),
      'Expected "tainhe" to match inside "Mountainhead"'
    ).toEqual(['Mountainhead']);
  });

  it('S-3: ignores case in both the query and the title', () => {
    expect(matchTitles('MOUNTAINHEAD', mountainhead, rawDataFeel), 'Expected an upper-case query to match').toEqual([
      'Mountainhead',
    ]);
    expect(
      matchTitles('raw data feel', mountainhead, rawDataFeel),
      'Expected a lower-case query to match a title-case title'
    ).toEqual(['Raw Data Feel']);
  });

  it('S-3: ignores accents, so "cafe" matches "Café"', () => {
    const cafe = release('Café Society', 'cafe');
    expect(matchTitles('cafe', cafe, mountainhead), 'Expected "cafe" to match the accented "Café Society"').toEqual([
      'Café Society',
    ]);
  });

  it('S-3: ignores accents in the query too, so "café" matches "Cafe"', () => {
    const cafe = release('Cafe Society', 'cafe');
    expect(matchTitles('café', cafe, mountainhead), 'Expected "café" to match the unaccented "Cafe Society"').toEqual([
      'Cafe Society',
    ]);
  });

  it('S-3: a straight apostrophe in the query matches a curly apostrophe in the title', () => {
    const { shelves } = search("natural's", new Map());

    expect(titles(shelves.singles), 'Expected "natural\'s" to match "Natural’s Not in It"').toEqual([
      'Natural’s Not in It',
    ]);
  });

  it('S-3: a curly apostrophe in the query matches a straight apostrophe in the title', () => {
    const straight = release("Natural's Not in It", 'naturals-straight');
    expect(
      matchTitles('natural’s', straight, mountainhead),
      'Expected a curly-apostrophe query to match a straight-apostrophe title'
    ).toEqual(["Natural's Not in It"]);
  });

  it('S-3: trims leading and trailing whitespace from the query', () => {
    expect(
      matchTitles('  mountainhead  ', mountainhead, rawDataFeel),
      'Expected surrounding spaces to be ignored'
    ).toEqual(['Mountainhead']);
  });

  it('S-3: collapses runs of whitespace inside the query', () => {
    const { shelves } = search('  raw    data \t feel ', new Map());

    expect(titles(shelves.albums), 'Expected "raw    data  feel" to match "Raw Data Feel"').toEqual(['Raw Data Feel']);
  });
});

// ─── S-4 / S-5: track-title matching and trackHits ────────────────────────────

describe('S-4/S-5 A version also matches on its track titles', () => {
  // Given query "pizza", Raw Data Feel (title does not match) has the track "Pizza Boy".
  it('S-4: keeps a release whose track title contains the query', () => {
    const { shelves } = search('pizza');

    expect(titles(shelves.albums), 'Expected Raw Data Feel to be kept because of its track "Pizza Boy"').toEqual([
      'Raw Data Feel',
    ]);
  });

  // Example from the requirement.
  it('S-5: a track-only match adds a trackHits entry listing the matching track', () => {
    const { trackHits } = search('pizza');

    expect(trackHits.get(releaseKey(rawDataFeel)), 'Expected trackHits for Raw Data Feel to be ["Pizza Boy"]').toEqual([
      'Pizza Boy',
    ]);
  });

  // Mountainhead matches "co" on three tracks (not on its title); tracklist order is kept.
  it('S-5: trackHits lists every matching track in tracklist order', () => {
    const { shelves, trackHits } = search('co');

    expect(titles(shelves.albums), 'Expected only Mountainhead to match "co" (via tracks)').toEqual(['Mountainhead']);
    expect(trackHits.get(releaseKey(mountainhead)), 'Expected all three matching tracks, in tracklist order').toEqual([
      'The End of the Contender',
      'Cold Reactor',
      'Buddy, Come Over',
    ]);
  });

  it('S-5: a version that matches on its title gets no trackHits entry, even if its tracks also match', () => {
    // Pizza Boy matches "pizza" by title and also has a track called "Pizza Boy".
    const { shelves, trackHits } = search('pizza');

    expect(versionTitles(shelves.singles[0]), 'Expected both Pizza Boy versions kept via their titles').toEqual([
      'Pizza Boy',
      'Pizza Boy (Skream Remix)',
    ]);
    expect(trackHits.has(releaseKey(pizzaBoy)), 'Expected no trackHits entry for Pizza Boy (title match)').toBe(false);
    expect(
      trackHits.has(releaseKey(pizzaBoySkream)),
      'Expected no trackHits entry for the Skream Remix (title match)'
    ).toBe(false);
  });

  it('S-5: "pizza" yields exactly one trackHits entry, for Raw Data Feel', () => {
    const { trackHits } = search('pizza');

    expect([...trackHits.keys()], 'Expected only Raw Data Feel (track-only match) in trackHits').toEqual([
      releaseKey(rawDataFeel),
    ]);
  });

  it('S-4: a release with no tracklist loaded can only match on its title', () => {
    const tracks = buildTracks();
    tracks.delete(releaseKey(rawDataFeel)); // not loaded yet

    const { shelves, trackHits } = search('pizza', tracks);

    expect(shelves.albums, 'Expected Raw Data Feel to be dropped when its tracklist has not loaded').toEqual([]);
    expect(titles(shelves.singles), 'Expected the Pizza Boy group to remain through its titles').toEqual(['Pizza Boy']);
    expect(trackHits.size, 'Expected no trackHits when no track-only match exists').toBe(0);
  });

  it('S-4: with no tracklists loaded at all, only titles are searched', () => {
    const { shelves, trackHits } = search('pizza', new Map());

    expect(shelves.albums, 'Expected no album match without loaded tracklists').toEqual([]);
    expect(titles(shelves.singles), 'Expected title matches to still work').toEqual(['Pizza Boy']);
    expect(trackHits.size, 'Expected empty trackHits when nothing has loaded').toBe(0);
  });

  it('S-4: track matching ignores case', () => {
    const { trackHits } = search('TELETYPE');

    expect(trackHits.get(releaseKey(rawDataFeel)), 'Expected "TELETYPE" to match the track "Teletype"').toEqual([
      'Teletype',
    ]);
  });

  it('S-4: track matching ignores accents', () => {
    const tracks = new Map([[releaseKey(rawDataFeel), ['Café Racer', 'Teletype']]]);
    const { trackHits } = search('cafe', tracks);

    expect(trackHits.get(releaseKey(rawDataFeel)), 'Expected "cafe" to match the track "Café Racer"').toEqual([
      'Café Racer',
    ]);
  });

  it('S-4: track matching treats curly and straight apostrophes the same', () => {
    const tracks = new Map([[releaseKey(rawDataFeel), ['Can’t Have It', 'Teletype']]]);
    const { trackHits } = search("can't", tracks);

    expect(trackHits.get(releaseKey(rawDataFeel)), 'Expected "can\'t" to match the track "Can’t Have It"').toEqual([
      'Can’t Have It',
    ]);
  });

  it('S-4: track matching trims and collapses whitespace in the query', () => {
    const { trackHits } = search('  i   want  a ');

    expect(
      trackHits.get(releaseKey(rawDataFeel)),
      'Expected a messy-whitespace query to match "I Want a Love Like This"'
    ).toEqual(['I Want a Love Like This']);
  });

  // Man Alive and Man Alive (Deluxe) both have the track "Kemosabe"; neither title matches "kemosabe".
  it('S-5: trackHits is keyed by version, so each matching version gets its own entry', () => {
    const { shelves, trackHits } = search('kemosabe');

    expect(
      versionTitles(shelves.albums[0]),
      'Expected both Man Alive versions kept via tracks, in input order'
    ).toEqual(['Man Alive', 'Man Alive (Deluxe)']);
    expect(trackHits.get(releaseKey(manAlive)), 'Expected a trackHits entry for Man Alive').toEqual(['Kemosabe']);
    expect(trackHits.get(releaseKey(manAliveDeluxe)), 'Expected a trackHits entry for Man Alive (Deluxe)').toEqual([
      'Kemosabe',
    ]);
  });
});

// ─── S-6: groups are filtered by version ──────────────────────────────────────

describe('S-6 Groups are filtered by version', () => {
  // Example from the requirement: "deluxe" against [Man Alive, Man Alive (Deluxe)].
  it('S-6: when only a later version matches, the group shrinks to it and it becomes primary', () => {
    const { shelves } = search('deluxe');

    expect(shelves.albums, 'Expected exactly one album group for "deluxe"').toHaveLength(1);
    const g = shelves.albums[0];
    expect(versionTitles(g), 'Expected the group to hold only the matching version').toEqual(['Man Alive (Deluxe)']);
    expect(g.primary.title, 'Expected Man Alive (Deluxe) to become primary (a plain card in the UI)').toBe(
      'Man Alive (Deluxe)'
    );
  });

  // Example from the requirement: "man alive" keeps both versions, original primary stays.
  it('S-6: when the primary and another version match, both stay and the primary is unchanged', () => {
    const { shelves } = search('man alive');

    expect(shelves.albums, 'Expected exactly one album group for "man alive"').toHaveLength(1);
    const g = shelves.albums[0];
    expect(versionTitles(g), 'Expected both Man Alive versions, in input order').toEqual([
      'Man Alive',
      'Man Alive (Deluxe)',
    ]);
    expect(g.primary.title, 'Expected Man Alive to remain primary because it still matches').toBe('Man Alive');
  });

  it('S-6: a group is dropped when none of its versions match', () => {
    const { shelves } = search('mountainhead', new Map());

    expect(titles(shelves.albums), 'Expected the Man Alive group to be dropped for "mountainhead"').toEqual([
      'Mountainhead',
    ]);
  });

  it('S-6: when the primary does not match, the first remaining version becomes primary and order is kept', () => {
    const bonobo = release('Pizza Boy (Bonobo Remix)', 'pizza-boy-bonobo');
    const shelves: Shelves = {
      albums: [],
      singles: [group(pizzaBoy, pizzaBoySkream, bonobo)],
      other: [],
    };

    const g = filterShelves(shelves, 'remix', new Map()).shelves.singles[0];

    expect(versionTitles(g), 'Expected the two remixes, in input order').toEqual([
      'Pizza Boy (Skream Remix)',
      'Pizza Boy (Bonobo Remix)',
    ]);
    expect(g.primary.title, 'Expected the first remaining version (Skream Remix) to become primary').toBe(
      'Pizza Boy (Skream Remix)'
    );
  });

  it('S-6: when the primary matches, it stays primary and non-matching versions are dropped', () => {
    const bonobo = release('Pizza Boy (Bonobo Remix)', 'pizza-boy-bonobo');
    const shelves: Shelves = {
      albums: [],
      singles: [{ primary: pizzaBoySkream, versions: [pizzaBoySkream, pizzaBoy, bonobo] }],
      other: [],
    };

    // "remix" is in the primary (Skream Remix) and Bonobo Remix but not in plain "Pizza Boy"
    const g = filterShelves(shelves, 'remix', new Map()).shelves.singles[0];

    expect(versionTitles(g), 'Expected plain Pizza Boy to be dropped, keeping input order').toEqual([
      'Pizza Boy (Skream Remix)',
      'Pizza Boy (Bonobo Remix)',
    ]);
    expect(g.primary.title, 'Expected the Skream Remix to stay primary because it still matches').toBe(
      'Pizza Boy (Skream Remix)'
    );
  });

  it('S-6: a version that matches only on tracks keeps its group and becomes primary if the original does not match', () => {
    // Only the Deluxe has this bonus track loaded; the original's title and tracks do not match.
    const tracks = buildTracks();
    tracks.set(releaseKey(manAliveDeluxe), ['Kemosabe', 'Siren Song', 'Hot Coals']);

    const { shelves, trackHits } = search('hot coals', tracks);

    expect(shelves.albums, 'Expected one album group for "hot coals"').toHaveLength(1);
    expect(versionTitles(shelves.albums[0]), 'Expected only the Deluxe version to remain').toEqual([
      'Man Alive (Deluxe)',
    ]);
    expect(shelves.albums[0].primary.title, 'Expected the Deluxe to be primary').toBe('Man Alive (Deluxe)');
    expect(
      trackHits.get(releaseKey(manAliveDeluxe)),
      'Expected the track hit to be keyed by the Deluxe version'
    ).toEqual(['Hot Coals']);
    expect(trackHits.has(releaseKey(manAlive)), 'Expected no entry for the version that did not match').toBe(false);
  });
});

// ─── S-7: empty query ─────────────────────────────────────────────────────────

describe('S-7 An empty or whitespace-only query returns the shelves unchanged', () => {
  it('S-7: an empty query returns the same groups and an empty trackHits', () => {
    const input = buildShelves();
    const { shelves, trackHits } = search('', buildTracks(), input);

    expect(shelves, 'Expected the shelves to be deep-equal to the input for an empty query').toEqual(input);
    expect(trackHits.size, 'Expected no trackHits for an empty query').toBe(0);
  });

  it('S-7: a whitespace-only query returns the same groups and an empty trackHits', () => {
    const input = buildShelves();
    const { shelves, trackHits } = search('  \t  ', buildTracks(), input);

    expect(shelves, 'Expected the shelves to be deep-equal to the input for a whitespace-only query').toEqual(input);
    expect(trackHits.size, 'Expected no trackHits for a whitespace-only query').toBe(0);
  });

  it('S-7: an empty query keeps empty shelves as empty arrays', () => {
    const { shelves } = search('', new Map(), { albums: [group(mountainhead)], singles: [], other: [] });

    expect(shelves.singles, 'Expected an empty singles shelf to stay an empty array').toEqual([]);
    expect(shelves.other, 'Expected an empty other shelf to stay an empty array').toEqual([]);
  });
});

// ─── S-9: ordering follows the input ──────────────────────────────────────────

describe('S-9 Group and version order follow the input; the function never re-sorts', () => {
  // Input order is Mountainhead, Raw Data Feel, Man Alive: deliberately not alphabetical.
  it('S-9: groups keep their input order within a shelf', () => {
    const { shelves } = search('a', new Map());

    expect(
      titles(shelves.albums),
      'Expected album groups in input order (Mountainhead, Raw Data Feel, Man Alive)'
    ).toEqual(['Mountainhead', 'Raw Data Feel', 'Man Alive']);
  });

  it('S-9: versions keep their input order within a group, even when the primary is not first alphabetically', () => {
    const input: Shelves = {
      albums: [{ primary: manAliveDeluxe, versions: [manAliveDeluxe, manAlive] }],
      singles: [],
      other: [],
    };

    const g = filterShelves(input, 'man', new Map()).shelves.albums[0];

    expect(versionTitles(g), 'Expected versions in input order (Deluxe first)').toEqual([
      'Man Alive (Deluxe)',
      'Man Alive',
    ]);
    expect(g.primary.title, 'Expected the Deluxe to stay primary because it matches').toBe('Man Alive (Deluxe)');
  });

  it('S-9: the shelves object still has albums, singles and other', () => {
    const { shelves } = search('pizza');

    expect(Object.keys(shelves).sort(), 'Expected the result to carry the three shelves').toEqual([
      'albums',
      'other',
      'singles',
    ]);
  });
});

// ─── Input is not mutated ─────────────────────────────────────────────────────

describe('filterShelves does not mutate its input', () => {
  it('leaves the shelves, groups, versions and tracksByRelease exactly as given', () => {
    const input = buildShelves();
    const tracks = buildTracks();
    const shelvesBefore = structuredClone(input);
    const tracksBefore = structuredClone([...tracks]);

    search('deluxe', tracks, input); // shrinks a group and changes its primary in the result
    search('pizza', tracks, input);

    expect(input, 'Expected the input shelves to be unchanged after filtering').toEqual(shelvesBefore);
    expect([...tracks], 'Expected tracksByRelease to be unchanged after filtering').toEqual(tracksBefore);
  });
});
