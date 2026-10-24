import { describe, it, expect } from 'vitest';
import { actDrivers, groupUnheard, interleave, songKey, splitRoom } from '../discover';

const act = (artist: string, heard: string[] = []): DjArtist => ({
  artist,
  artistId: artist,
  serviceId: 's',
  accountId: 'a',
  score: 1,
  because: `Rich queues ${artist}`,
  heardTrackKeys: heard,
});
const song = (title: string, artists?: string[]) => ({ title, artists });

describe('groupUnheard', () => {
  it('keeps each act together, in rank order, without what the office has heard', () => {
    const groups = groupUnheard(
      [act('Muse', ['Uprising||Muse']), act('Jungle')],
      [[song('Uprising'), song('Hysteria'), song('Madness')], [song('Back On 74')]],
      { perAct: 3 }
    );
    expect(groups.map((g) => [g.act.artist, g.tracks.map((t) => t.title)])).toEqual([
      ['Muse', ['Hysteria', 'Madness']],
      ['Jungle', ['Back On 74']],
    ]);
  });

  it('matches heard tracks on the credited artist as well as the act', () => {
    const [g] = groupUnheard(
      [act('Gorillaz', ['Feel Good Inc.||Gorillaz feat. De La Soul'])],
      [[song('Feel Good Inc.', ['Gorillaz feat. De La Soul']), song('On Melancholy Hill', ['Gorillaz'])]],
      { perAct: 3 }
    );
    expect(g.tracks.map((t) => t.title)).toEqual(['On Melancholy Hill']);
  });

  it('caps each act and drops acts with nothing new or still loading', () => {
    const groups = groupUnheard(
      [act('Muse'), act('HAIM', ['Want You Back||HAIM']), act('Gorillaz')],
      [[song('a'), song('b'), song('c'), song('d')], [song('Want You Back')], undefined],
      { perAct: 3 }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].tracks).toHaveLength(3);
  });
});

describe('groupUnheard: what is already queued or repeated', () => {
  it('drops what is in the queue now, since DJ picks never reach the history', () => {
    const [g] = groupUnheard([act('Connan Mockasin')], [[song('Explorer'), song('Forever Dolphin Love')]], {
      perAct: 3,
      queued: [{ title: 'Explorer', artist: 'Connan Mockasin' }],
    });
    expect(g.tracks.map((t) => t.title)).toEqual(['Forever Dolphin Love']);
  });

  it('matches a queued collaboration on any of its artists, and in any version', () => {
    const groups = groupUnheard([act('Tame Impala')], [[song('Neverender'), song('Elephant')]], {
      perAct: 3,
      queued: [{ title: 'Neverender (Radio Edit)', artist: 'Justice, Tame Impala' }],
    });
    expect(groups[0].tracks.map((t) => t.title)).toEqual(['Elephant']);
  });

  it('falls back to the title when the queue item has no artist', () => {
    const [g] = groupUnheard([act('Tame Impala')], [[song('Neverender (Radio Edit)'), song('Elephant')]], {
      perAct: 3,
      queued: [{ title: 'Neverender', artist: '' }],
    });
    expect(g.tracks.map((t) => t.title)).toEqual(['Elephant']);
  });

  it('leaves a same-named song by another act alone', () => {
    const [g] = groupUnheard([act('Muse')], [[song('Explorer')]], {
      perAct: 3,
      queued: [{ title: 'Explorer', artist: 'Connan Mockasin' }],
    });
    expect(g.tracks).toHaveLength(1);
  });

  it('shows a song once, under the higher-ranked act, whatever the version', () => {
    const groups = groupUnheard(
      [act('Justice'), act('Tame Impala')],
      [
        [song('Neverender (Radio Edit)'), song('D.A.N.C.E.')],
        [song('Neverender'), song('Elephant'), song('Neverender - Remastered')],
      ],
      { perAct: 3 }
    );
    expect(groups.map((g) => g.tracks.map((t) => t.title))).toEqual([
      ['Neverender (Radio Edit)', 'D.A.N.C.E.'],
      ['Elephant'],
    ]);
  });

  it('treats an inline featured credit as the same song', () => {
    const [g] = groupUnheard(
      [act('M-Beat')],
      [[song('Sweet Love'), song('Sweet Love Ft Nazlyn'), song('Incredible Dub')]],
      { perAct: 3 }
    );
    expect(g.tracks.map((t) => t.title)).toEqual(['Sweet Love', 'Incredible Dub']);
    expect(songKey('Do I Wanna Know? feat. Nobody')).toBe(songKey('Do I Wanna Know?'));
    // "ft" inside a word is not a credit.
    expect(songKey('Left Hand Free')).toBe('left hand free');
  });

  it('treats a heard version as heard', () => {
    const [g] = groupUnheard(
      [act('Justice', ['Neverender (Radio Edit)||Justice, Tame Impala'])],
      [[song('Neverender'), song('Genesis')]],
      { perAct: 3 }
    );
    expect(g.tracks.map((t) => t.title)).toEqual(['Genesis']);
  });

  it('moves to the next tracks each round, wrapping round the pool', () => {
    const songs = [['a', 'b', 'c', 'd', 'e'].map((t) => song(t))];
    const titles = (round: number) =>
      groupUnheard([act('A')], songs, { perAct: 3, round })[0].tracks.map((t) => t.title);
    expect(titles(0)).toEqual(['a', 'b', 'c']);
    expect(titles(1)).toEqual(['d', 'e', 'a']);
    // A pool no bigger than the window never moves.
    expect(
      groupUnheard([act('B')], [[song('x'), song('y')]], { perAct: 3, round: 4 })[0].tracks.map((t) => t.title)
    ).toEqual(['x', 'y']);
  });
});

