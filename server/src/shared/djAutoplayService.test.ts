// Run: npm test (from server/).
// One test: npx tsc -p tsconfig.test.json && node --test --test-name-pattern "D-2 service" dist-test/shared/djAutoplayService.test.js
//
// Service-level tests for the DJ auto-queue fix. They drive
// createDjAutoplayService (server/src/shared/djAutoplayService.ts — new, currently
// a stub that throws NotImplemented) with in-memory stores, an injected clock and
// a tiny Sonos queue (djKit.testkit.ts). No Cosmos, no Date mocking.
//
// To see how TODAY's behaviour fares against exactly these tests, run with
//   DJ_IMPL=legacy
// which swaps in a faithful re-implementation of the current dj-autoplay.ts
// logic (commit a669b2c) behind the same interface.
//
// Requirement IDs (agreed with the product owner):
//   D-1  never enqueue a song (name+artist key, not uri) already enqueued by the DJ
//        or hand-queued earlier the same Europe/London day — across groups,
//        sessions, restarts, queue clears and re-keyed uris.
//   D-2  the day's used-record is durable and written atomically BEFORE a client is
//        told to enqueue; racing clients cannot both get the same pick.
//   D-3  the DJ keeps finding candidates as the day's exclusions grow.
//   D-4  hand-queued songs come from a cheap query bounded by London midnight; the
//        heavy all-time history is cached for a few minutes.
//   D-5  request/response shapes of POST /api/dj/autoplay are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import type { AutoplayResponse } from './djAutoplayService';
import { djAutoplayHandler } from '../functions/dj-autoplay';
import {
  buildHistory,
  djRanking,
  makeWorld,
  MiniRoom,
  asSong,
  handQueueFavourite,
  songKey,
  USERS,
  T0,
  MINUTE,
  LONDON_MIDNIGHT_20_OCT,
  type World,
} from './djKit.testkit';

const G1 = 'group-1';
const G2 = 'group-2';
const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const SEC = 1000;

/** Standard office: 6 acts x 4 songs, both listeners know all of them. */
function office(artists = 6, tracksPerArtist = 4) {
  const history = buildHistory({ now: T0, artists, tracksPerArtist });
  const w = makeWorld({ events: history });
  return { w, history, ranking: djRanking(history) };
}

function poll(
  w: World,
  room: MiniRoom,
  o: { group?: string; client?: string; enable?: boolean; svc?: World['svc']; oldClient?: boolean } = {}
): Promise<AutoplayResponse> {
  return (o.svc ?? w.svc).handle(
    room.body(
      o.group ?? G1,
      o.client ?? CLIENT_A,
      { users: USERS, ...(o.enable ? { setEnabled: true } : {}) },
      { oldClient: o.oldClient }
    )
  );
}

/** Poll; if the coordinator tells this client to enqueue, perform the add. */
async function pollAndLand(w: World, room: MiniRoom, o: Parameters<typeof poll>[2] = {}): Promise<AutoplayResponse> {
  const r = await poll(w, room, o);
  if (r.enqueue && r.leaseHeld) room.land(asSong(r.enqueue));
  return r;
}

/**
 * One office "step": poll, perform every add the coordinator asks for, and keep
 * polling (1s apart) until a poll asks for nothing — so the last parked filler has
 * been seen in a snapshot, as it would be within a few real 10s polls.
 * Returns the keys of the songs handed out.
 */
async function settle(
  w: World,
  room: MiniRoom,
  o: { enableFirst?: boolean; svc?: World['svc']; group?: string; client?: string } = {}
): Promise<string[]> {
  const handedOut: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await pollAndLand(w, room, {
      svc: o.svc,
      group: o.group,
      client: o.client,
      enable: o.enableFirst === true && i === 0,
    });
    if (!r.enqueue) break;
    handedOut.push(songKey(r.enqueue));
    w.advance(SEC);
  }
  return handedOut;
}

