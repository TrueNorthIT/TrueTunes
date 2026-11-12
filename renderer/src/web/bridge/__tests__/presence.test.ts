// resolveRoster and isInOffice are ported from src/graph-presence.test.ts (the real Graph fixture is kept as it was).
import { describe, it, expect } from 'vitest';
import { resolveRoster, isInOffice, fetchPresences, PRESENCE_SCOPE, type GraphPresence } from '../presence';
import { FakeFetch, fakeAuth, json, makeBridge, text } from './helpers';

const REAL: GraphPresence[] = [
  { id: 'o-elliot', availability: 'Available', workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-rich', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-bog', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-sam', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-abbie', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-alex', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-joe', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  // Rostered into the office but never signed in: the case that matters.
  { id: 'o-simrah', availability: 'Offline', workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-steve', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-fergus', availability: 'Offline', workLocation: undefined },
  { id: 'o-longalex', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-aidan', availability: 'Available', workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-josh', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'manual' } },
  { id: 'o-kade', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
  // No Teams licence, or never signed in.
  { id: 'o-muhamad', availability: 'PresenceUnknown', workLocation: undefined },
];

const NAMES: Record<string, string> = {
  'o-elliot': 'Elliot',
  'o-rich': 'Rich',
  'o-bog': 'Bog',
  'o-sam': 'Sam',
  'o-abbie': 'Abbie',
  'o-alex': 'Alex',
  'o-joe': 'Joe Pitts',
  'o-simrah': 'Simrah',
  'o-steve': 'Not Steve',
  'o-fergus': 'Fergus Westlake',
  'o-longalex': 'Long Alex',
  'o-aidan': 'Aidan',
  'o-josh': 'Josh',
  'o-kade': 'Kade',
  'o-muhamad': 'Muhamad',
};

describe('resolveRoster', () => {
  it('builds the room from sensed presence, not availability or intent', () => {
    const roster = resolveRoster(REAL, NAMES);
    expect(roster.basis).toBe('sensed');
    expect([...roster.inOffice].sort()).toEqual(['Alex', 'Bog', 'Joe Pitts', 'Kade', 'Not Steve', 'Rich']);
  });

  it('treats rostered-but-never-detected as absent', () => {
    const roster = resolveRoster(REAL, NAMES);
    for (const name of ['Elliot', 'Aidan']) expect(roster.inOffice).not.toContain(name);
  });

  it('falls back to rostered intent when nothing is being sensed', () => {
    const noSensing = REAL.map((p) =>
      p.workLocation?.source === 'automatic'
        ? { ...p, workLocation: { ...p.workLocation, source: 'scheduled' as const } }
        : p
    );
    const roster = resolveRoster(noSensing, NAMES);
    expect(roster.basis).toBe('rostered');
    expect(roster.observed).toBe(0);
    expect(roster.inOffice).toContain('Elliot');
    expect(roster.inOffice).not.toContain('Simrah');
  });

  it('a rostered no-show is not in the room', () => {
    const roster = resolveRoster(REAL, NAMES);
    expect(roster.inOffice).not.toContain('Simrah');
    expect(
      isInOffice({
        id: 'o-simrah',
        availability: 'Offline',
        workLocation: { workLocationType: 'office', source: 'scheduled' },
      })
    ).toBe(false);
  });

  it('excludes people working from home even while fully available', () => {
    const roster = resolveRoster(REAL, NAMES);
    for (const name of ['Sam', 'Abbie', 'Long Alex', 'Josh']) expect(roster.inOffice).not.toContain(name);
  });

  it('counts what was observed', () => {
    const roster = resolveRoster(REAL, NAMES);
    expect(roster.observed).toBe(6);
    expect(roster.inOffice).toHaveLength(6);
  });

  it('leaves out someone with no Teams presence but keeps them in the detail', () => {
    const roster = resolveRoster(REAL, NAMES);
    expect(roster.inOffice).not.toContain('Muhamad');
    expect(roster.detail.some((d) => d.userId === 'Muhamad')).toBe(true);
  });

  it('falls back to availability only when nobody sets a work location', () => {
    const noLocation: GraphPresence[] = [
      { id: 'a', availability: 'Available', workLocation: { workLocationType: 'unspecified' } },
      { id: 'b', availability: 'Offline' },
    ];
    const roster = resolveRoster(noLocation, { a: 'Ann', b: 'Ben' });
    expect(roster.basis).toBe('availability');
    expect(roster.inOffice).toEqual(['Ann']);
    expect(roster.observed).toBe(0);
  });

  it('reports "none" when there is nothing to go on', () => {
    const roster = resolveRoster([{ id: 'a', availability: 'Offline' }], { a: 'Ann' });
    expect(roster.basis).toBe('none');
    expect(roster.inOffice).toEqual([]);
  });
});

describe('fetchPresences', () => {
  it('posts ids in batches of 650 with the Graph token', async () => {
    const fake = new FakeFetch();
    const url = 'https://graph.microsoft.com/v1.0/communications/getPresencesByUserId';
    fake.on('POST', url, (c) => json({ value: (c.json() as { ids: string[] }).ids.map((id) => ({ id })) }));
    const oids = Array.from({ length: 1300 }, (_, i) => `o${i}`);
    const got = await fetchPresences(fake.fetch, 'g-tok', oids);
    expect(got).toHaveLength(1300);
    expect(fake.calls).toHaveLength(2);
    expect((fake.calls[0].json() as { ids: string[] }).ids).toHaveLength(650);
    expect(fake.calls[0].headers['authorization']).toBe('Bearer g-tok');
    expect(fake.calls[0].headers['content-type']).toBe('application/json');
  });

  it('throws with the status and the start of the detail when Graph refuses', async () => {
    const fake = new FakeFetch();
    fake.on('POST', /graph/, () => text('x'.repeat(300), 403));
    await expect(fetchPresences(fake.fetch, 't', ['a'])).rejects.toThrow(`Graph presence 403: ${'x'.repeat(200)}`);
  });
});

describe('fetchOfficePresence', () => {
  const GRAPH = 'https://graph.microsoft.com/v1.0/communications/getPresencesByUserId';
  const none = (error?: string) => ({
    inOffice: [],
    basis: 'none',
    observed: 0,
    detail: [],
    ...(error ? { error } : {}),
  });

  it('says so when nobody is signed in', async () => {
    const h = makeBridge({ auth: fakeAuth({ signedIn: null }) });
    expect(await h.bridge.fetchOfficePresence()).toEqual(none('not signed in'));
  });

  it('falls back when there is no presence consent', async () => {
    const h = makeBridge({ auth: fakeAuth({ graph: null }) });
    expect(await h.bridge.fetchOfficePresence()).toEqual(none('no presence consent'));
    expect(h.fake.calls).toHaveLength(0);
  });

  it('builds the roster from /fn/users and Graph', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/users', () =>
      json([
        { userId: 'Ann', entraOid: 'o1' },
        { userId: 'Ben', entraOid: 'o2' },
        { userId: 'Cy', entraOid: null },
        { userId: 'Di' },
      ])
    );
    h.fake.on('POST', GRAPH, () =>
      json({
        value: [
          { id: 'o1', availability: 'Available', workLocation: { workLocationType: 'office', source: 'automatic' } },
          { id: 'o2', availability: 'Available', workLocation: { workLocationType: 'remote', source: 'manual' } },
        ],
      })
    );
    const r = await h.bridge.fetchOfficePresence();
    expect(r).toMatchObject({ inOffice: ['Ann'], basis: 'sensed', observed: 1 });
    expect(h.auth.graphCalls).toEqual([[PRESENCE_SCOPE]]);
    expect(PRESENCE_SCOPE).toBe('https://graph.microsoft.com/Presence.Read.All');
    const graph = h.fake.calls.filter((c) => c.url === GRAPH)[0];
    expect(graph.headers['authorization']).toBe('Bearer graph-tok');
    expect(graph.json()).toEqual({ ids: ['o1', 'o2'] });
    // the Functions call carries the Entra token, Graph carries the Graph token and nothing else
    expect(h.fake.to('/fn/users')[0].headers['authorization']).toBe('Bearer tok-1');
  });

  it('answers none when nobody has an Entra oid', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/users', () => json([{ userId: 'Cy' }]));
    expect(await h.bridge.fetchOfficePresence()).toEqual(none());
    expect(h.fake.calls.some((c) => c.url === GRAPH)).toBe(false);
  });

  it('puts a Graph failure in the error', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/fn/users', () => json([{ userId: 'Ann', entraOid: 'o1' }]));
    h.fake.on('POST', GRAPH, () => text('denied', 403));
    const r = await h.bridge.fetchOfficePresence();
    expect(r.inOffice).toEqual([]);
    expect(r.error).toContain('Graph presence 403: denied');
  });
});
