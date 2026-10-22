import { describe, it, expect } from 'vitest';
import { actDrivers, groupUnheard, interleave, splitRoom } from '../discover';

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
      3,
    );
    expect(groups.map((g) => [g.act.artist, g.tracks.map((t) => t.title)])).toEqual([
      ['Muse', ['Hysteria', 'Madness']],
      ['Jungle', ['Back On 74']],
    ]);
  });

  it('matches heard tracks on the credited artist as well as the act', () => {
    const [g] = groupUnheard([act('Gorillaz', ['Feel Good Inc.||Gorillaz feat. De La Soul'])], [[
      song('Feel Good Inc.', ['Gorillaz feat. De La Soul']),
      song('On Melancholy Hill', ['Gorillaz']),
    ]], 3);
    expect(g.tracks.map((t) => t.title)).toEqual(['On Melancholy Hill']);
  });

  it('caps each act and drops acts with nothing new or still loading', () => {
    const groups = groupUnheard(
      [act('Muse'), act('HAIM', ['Want You Back||HAIM']), act('Gorillaz')],
      [[song('a'), song('b'), song('c'), song('d')], [song('Want You Back')], undefined],
      3,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].tracks).toHaveLength(3);
  });
});

describe('interleave', () => {
  it('takes one per act per round, up to the cap', () => {
    const groups = groupUnheard([act('A'), act('B')], [[song('a1'), song('a2')], [song('b1')]], 3);
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