const keyOf = (t: { trackName: string; artist: string } | null | undefined): string | null => (t ? songKey(t) : null);

// ===========================================================================
// D-1  Never repeat a song within the London day
// ===========================================================================

test('D-1 service: a song a person hand-queued earlier today is not enqueued, even though its uri differs', async () => {
  const { w } = office();
  // The person's add was logged under a different (re-keyed) uri.
  const top = handQueueFavourite(w, { logAs: (s) => ({ ...s, uri: `${s.uri}#as-logged-by-person` }) });
  w.advance(30 * MINUTE);

  const r = await poll(w, new MiniRoom(), { enable: true });

  assert.ok(r.enqueue, 'Expected the DJ to enqueue something (other songs are unused)');
  assert.notEqual(
    keyOf(r.enqueue),
    songKey(top),
    `Expected "${top.trackName}" by ${top.artist} to be skipped because a person queued it earlier today`
  );
  assert.ok(
    !r.upcoming.some((t) => songKey(t) === songKey(top)),
    'Expected the hand-queued song to be missing from the preview as well'
  );
});

test('D-1 service: hand-queued exclusion is by normalised name+artist (case and spacing ignored)', async () => {
  const { w } = office();
  const top = handQueueFavourite(w, {
    logAs: (s) => ({
      trackName: `  ${s.trackName.toUpperCase()} `,
      artist: s.artist.toLowerCase(),
      uri: 'uri:somewhere-else',
    }),
  });
  w.advance(10 * MINUTE);

  const r = await poll(w, new MiniRoom(), { enable: true });

  assert.notEqual(
    keyOf(r.enqueue),
    songKey(top),
    'Expected a differently-cased hand-queued title to still count as the same song'
  );
});

test("D-1 service: an old client (no queueKeys / nowPlayingKey / nowPlayingIndex) still gets today's hand-queued songs excluded", async () => {
  const { w } = office();
  const top = handQueueFavourite(w);
  w.advance(MINUTE);

  const r = await poll(w, new MiniRoom(), { enable: true, oldClient: true });

  assert.ok(r.enqueue, 'Expected a pick for an old client');
  assert.notEqual(
    keyOf(r.enqueue),
    songKey(top),
    'Expected exclusion to come from the server-side day record, not from client-supplied queue keys'
  );
});

test('D-1 service: a song hand-queued at London midnight exactly belongs to today and is excluded', async () => {
  const { w } = office();
  const top = handQueueFavourite(w, { at: LONDON_MIDNIGHT_20_OCT });

  const r = await poll(w, new MiniRoom(), { enable: true });

  assert.notEqual(
    keyOf(r.enqueue),
    songKey(top),
    'Expected a song queued at 00:00 BST on the 20th to count as "today" at 10:00 BST on the 20th'
  );
});

test('D-1 service: a song hand-queued before London midnight (yesterday) is still eligible today', async () => {
  const { w } = office();
  const top = handQueueFavourite(w, { at: LONDON_MIDNIGHT_20_OCT - 1 });

  const r = await poll(w, new MiniRoom(), { enable: true });

  assert.equal(
    keyOf(r.enqueue),
    songKey(top),
    "Expected yesterday's hand-queued song (23:59:59.999 BST on the 19th) to remain a normal candidate"
  );
});

test('D-1 service: a pick whose add never landed is not enqueued a second time when the failed-add timeout expires', async () => {
  const { w } = office();
  const room = new MiniRoom();
  const first = await poll(w, room, { enable: true });
  assert.ok(first.enqueue, 'test setup: first poll enqueues a pick');

  // The client's add fails: the pick never shows up in any queue snapshot.
  w.advance(61 * SEC);
  const second = await poll(w, room);

  assert.notEqual(
    keyOf(second.enqueue),
    keyOf(first.enqueue),
    `Expected the already-handed-out song "${first.enqueue?.trackName}" not to be offered again after the 60s neverLanded timeout`
  );
});

