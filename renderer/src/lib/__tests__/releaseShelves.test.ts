import { describe, it, expect } from 'vitest';
import { groupReleases, releaseKey, type ReleaseGroup } from '../releaseShelves';
import type { SonosItem } from '../../types/sonos';

// Production code under test: renderer/src/lib/releaseShelves.ts
//   groupReleases(releases, trackCounts) sorts artist-page releases into three shelves
//   (albums / singles / other) and stacks versions of the same release into one group.
//   releaseKey(item) is the key of the trackCounts map.

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Spec = [title: string, trackCount?: number];

function album(title: string, objectId: string): SonosItem {
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

/** Builds releases (ids r0, r1, ... by input index) and a track-count map keyed by releaseKey. */
function run(specs: Spec[]) {
  const releases = specs.map(([title], i) => album(title, `r${i}`));
  const counts = new Map<string, number>();
  specs.forEach(([, n], i) => {
    if (n !== undefined) counts.set(releaseKey(releases[i]), n);
  });
  return groupReleases(releases, counts);
}

const primaries = (groups: ReleaseGroup[]) => groups.map((g) => g.primary.title);
const versionTitles = (g: ReleaseGroup) => g.versions.map((v) => v.title);

// ─── releaseKey (contract) ────────────────────────────────────────────────────

describe('releaseKey', () => {
  it('uses resource.id.objectId when present', () => {
    const item = { id: 'plain-id', title: 'T', resource: { id: { objectId: 'res-obj' } } } as SonosItem;
    expect(releaseKey(item), 'Expected resource.id.objectId to be preferred').toBe('res-obj');
  });

  it('falls back to a string id when there is no resource id', () => {
    const item = { id: 'plain-id', title: 'T' } as SonosItem;
    expect(releaseKey(item), 'Expected the string id to be used').toBe('plain-id');
  });

  it('falls back to id.objectId when id is an object', () => {
    const item = { id: { objectId: 'id-obj' }, title: 'T' } as SonosItem;
    expect(releaseKey(item), 'Expected id.objectId to be used').toBe('id-obj');
  });

  it('falls back to the title when there is no id at all', () => {
    const item = { title: 'Only A Title' } as SonosItem;
    expect(releaseKey(item), 'Expected the title to be used as a last resort').toBe('Only A Title');
  });
});

describe('groupReleases', () => {
  it('returns three empty shelves for empty input', () => {
    // Given no releases, groupReleases returns { albums: [], singles: [], other: [] }.
    expect(run([])).toEqual({ albums: [], singles: [], other: [] });
  });

  // ─── REQ-2 / REQ-3: shelf by track count ────────────────────────────────────

  describe('REQ-2: a release with 6 or more tracks goes in Albums', () => {
    it('REQ-2: puts Mountainhead (11 tracks) in albums', () => {
      const s = run([['Mountainhead', 11]]);
      expect(primaries(s.albums), 'Expected Mountainhead (11 tracks) on the albums shelf').toEqual(['Mountainhead']);
      expect(s.singles, 'Expected nothing on singles').toHaveLength(0);
      expect(s.other, 'Expected nothing on other').toHaveLength(0);
    });

    it('REQ-2/REQ-3 boundary: puts a 6-track release in albums', () => {
      const s = run([['Six Tracker', 6]]);
      expect(primaries(s.albums), 'Expected a 6-track release to be an album').toEqual(['Six Tracker']);
      expect(s.singles, 'Expected a 6-track release not to be a single/EP').toHaveLength(0);
    });
  });

  describe('REQ-3: a release with 1-5 tracks goes in Singles & EPs', () => {
    it('REQ-3: puts Pizza Boy (1 track) in singles', () => {
      const s = run([['Pizza Boy', 1]]);
      expect(primaries(s.singles), 'Expected Pizza Boy (1 track) on the singles shelf').toEqual(['Pizza Boy']);
      expect(s.albums, 'Expected nothing on albums').toHaveLength(0);
    });

    it('REQ-3 boundary: puts a 5-track EP in singles', () => {
      const s = run([['Five Track EP', 5]]);
      expect(primaries(s.singles), 'Expected a 5-track release to be a single/EP').toEqual(['Five Track EP']);
      expect(s.albums, 'Expected a 5-track release not to be an album').toHaveLength(0);
    });
  });

  // ─── REQ-4: alternates go to Other ──────────────────────────────────────────

  describe('REQ-4: a remix/live/alternate release goes in Other versions regardless of track count', () => {
    it('REQ-4: puts "Live with The No.6 Orchestra" (12 tracks) in other', () => {
      const s = run([['Live with The No.6 Orchestra', 12]]);
      expect(primaries(s.other), 'Expected a 12-track live release on the other shelf').toEqual([
        'Live with The No.6 Orchestra',
      ]);
      expect(s.albums, 'Expected a live release not to be an album despite 12 tracks').toHaveLength(0);
    });

    it('REQ-4: puts a lone remix in other', () => {
      const s = run([['Big Climb (Jack Foals Groove Remix)', 1]]);
      expect(primaries(s.other), 'Expected a remix with no original to be on other').toEqual([
        'Big Climb (Jack Foals Groove Remix)',
      ]);
      expect(s.singles, 'Expected the remix not to be a single').toHaveLength(0);
    });

    it.each([
      ['Foo (Remix)'],
      ['Foo (Remixes)'],
      ['Foo (Radio Mix)'],
      ['Foo (Live)'],
      ['Foo (Live at Brixton)'],
      ['Foo - Live'],
      ['Foo (Acoustic)'],
      ['Foo (Radio Edit)'],
      ['Foo (Single Version)'],
      ['Foo (Instrumental)'],
      ['Foo (Rework)'],
      ['Foo (Demo)'],
      ['Foo [Remix]'],
      ['Foo - Acoustic Version'],
      ['Live at Brixton Academy'],
      ['Concert Live from Leeds'],
      ['Live with The Orchestra'],
      ['LIVE AT THE ARENA'],
      ['foo (REMIX)'],
    ])('REQ-4: treats "%s" as an alternate (other shelf, even with 12 tracks)', (title) => {
      const s = run([[title, 12]]);
      expect(primaries(s.other), `Expected "${title}" to be on the other shelf`).toEqual([title]);
      expect(s.albums, `Expected "${title}" not to be on albums`).toHaveLength(0);
    });

    it('REQ-4: does not mistake "Man Alive" for a live release', () => {
      // "live" must match as a word / marker, not as a substring of "Alive".
      const s = run([['Man Alive', 12]]);
      expect(primaries(s.albums), 'Expected "Man Alive" (12 tracks) to be an album, not an alternate').toEqual([
        'Man Alive',
      ]);
    });

    it('REQ-4: does not mistake "Democracy" for a demo', () => {
      const s = run([['Democracy', 10]]);
      expect(primaries(s.albums), 'Expected "Democracy" to be an album, not an alternate').toEqual(['Democracy']);
    });
  });

  // ─── REQ-5: base title ──────────────────────────────────────────────────────

  describe('REQ-5: releases sharing a base title form one group', () => {
    it('REQ-5: stacks "Man Alive" and "Man Alive (Deluxe)" into one album group', () => {
      const s = run([
        ['Man Alive (Deluxe)', 16],
        ['Man Alive', 12],
      ]);
      expect(s.albums, 'Expected one group on albums').toHaveLength(1);
      expect(versionTitles(s.albums[0]).sort(), 'Expected both editions in the group').toEqual([
        'Man Alive',
        'Man Alive (Deluxe)',
      ]);
    });

    it('REQ-5: ignores case and surrounding whitespace in the base title', () => {
      const s = run([
        ['  MAN ALIVE (Deluxe) ', 16],
        ['man alive', 12],
      ]);
      expect(s.albums, 'Expected differently-cased titles to share one group').toHaveLength(1);
      expect(s.albums[0].versions, 'Expected both versions in the group').toHaveLength(2);
    });

    it('REQ-5: strips several trailing bracketed suffixes', () => {
      const s = run([
        ['Foo (Deluxe) [Remastered]', 16],
        ['Foo', 12],
      ]);
      expect(s.albums, 'Expected "Foo (Deluxe) [Remastered]" to stack with "Foo"').toHaveLength(1);
      expect(s.albums[0].primary.title, 'Expected the plain original to be primary').toBe('Foo');
    });

    it('REQ-5: strips square-bracket suffixes', () => {
      const s = run([
        ['Foo [Deluxe Edition]', 16],
        ['Foo', 12],
      ]);
      expect(s.albums, 'Expected "Foo [Deluxe Edition]" to stack with "Foo"').toHaveLength(1);
    });

    it('REQ-5: strips a trailing " - ..." suffix', () => {
      const s = run([
        ['Foo - Remastered 2011', 12],
        ['Foo', 12],
      ]);
      expect(s.albums, 'Expected "Foo - Remastered 2011" to stack with "Foo"').toHaveLength(1);
      expect(s.albums[0].primary.title, 'Expected the plain original to be primary').toBe('Foo');
    });

    it('REQ-5: keeps releases with different base titles in separate groups', () => {
      const s = run([
        ['Arc', 12],
        ['Arch Enemy', 12],
      ]);
      expect(s.albums, 'Expected "Arc" and "Arch Enemy" to remain separate groups').toHaveLength(2);
    });

    it('REQ-5: only removes trailing brackets, not leading or mid-title ones', () => {
      const s = run([
        ['(Part One) Bar', 12],
        ['Bar', 12],
      ]);
      expect(s.albums, 'Expected a non-trailing bracket to be kept, so these do not stack').toHaveLength(2);
    });
  });

  // ─── REQ-6: remixes stack with their original ───────────────────────────────

  describe('REQ-6: remixes stack with their original', () => {
    it('REQ-6: stacks "Can\'t Do" and "Can\'t Do (Blinkie Remix)" in one singles group', () => {
      const s = run([
        ["Can't Do", 1],
        ["Can't Do (Blinkie Remix)", 1],
      ]);
      expect(s.singles, 'Expected one stacked group on singles').toHaveLength(1);
      expect(s.singles[0].primary.title, 'Expected the original to be primary').toBe("Can't Do");
      expect(s.other, 'Expected the remix not to appear separately on other').toHaveLength(0);
    });

    it('REQ-6: stacks an album remix with its album, original first', () => {
      const s = run([
        ['Arc (James Rutledge Album Remix)', 12],
        ['Arc', 12],
      ]);
      expect(s.albums, 'Expected one stacked group on albums').toHaveLength(1);
      expect(versionTitles(s.albums[0]), 'Expected primary first, then the remix').toEqual([
        'Arc',
        'Arc (James Rutledge Album Remix)',
      ]);
      expect(s.other, 'Expected the remix album not to appear on other').toHaveLength(0);
    });

    it('REQ-6: stacks "Cold Reactor (Remixes)" with "Cold Reactor"', () => {
      const s = run([
        ['Cold Reactor (Remixes)', 4],
        ['Cold Reactor', 1],
      ]);
      expect(s.singles, 'Expected one stacked group on singles').toHaveLength(1);
      expect(versionTitles(s.singles[0]), 'Expected both in the group, original first').toEqual([
        'Cold Reactor',
        'Cold Reactor (Remixes)',
      ]);
    });
  });

  // ─── REQ-7: primary selection and shelf from primary ────────────────────────

  describe('REQ-7: primary choice and shelf', () => {
    it('REQ-7: prefers the plain original even when it appears after an edition', () => {
      const s = run([
        ['Foo (Deluxe)', 16],
        ['Foo', 12],
      ]);
      expect(s.albums[0].primary.title, 'Expected the plain original to be primary over Deluxe').toBe('Foo');
    });

    it('REQ-7: with no original, prefers an edition variant over an alternate', () => {
      const s = run([
        ['Foo (Remix)', 12],
        ['Foo (Deluxe)', 16],
      ]);
      expect(s.albums, 'Expected the group on albums as its primary is an edition').toHaveLength(1);
      expect(s.albums[0].primary.title, 'Expected Deluxe to be primary over the remix').toBe('Foo (Deluxe)');
    });

    it.each([
      ['Foo (Expanded)'],
      ['Foo (Remastered)'],
      ['Foo (Remaster)'],
      ['Foo (25th Anniversary)'],
      ['Foo (Special Edition)'],
      ['Foo (Bonus Tracks)'],
    ])('REQ-7: treats "%s" as an edition variant that beats an alternate as primary', (edition) => {
      const s = run([
        ['Foo (Live)', 12],
        [edition, 14],
      ]);
      expect(s.albums, `Expected "${edition}" to be primary so the group is on albums`).toHaveLength(1);
      expect(s.albums[0].primary.title, `Expected "${edition}" to be primary`).toBe(edition);
    });

    it('REQ-7: Get To Heaven (Expanded) at 2 and (Deluxe) at 40, no original -> one album group, Expanded primary', () => {
      const specs: Spec[] = Array.from({ length: 41 }, (_, i) => [`Filler ${i}`, 1] as Spec);
      specs[2] = ['Get To Heaven (Expanded)', 16];
      specs[40] = ['Get To Heaven (Deluxe)', 15];
      const s = run(specs);
      expect(s.albums, 'Expected a single album group').toHaveLength(1);
      expect(s.albums[0].primary.title, 'Expected the earlier edition (ties by input order) to be primary').toBe(
        'Get To Heaven (Expanded)'
      );
      expect(versionTitles(s.albums[0]), 'Expected primary first, then the other edition').toEqual([
        'Get To Heaven (Expanded)',
        'Get To Heaven (Deluxe)',
      ]);
    });

    it('REQ-7: with only alternates, the earliest in input order is primary and the group goes to other', () => {
      const s = run([
        ['Foo (Live)', 12],
        ['Foo (Acoustic)', 12],
      ]);
      expect(s.other, 'Expected one group on other').toHaveLength(1);
      expect(s.other[0].primary.title, 'Expected the first alternate to be primary').toBe('Foo (Live)');
      expect(s.albums, 'Expected nothing on albums when the primary is an alternate').toHaveLength(0);
    });

    it('REQ-7: shelf follows the primary track count, not the other versions', () => {
      const s = run([
        ['Foo (Deluxe)', 16],
        ['Foo', 1],
      ]);
      expect(s.singles, 'Expected the group on singles because the primary "Foo" has 1 track').toHaveLength(1);
      expect(s.singles[0].primary.title, 'Expected the original to be primary').toBe('Foo');
      expect(s.albums, 'Expected nothing on albums').toHaveLength(0);
    });

    it('REQ-7: an alternate primary sends the group to other even if another alternate has few tracks', () => {
      const s = run([
        ['Foo (Live)', 12],
        ['Foo (Remix)', 1],
      ]);
      expect(primaries(s.other), 'Expected the group on other').toEqual(['Foo (Live)']);
    });
  });

  // ─── REQ-8: identical titles ────────────────────────────────────────────────

  describe('REQ-8: releases with identical titles stack', () => {
    it('REQ-8: stacks two "A Fever Dream" items into one group', () => {
      const s = run([
        ['A Fever Dream', 11],
        ['Desire', 1],
        ['A Fever Dream', 11],
      ]);
      expect(s.albums, 'Expected one group for the two identical titles').toHaveLength(1);
      expect(s.albums[0].versions, 'Expected both items in the group').toHaveLength(2);
      expect(
        s.albums[0].versions.map((v) => releaseKey(v)),
        'Expected versions to keep input order for tied primaries'
      ).toEqual(['r0', 'r2']);
      expect(releaseKey(s.albums[0].primary), 'Expected the first identical item to be primary').toBe('r0');
    });
  });

  // ─── REQ-12: ordering ───────────────────────────────────────────────────────

  describe('REQ-12: shelves keep input order, groups placed by earliest member', () => {
    it('REQ-12: keeps single releases in input order', () => {
      const s = run([
        ['Third', 10],
        ['First', 10],
        ['Second', 10],
      ]);
      expect(primaries(s.albums), 'Expected albums in input order').toEqual(['Third', 'First', 'Second']);
    });

    it('REQ-12: places a group at the index of its earliest member, not its primary', () => {
      // "Man Alive (Deluxe)" is at index 1 and the original "Man Alive" at index 3.
      const s = run([
        ['Alpha', 10],
        ['Man Alive (Deluxe)', 16],
        ['Beta', 10],
        ['Man Alive', 12],
        ['Gamma', 10],
      ]);
      expect(primaries(s.albums), 'Expected Man Alive to sit where its Deluxe appears (before Beta)').toEqual([
        'Alpha',
        'Man Alive',
        'Beta',
        'Gamma',
      ]);
    });

    it('REQ-12: orders singles and other by earliest member too', () => {
      const s = run([
        ['Zed (Remix)', 1],
        ['Single B', 1],
        ['Zed', 1],
        ['Single A', 1],
        ['Yak (Live)', 1],
      ]);
      expect(primaries(s.singles), 'Expected the Zed group before Single A, after Single B').toEqual([
        'Single B',
        'Zed',
        'Single A',
      ]);
      expect(primaries(s.other), 'Expected other to hold the lone live release').toEqual(['Yak (Live)']);
    });
  });

  // ─── REQ-13: missing track counts ───────────────────────────────────────────

  describe('REQ-13: missing track count falls back to title only', () => {
    it('REQ-13: puts a plain release with no count in albums', () => {
      const s = run([['Mystery Release']]);
      expect(primaries(s.albums), 'Expected an unknown-count release to default to albums').toEqual([
        'Mystery Release',
      ]);
    });

    it('REQ-13: puts an alternate with no count in other', () => {
      const s = run([['Mystery Release (Remix)']]);
      expect(primaries(s.other), 'Expected an unknown-count alternate to go to other').toEqual([
        'Mystery Release (Remix)',
      ]);
      expect(s.albums, 'Expected nothing on albums').toHaveLength(0);
    });

    it('REQ-13: classifies a group by its primary when the primary has no count', () => {
      const s = run([['Foo (Deluxe)', 16], ['Foo']]);
      expect(primaries(s.albums), 'Expected the group on albums as the primary has no known count').toEqual(['Foo']);
    });
  });

  // ─── Realistic: Everything Everything ───────────────────────────────────────

  describe('realistic artist page (Everything Everything, newest first)', () => {
    const specs: Spec[] = [
      ['A Very Bad Dream', 1],
      ['Nothing But Green Lights', 1],
      ['Get To Heaven (Expanded)', 16],
      ['Mountainhead', 11],
      ['The End of the Contender', 1],
      ['Cold Reactor (Remixes)', 4],
      ['The Mad Stone', 1],
      ['Cold Reactor', 1],
      ['Man Alive (Deluxe)', 16],
      ['Riot On The Ward', 1],
      ['Pizza Boy (Skream Remix)', 1],
      ['Raw Data Feel', 14],
      ['Pizza Boy', 1],
      ['I Want A Love Like This', 1],
      ['Teletype', 1],
      ['Bad Friday', 1],
      ['Mercury & Me', 1],
      ["Natural's Not in It", 1],
      ['SUPERNORMAL', 1],
      ['Big Climb (Jack Foals Groove Remix)', 1],
      ['Black Hyena (IOE AIE Remix)', 1],
      ['RE-ANIMATOR', 11],
      ['Violent Sun', 1],
      ['Planets', 1],
      ['Arch Enemy', 1],
      ['In Birdsong', 1],
      ['Live with The No.6 Orchestra', 12],
      ['A Deeper Sea', 1],
      ['A Fever Dream', 11],
      ['Desire', 1],
      ['A Fever Dream', 11],
      ["Can't Do", 1],
      ["Can't Do (Blinkie Remix)", 1],
      ['I Believe It Now', 1],
      ['Get To Heaven (Deluxe)', 15],
      ['Regret', 1],
      ['Distant Past', 1],
      ['Distant Past (Alex Metric Remix)', 1],
      ['Arc (James Rutledge Album Remix)', 12],
      ['Arc', 12],
      ['Cough Cough', 1],
      ['Man Alive', 12],
      ["Schoolin'", 1],
      ['MY KZ, UR BF', 1],
      ['Photoshop Handsome (Remix)', 1],
    ];

    it('albums shelf holds the seven expected primaries in input order', () => {
      const s = run(specs);
      expect(primaries(s.albums), 'Expected the albums shelf primaries, in order of earliest member').toEqual([
        'Get To Heaven (Expanded)',
        'Mountainhead',
        'Man Alive',
        'Raw Data Feel',
        'RE-ANIMATOR',
        'A Fever Dream',
        'Arc',
      ]);
    });

    it('stacks the Cold Reactor remixes with the 1-track original on singles', () => {
      const s = run(specs);
      const group = s.singles.find((g) => g.primary.title === 'Cold Reactor');
      expect(group, 'Expected Cold Reactor (1 track) as a primary on the singles shelf').toBeDefined();
      expect(versionTitles(group!), 'Expected the original first, then the remixes').toEqual([
        'Cold Reactor',
        'Cold Reactor (Remixes)',
      ]);
    });

    it('leaves only unstackable alternates on the other shelf, in input order', () => {
      const s = run(specs);
      expect(primaries(s.other), 'Expected other to hold only alternates with no original').toEqual([
        'Big Climb (Jack Foals Groove Remix)',
        'Black Hyena (IOE AIE Remix)',
        'Live with The No.6 Orchestra',
        'Photoshop Handsome (Remix)',
      ]);
    });

    it('places every input release in exactly one group', () => {
      const s = run(specs);
      const total = [...s.albums, ...s.singles, ...s.other].reduce((n, g) => n + g.versions.length, 0);
      expect(total, 'Expected every one of the input releases to appear exactly once across the shelves').toBe(
        specs.length
      );
    });
  });
});
