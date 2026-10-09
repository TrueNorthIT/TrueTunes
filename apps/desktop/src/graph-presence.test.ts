// Run: npm run test:main — node's built-in runner, no framework needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoster, isInOffice, type GraphPresence } from './graph-presence.ts';

/**
 * A real Graph response from the TrueNorth tenant, trimmed to the fields we use.
 * Keeping the genuine data means the awkward cases stay in the fixture rather
 * than being tidied into shapes that happen to suit the code.
 */
const REAL: GraphPresence[] = [
  { id: 'o-elliot',  availability: 'Available',       workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-rich',    availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-bog',     availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-sam',     availability: 'Available',       workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-abbie',   availability: 'Available',       workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-alex',    availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-joe',     availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  // Rostered into the office but never signed in — the case that matters.
  { id: 'o-simrah',  availability: 'Offline',         workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-steve',   availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  { id: 'o-fergus',  availability: 'Offline',         workLocation: undefined },
  { id: 'o-longalex',availability: 'Available',       workLocation: { workLocationType: 'remote', source: 'scheduled' } },
  { id: 'o-aidan',   availability: 'Available',       workLocation: { workLocationType: 'office', source: 'scheduled' } },
  { id: 'o-josh',    availability: 'Available',       workLocation: { workLocationType: 'remote', source: 'manual' } },
  { id: 'o-kade',    availability: 'Available',       workLocation: { workLocationType: 'office', source: 'automatic' } },
  // No Teams licence, or never signed in. Third-heaviest queuer in the office.
  { id: 'o-muhamad', availability: 'PresenceUnknown', workLocation: undefined },
];

const NAMES: Record<string, string> = {
  'o-elliot': 'Elliot', 'o-rich': 'Rich', 'o-bog': 'Bog', 'o-sam': 'Sam',
  'o-abbie': 'Abbie', 'o-alex': 'Alex', 'o-joe': 'Joe Pitts', 'o-simrah': 'Simrah',
  'o-steve': 'Not Steve', 'o-fergus': 'Fergus Westlake', 'o-longalex': 'Long Alex',
  'o-aidan': 'Aidan', 'o-josh': 'Josh', 'o-kade': 'Kade',
  'o-muhamad': 'Muhamad',
};

test('builds the room from sensed presence, not availability or intent', () => {
  const roster = resolveRoster(REAL, NAMES);
  assert.equal(roster.basis, 'sensed');
  // Only the six Teams actually detected on the office network.
  assert.deepEqual(
    roster.inOffice.sort(),
    ['Alex', 'Bog', 'Joe Pitts', 'Kade', 'Not Steve', 'Rich'],
  );
});

test('rostered-but-never-detected is treated as absent', () => {
  // Elliot and Aidan are Available and scheduled 'office', but Teams never saw
  // them on the network — and it saw six colleagues, so detection works here.
  const roster = resolveRoster(REAL, NAMES);
  for (const name of ['Elliot', 'Aidan']) {
    assert.ok(!roster.inOffice.includes(name), `${name} was only rostered`);
  }
});

test('falls back to rostered intent when nothing is being sensed', () => {
  const noSensing = REAL.map((p) =>
    p.workLocation?.source === 'automatic'
      ? { ...p, workLocation: { ...p.workLocation, source: 'scheduled' as const } }
      : p,
  );
  const roster = resolveRoster(noSensing, NAMES);
  assert.equal(roster.basis, 'rostered');
  assert.equal(roster.observed, 0);
  // Everyone marked office and signed in — Simrah still excluded, she's Offline.
  assert.ok(roster.inOffice.includes('Elliot'));
  assert.ok(!roster.inOffice.includes('Simrah'));
});

test('a rostered no-show is not in the room', () => {
  // Simrah is workLocationType 'office' but Offline — scheduled in, never arrived.
  const roster = resolveRoster(REAL, NAMES);
  assert.ok(!roster.inOffice.includes('Simrah'));
  assert.ok(!isInOffice(REAL.find((p) => p.id === 'o-simrah')!));
});

test('people working from home are excluded even while fully available', () => {
  const roster = resolveRoster(REAL, NAMES);
  for (const name of ['Sam', 'Abbie', 'Long Alex', 'Josh']) {
    assert.ok(!roster.inOffice.includes(name), `${name} is remote today`);
  }
});

test('counts what was observed', () => {
  const roster = resolveRoster(REAL, NAMES);
  assert.equal(roster.observed, 6);
  assert.equal(roster.inOffice.length, 6);
});

/**
 * Muhamad was a student placement, returning next year. PresenceUnknown is the
 * right answer for him — he isn't in the room. His queue history still feeds the
 * recommender; he simply isn't a listener today.
 */
test('someone with no Teams presence is left out rather than guessed at', () => {
  const roster = resolveRoster(REAL, NAMES);
  assert.ok(!roster.inOffice.includes('Muhamad'));
  // They must still appear in the detail so the UI can explain the omission.
  assert.ok(roster.detail.some((d) => d.userId === 'Muhamad'));
});

test('falls back to availability only when nobody sets a work location', () => {
  const noLocation: GraphPresence[] = [
    { id: 'a', availability: 'Available', workLocation: { workLocationType: 'unspecified' } },
    { id: 'b', availability: 'Offline' },
  ];
  const roster = resolveRoster(noLocation, { a: 'Ann', b: 'Ben' });
  assert.equal(roster.basis, 'availability');
  assert.deepEqual(roster.inOffice, ['Ann']);
  assert.equal(roster.observed, 0);
});

test('reports "none" when there is nothing to go on', () => {
  const roster = resolveRoster(
    [{ id: 'a', availability: 'Offline' }],
    { a: 'Ann' },
  );
  assert.equal(roster.basis, 'none');
  assert.deepEqual(roster.inOffice, []);
});