test('D-1/D-2 service: when the lease flips to a client with a stale snapshot, the pick already handed out is not handed out again', async () => {
  const { w } = office();
  const room = new MiniRoom();
  const first = await poll(w, room, { enable: true, client: CLIENT_A });
  assert.ok(first.enqueue && first.leaseHeld, 'test setup: client A holds the lease and is told to enqueue');
  const firstKey = keyOf(first.enqueue);

  // Client A goes quiet. Client B's snapshot predates A's add, so it shows an empty queue.
  w.advance(31 * SEC); // lease (30s) has lapsed
  const flipped = await poll(w, new MiniRoom(), { client: CLIENT_B });
  assert.notEqual(keyOf(flipped.enqueue), firstKey, "Expected B not to re-issue A's pick on the lease flip");

  w.advance(35 * SEC); // now past the 60s failed-add timeout as seen from B's stale view
  const later = await poll(w, new MiniRoom(), { client: CLIENT_B });
  assert.notEqual(
    keyOf(later.enqueue),
    firstKey,
    "Expected B not to enqueue A's pick even after the failed-add timeout"
  );
});

test('D-1 service: a previewed song that a person then queues under a re-keyed uri is not enqueued afterwards', async () => {
  const { w } = office();
  const room = new MiniRoom();

  const first = await pollAndLand(w, room, { enable: true });
  assert.ok(first.enqueue, 'test setup: first pick parked');
  const [, previewed] = first.upcoming; // the DJ\'s next song, shown in the preview
  assert.ok(previewed, 'test setup: preview has a second entry');

  // A person queues exactly that song; Sonos hands it back under a different uri.
  w.handQueue({ ...asSong(previewed), uri: `${previewed.uri}#person` });
  room.land(asSong(previewed), { rekey: true });
  w.advance(10 * SEC);
  await poll(w, room); // first pick is now playing; a real song waits behind it
  room.advance(); // ...and then the person\'s song starts: the queue is dry again
  w.advance(180 * SEC);
  const next = await poll(w, room);

  assert.notEqual(
    keyOf(next.enqueue),
    songKey(previewed),
    `Expected the DJ not to enqueue "${previewed.trackName}", which a person already queued today`
  );
  assert.notEqual(keyOf(next.enqueue), keyOf(first.enqueue), 'Expected the DJ not to repeat its own first pick either');
});

test('D-1 service: a new Sonos group (regroup) does not reset the day — songs the DJ used in the old group are skipped', async () => {
  const { w } = office();
  const before = await poll(w, new MiniRoom(), { group: G1, enable: true });
  assert.ok(before.enqueue, 'test setup: group 1 gets a pick');

  w.advance(5 * MINUTE);
  const after = await poll(w, new MiniRoom(), { group: G2, enable: true });

  assert.ok(after.enqueue, 'Expected the new group to get a pick');
  assert.notEqual(
    keyOf(after.enqueue),
    keyOf(before.enqueue),
    "Expected the DJ to remember today's picks across groupIds"
  );
});

test('D-1 service: a restarted host (new service instance, same stores, cold cache) does not repeat earlier picks', async () => {
  const { w } = office();
  const room = new MiniRoom();
  const used: string[] = [];
  for (let i = 0; i < 5; i++) {
    w.advance(10 * SEC);
    used.push(...(await settle(w, room, { enableFirst: i === 0 })));
    room.advance();
  }
  assert.ok(used.length >= 3, 'test setup: several picks made before the restart');

  const restarted = w.restart();
  room.clear(); // and someone clears the queue, so the queue snapshot holds no history
  w.advance(5 * MINUTE);
  const r = await poll(w, room, { svc: restarted, group: G2, enable: true });

  assert.ok(r.enqueue, 'Expected the restarted host to still find a pick');
  assert.ok(
    !used.includes(songKey(r.enqueue)),
    `Expected "${r.enqueue?.trackName}" not to be re-enqueued after a restart — picks made before it: ${used.join(' | ')}`
  );
});

