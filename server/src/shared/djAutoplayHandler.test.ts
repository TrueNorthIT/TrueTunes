// Run: npm test (from server/).
//
// Gaps the first test pass left:
//   - the Azure handler is a thin wrapper: it validates, delegates to the service
//     and reuses ONE service instance, so the history cache works across polls;
//   - 'album' rows carry the album name as trackName and must not be mistaken for
//     a hand-queued song.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import type { AutoplayBody, AutoplayResponse, DjAutoplayService } from './djAutoplayService';
import { createDjAutoplayHandler, getDjAutoplayService } from '../functions/dj-autoplay';
import { asSong, buildHistory, djRanking, makeWorld, MiniRoom, songKey, T0, USERS } from './djKit.testkit';

const CONN = 'AccountEndpoint=https://x.invalid/;AccountKey=eA==;';
const quietContext = { log() {}, error() {} } as unknown as InvocationContext;
const requestWith = (body: unknown): HttpRequest => ({ json: async () => body }) as unknown as HttpRequest;

async function withConnString<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env['COSMOS_CONNECTION_STRING'];
  process.env['COSMOS_CONNECTION_STRING'] = CONN;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env['COSMOS_CONNECTION_STRING'];
    else process.env['COSMOS_CONNECTION_STRING'] = prev;
  }
}

const reply: AutoplayResponse = {
  enabled: true,
  leaseHeld: true,
  enqueue: null,
  upcoming: [],
  fillerUri: null,
};

test('handler delegates to the service with the trimmed ids and returns its response unchanged', async () => {
  const seen: AutoplayBody[] = [];
  const service: DjAutoplayService = {
    handle: async (body) => {
      seen.push(body);
      return reply;
    },
  };
  const handler = createDjAutoplayHandler(() => service);

  const res = await withConnString(() =>
    handler(requestWith({ groupId: ' g ', clientId: ' c ', queueUris: ['u1'], setEnabled: true }), quietContext)
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody, reply, 'Expected the service response to be the HTTP body as-is');
  assert.equal(seen.length, 1, 'Expected exactly one service call');
  assert.equal(seen[0].groupId, 'g');
  assert.equal(seen[0].clientId, 'c');
  assert.deepEqual(seen[0].queueUris, ['u1'], 'Expected the rest of the body to pass through');
  assert.equal(seen[0].setEnabled, true);
});

test('handler: a service failure is a 500, not a crash', async () => {
  const handler = createDjAutoplayHandler(() => ({
    handle: async () => {
      throw new Error('boom');
    },
  }));
  const res = await withConnString(() => handler(requestWith({ groupId: 'g', clientId: 'c' }), quietContext));
  assert.equal(res.status, 500);
});

test('the module hands out ONE service instance, so its history cache survives across polls', () => {
  const first = getDjAutoplayService(CONN);
  const second = getDjAutoplayService(CONN);
  assert.equal(first, second, 'Expected every request to share one service instance');
});

test('D-1 service: an "album" event is not treated as a hand-queued song, even when its name matches one', async () => {
  const history = buildHistory({ now: T0, artists: 6, tracksPerArtist: 4 });
  const w = makeWorld({ events: history });
  const [best] = djRanking(history);

  // An album called the same as the room's favourite song. Its tracks are logged
  // as their own 'track' rows, so the album row itself must not exclude anything.
  w.handQueue(asSong(best), { eventType: 'album' });
  w.advance(10 * 60_000);

  const room = new MiniRoom();
  const r = await w.svc.handle(room.body('group-1', 'client-a', { users: USERS, setEnabled: true }));

  assert.ok(r.enqueue, 'Expected the DJ to enqueue');
  assert.equal(
    songKey(r.enqueue),
    songKey(best),
    'Expected the favourite song to stay eligible: an album row is not a hand-queued song'
  );
});