describe('interleave', () => {
  it('takes one per act per round, up to the cap', () => {
    const groups = groupUnheard([act('A'), act('B')], [[song('a1'), song('a2')], [song('b1')]], { perAct: 3 });
    expect(interleave(groups, 10).map((x) => x.track.title)).toEqual(['a1', 'b1', 'a2']);
    expect(interleave(groups, 2).map((x) => x.track.title)).toEqual(['a1', 'b1']);
    expect(interleave([], 5)).toEqual([]);
  });
});

describe('actDrivers', () => {
  it('names the people behind an act, without the act', () => {
    expect(actDrivers('Rich, Long Alex, Sam and others queue Muse', 'Muse')).toBe('Rich, Long Alex, Sam and others');
    expect(actDrivers('Alex queues Marina and The Diamonds', 'Marina and The Diamonds')).toBe('Alex');
  });

  it('calls the viewer "You", and leaves an and inside a name alone', () => {
    expect(actDrivers('Rich, Joe Pitts and Alex queue M-Beat', 'M-Beat', 'Joe Pitts')).toBe('Rich, You and Alex');
    expect(actDrivers('Rich and Alex queue Justice', 'Justice', 'Alex')).toBe('Rich and You');
  });

  it('passes through anything that is not a fan credit', () => {
    expect(actDrivers('Popular with the office', 'Muse')).toBe('Popular with the office');
  });
});

describe('splitRoom', () => {
  const users = [{ userId: 'Rich' }, { userId: 'Alex' }, { userId: 'Sam' }];
  const ids = (us: { userId: string }[]) => us.map((u) => u.userId);

  it('puts whoever presence detected first, and the rest away', () => {
    const r = splitRoom(users, { selected: [], inOffice: ['Alex'], listeners: ['Rich'] });
    expect(r.basis).toBe('presence');
    expect(ids(r.present)).toEqual(['Alex']);
    expect(ids(r.away)).toEqual(['Rich', 'Sam']);
  });

  it('lets a hand-picked selection win', () => {
    const r = splitRoom(users, { selected: ['Sam'], inOffice: ['Alex'], listeners: [] });
    expect(r.basis).toBe('chosen');
    expect(ids(r.present)).toEqual(['Sam']);
  });

  it('falls back to whoever has been queueing when presence detects nobody', () => {
    const r = splitRoom(users, { selected: [], inOffice: [], listeners: ['Rich', 'Sam'] });
    expect(r.basis).toBe('queueing');
    expect(ids(r.present)).toEqual(['Rich', 'Sam']);
    expect(ids(r.away)).toEqual(['Alex']);
  });

  it('never labels the whole office away when nobody is known', () => {
    const r = splitRoom(users, { selected: [], inOffice: [], listeners: [] });
    expect(r.basis).toBe('everyone');
    expect(r.away).toEqual([]);
    expect(ids(r.present)).toEqual(['Rich', 'Alex', 'Sam']);
  });
});