test('D-1 service: after a queue clear the DJ does not return to songs it already used today', async () => {
  const { w } = office(8, 5);
  const room = new MiniRoom();
  const used: string[] = [];
  for (let i = 0; i < 30; i++) {
    w.advance(10 * SEC);
    used.push(...(await settle(w, room, { enableFirst: i === 0 })));
    room.advance();
    if (i % 4 === 3) room.clear(); // someone wipes the queue, taking the played history with it
  }
  const dupes = used.filter((k, i) => used.indexOf(k) !== i);
  assert.deepEqual(
    dupes,
    [],
    `Expected no song to be enqueued twice in one London day, but these repeated: ${dupes.join(' | ')}`
  );
  assert.ok(
    used.length >= 20,
    `D-3: expected the DJ to keep supplying songs through the clears (30 steps), got ${used.length}`
  );
});

test("D-1 service: the day resets at London midnight — yesterday's song is eligible again just after 00:00 BST", async () => {
  // One song in the whole catalogue, so the midnight reset is the only way a pick can happen.
  const history = buildHistory({ now: T0, artists: 1, tracksPerArtist: 1 });
  const w = makeWorld({ events: history, now: Date.UTC(2026, 9, 19, 22, 30, 0) }); // 23:30 BST on the 19th
  const room = new MiniRoom();

  const first = await pollAndLand(w, room, { enable: true });
  assert.ok(first.enqueue, 'test setup: the only song is enqueued on day 1');
  w.advance(10 * SEC);
  const sameDay = await poll(w, room);
  assert.equal(sameDay.enqueue, null, 'Expected nothing to be enqueued while the only song has been used today');

  w.now = Date.UTC(2026, 9, 19, 23, 5, 0); // 00:05 BST on the 20th (23:05 UTC — still the 19th in UTC)
  room.clear();
  const nextDay = await poll(w, room);

  assert.equal(
    keyOf(nextDay.enqueue),
    keyOf(first.enqueue),
    "Expected the used-song record to reset at London midnight so yesterday's song is eligible again at 00:05 BST"
  );
});

// ===========================================================================
// D-2  Durable, atomic, written before the client is told
// ===========================================================================

test('D-2 service: if the day record cannot be written, no client is told to enqueue', async () => {
  const { w } = office();
  w.ledger.failWrite = () => Object.assign(new Error('Cosmos unavailable'), { statusCode: 503 });

  const outcome = await poll(w, new MiniRoom(), { enable: true }).then(
    (r) => r,
    () => null // surfacing the failure (HTTP 500) is acceptable
  );

  assert.ok(
    !outcome?.enqueue,
    `Expected no enqueue instruction while the used-record write is failing, got "${outcome?.enqueue?.trackName}"`
  );
});

test('D-2 service: a pick is recorded in the ledger store as part of handing it out', async () => {
  const { w } = office();
  const r = await poll(w, new MiniRoom(), { enable: true });
  assert.ok(r.enqueue, 'test setup');
  const stored = [...w.ledger.docs.values()].map((d) => JSON.stringify(d)).join('\n');
  assert.ok(
    stored.includes(songKey(r.enqueue)),
    `Expected the ledger store to contain the key "${songKey(r.enqueue)}" before/with the enqueue response; ledger holds: ${stored || '(nothing)'}`
  );
});

test('D-2 service: clients in different groups racing for the same pick are never given the same song', async () => {
  const { w } = office();
  w.ledger.holdReadsUntil(2); // both read the day record before either writes
  const results = await Promise.all([
    poll(w, new MiniRoom(), { group: G1, client: CLIENT_A, enable: true }),
    poll(w, new MiniRoom(), { group: G2, client: CLIENT_B, enable: true }),
  ]);
  w.ledger.releaseReads();

  const keys = results.map((r) => keyOf(r.enqueue)).filter((k): k is string => k !== null);
  assert.ok(keys.length >= 1, 'Expected at least one racer to be given a pick');
  assert.equal(
    new Set(keys).size,
    keys.length,
    `Expected distinct picks (a loser gets null or a different song), got ${keys.join(' | ')}`
  );
});

test('D-2 service: four groups polling at the same instant are all given different songs', async () => {
  const { w } = office(8, 3);
  w.ledger.holdReadsUntil(4);
  const results = await Promise.all(
    ['g1', 'g2', 'g3', 'g4'].map((g) => poll(w, new MiniRoom(), { group: g, client: `client-${g}`, enable: true }))
  );
  w.ledger.releaseReads();

  const keys = results.map((r) => keyOf(r.enqueue)).filter((k): k is string => k !== null);
  assert.ok(keys.length >= 1, 'Expected at least one pick to be handed out');
  assert.equal(new Set(keys).size, keys.length, `Expected no song to be handed to two groups, got ${keys.join(' | ')}`);
});

test('D-2 service: two clients of the same group polling at once — exactly one is told to enqueue', async () => {
  const { w } = office();
  w.sessions.holdReadsUntil(2); // both read the session (no lease owner) before either writes
  const results = await Promise.all([
    poll(w, new MiniRoom(), { client: CLIENT_A, enable: true }),
    poll(w, new MiniRoom(), { client: CLIENT_B, enable: true }),
  ]);
  w.sessions.releaseReads();

  const told = results.filter((r) => r.enqueue && r.leaseHeld);
  assert.equal(told.length, 1, `Expected exactly one client to be given the enqueue lease, got ${told.length}`);
});

test('D-2 service: previews never consume songs — enabling the DJ later starts with the song that was previewed first', async () => {
  const { w } = office();
  const room = new MiniRoom();
  let firstPreview: string | null = null;
  for (let i = 0; i < 15; i++) {
    const r = await poll(w, room); // autoplay is off: preview only
    assert.equal(r.enqueue, null, 'test setup: no enqueue while the DJ is off');
    firstPreview ??= keyOf(r.upcoming[0]);
    w.advance(10 * SEC);
  }
  const r = await poll(w, room, { enable: true });
  assert.equal(
    keyOf(r.enqueue),
    firstPreview,
    'Expected previews not to be recorded as used: the first enqueue should be the head the office has been shown all along'
  );
});

// ===========================================================================
// D-3  Keep finding candidates as exclusions grow
// ===========================================================================

test('D-3 service: the DJ keeps supplying fresh songs through repeated queue clears until the catalogue is used up', async () => {
  const { w } = office(10, 6); // 60 distinct songs
  const room = new MiniRoom();
  const picks: string[] = [];
  let stalledSteps = 0;

  for (let step = 0; step < 40; step++) {
    w.advance(10 * SEC);
    const got = await settle(w, room, { enableFirst: step === 0 });
    picks.push(...got);
    if (got.length === 0) stalledSteps++;
    room.advance();
    if (step % 5 === 4) room.clear(); // someone wipes the queue
  }

  assert.equal(new Set(picks).size, picks.length, 'Expected every pick to be a distinct song');
  assert.ok(
    picks.length >= 40,
    `Expected at least one fresh pick per step for 40 steps while 60 songs remain, got ${picks.length}`
  );
  assert.equal(
    stalledSteps,
    0,
    `Expected the DJ never to leave the room dry while unused songs exist (stalled steps: ${stalledSteps})`
  );
});

test('D-3 service: a catalogue of single-song artists keeps flowing well past the 40-candidate pool', async () => {
  const { w } = office(120, 1); // 120 acts, one song each — more than the 40-song candidate pool
  const room = new MiniRoom();
  const picks: string[] = [];
  for (let step = 0; step < 100; step++) {
    w.advance(10 * SEC);
    picks.push(...(await settle(w, room, { enableFirst: step === 0 })));
    room.advance();
    if (step % 3 === 2) room.clear();
  }
  assert.equal(new Set(picks).size, picks.length, 'Expected no song twice');
  assert.ok(
    picks.length >= 90,
    `Expected the DJ to keep finding songs beyond the first 40 (got ${picks.length} picks in 100 steps)`
  );
});

// ===========================================================================
// D-4  Cheap hand-queued query; cached heavy history; all-time
// ===========================================================================

test('D-4 service: the heavy all-time history is not re-read on every 10-second poll', async () => {
  const { w } = office();
  const room = new MiniRoom();
  for (let i = 0; i < 13; i++) {
    await poll(w, room);
    w.advance(10 * SEC);
  }
  assert.ok(
    w.historyCalls <= 1,
    `Expected the all-time history to be fetched at most once across 13 polls in 2 minutes, but it was fetched ${w.historyCalls} times`
  );
});

test('D-4 service: the cached history is refreshed eventually (not held for the life of the process)', async () => {
  const { w } = office();
  const room = new MiniRoom();
  await poll(w, room);
  w.advance(20 * MINUTE);
  await poll(w, room);
  assert.equal(
    w.historyCalls,
    2,
    'Expected the history to be re-read once its few-minute cache has lapsed (within 20 minutes)'
  );
});

test('D-4 service: hand-queued songs are read with a query bounded by London midnight', async () => {
  const { w } = office();
  await poll(w, new MiniRoom());
  w.advance(10 * SEC);
  await poll(w, new MiniRoom());

  assert.ok(w.sinceCalls.length >= 1, "Expected the service to ask for today's events via fetchEventsSince");
  assert.ok(
    w.sinceCalls.every((ms) => ms === LONDON_MIDNIGHT_20_OCT),
    `Expected every cheap query to start at London midnight (${new Date(LONDON_MIDNIGHT_20_OCT).toISOString()}), got ${w.sinceCalls.map((m) => new Date(m).toISOString()).join(', ')}`
  );
});

test('D-4 service: the hand-queued query moves to the new London midnight on the next day', async () => {
  const { w } = office();
  await poll(w, new MiniRoom());
  w.now = Date.UTC(2026, 9, 21, 9, 0, 0); // 10:00 BST on the 21st
  await poll(w, new MiniRoom());
  assert.equal(
    w.sinceCalls[w.sinceCalls.length - 1],
    Date.UTC(2026, 9, 20, 23, 0, 0),
    'Expected the cheap query on the 21st to start at 00:00 BST on the 21st (= 23:00 UTC on the 20th)'
  );
});

test('D-4/D-1 service: a song queued by a person seconds after the history cache filled is excluded on the next poll', async () => {
  const { w, ranking } = office();
  const top = asSong(ranking[0]); // what the cached history will keep offering first
  const room = new MiniRoom();
  await poll(w, room); // warms the heavy cache (preview only)

  w.advance(5 * SEC);
  w.handQueue(top); // a person queues the DJ's favourite right now
  w.advance(5 * SEC);
  const r = await poll(w, room, { enable: true });

  assert.ok(r.enqueue, 'test setup: a pick is made');
  assert.notEqual(
    keyOf(r.enqueue),
    songKey(top),
    "Expected today's hand-queued songs to be read fresh on every poll, not from the cached history"
  );
});

test('D-4 service: history older than 90 days still drives the picks (no 90-day window)', async () => {
  const history = buildHistory({ now: T0, artists: 5, tracksPerArtist: 3, ageDays: 400 });
  const w = makeWorld({ events: history });
  const r = await poll(w, new MiniRoom(), { enable: true });
  assert.ok(r.enqueue, 'Expected a pick from a 400-day-old history: the heavy aggregate is all-time now');
});

// ===========================================================================
// D-5  HTTP shapes unchanged
// ===========================================================================

test('D-5 service: the response has exactly enabled, leaseHeld, enqueue, upcoming and fillerUri', async () => {
  const { w } = office();
  const r = await poll(w, new MiniRoom(), { enable: true });
  assert.deepEqual(
    Object.keys(r).sort(),
    ['enabled', 'enqueue', 'fillerUri', 'leaseHeld', 'upcoming'],
    'Expected the response body keys to be unchanged for old desktop and Android clients'
  );
  assert.equal(r.enabled, true);
  assert.equal(r.leaseHeld, true);
  assert.equal(r.fillerUri, r.enqueue?.uri, 'Expected fillerUri to be the uri just handed out');
  assert.equal(r.upcoming.length, 3, 'Expected a three-song preview');
});

test('D-5 service: an enqueued track carries uri, trackName, artist, score and because', async () => {
  const { w } = office();
  const r = await poll(w, new MiniRoom(), { enable: true });
  assert.ok(r.enqueue);
  for (const field of ['uri', 'trackName', 'artist', 'score', 'because'] as const) {
    assert.ok(field in r.enqueue, `Expected the enqueue track to include "${field}"`);
  }
  assert.equal(typeof r.enqueue.uri, 'string');
  assert.equal(typeof r.enqueue.score, 'number');
});

test('D-5 service: a body with only groupId and clientId is accepted and previews without enqueuing', async () => {
  const { w } = office();
  const r = await w.svc.handle({ groupId: G1, clientId: CLIENT_A });
  assert.equal(r.enabled, false, 'Expected autoplay to be off by default');
  assert.equal(r.enqueue, null, 'Expected no enqueue while autoplay is off');
  assert.equal(r.upcoming.length, 3, 'Expected a preview even for the minimal body');
  assert.equal(r.fillerUri, null);
});

test('D-5 service: setEnabled still switches autoplay on for the group and the state is reported back', async () => {
  const { w } = office();
  const on = await w.svc.handle({ groupId: G1, clientId: CLIENT_A, setEnabled: true, queueUris: [] });
  assert.equal(on.enabled, true);
  const still = await w.svc.handle({ groupId: G1, clientId: CLIENT_B, queueUris: [] });
  assert.equal(still.enabled, true, 'Expected the enabled flag to be shared by every client of the group');
});

// --- the Azure handler: request validation is unchanged ----------------------
const quietContext = { log() {}, error() {} } as unknown as InvocationContext;
const requestWith = (body: unknown, bad = false): HttpRequest =>
  ({
    json: async () => {
      if (bad) throw new SyntaxError('bad json');
      return body;
    },
  }) as unknown as HttpRequest;

async function withConnString<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env['COSMOS_CONNECTION_STRING'];
  if (value === undefined) delete process.env['COSMOS_CONNECTION_STRING'];
  else process.env['COSMOS_CONNECTION_STRING'] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env['COSMOS_CONNECTION_STRING'];
    else process.env['COSMOS_CONNECTION_STRING'] = prev;
  }
}

test('D-5 handler: 400 when groupId or clientId is missing', async () => {
  const res = await withConnString('AccountEndpoint=https://x.invalid/;AccountKey=eA==;', () =>
    djAutoplayHandler(requestWith({ groupId: 'g' }), quietContext)
  );
  assert.equal(res.status, 400, 'Expected a missing clientId to be rejected with 400');
});

test('D-5 handler: 400 for a body that is not JSON', async () => {
  const res = await withConnString('AccountEndpoint=https://x.invalid/;AccountKey=eA==;', () =>
    djAutoplayHandler(requestWith(null, true), quietContext)
  );
  assert.equal(res.status, 400, 'Expected an unparseable body to be rejected with 400');
});

test('D-5 handler: 500 when Cosmos is not configured', async () => {
  const res = await withConnString(undefined, () =>
    djAutoplayHandler(requestWith({ groupId: 'g', clientId: 'c' }), quietContext)
  );
  assert.equal(res.status, 500, 'Expected the "Cosmos not configured" 500 to be unchanged');
});
