import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideAutoplay,
  emptySession,
  trackKey,
  LEASE_MS,
  ENQUEUE_TIMEOUT_MS,
  type DjSession,
} from './autoplay';
import type { DjTrack } from './dj';

const track = (uri: string, artist = 'Band'): DjTrack => ({
  uri,
  trackName: uri,
  artist,
  score: 0.5,
  because: 'the office plays this',
});

const CANDIDATES = [track('a'), track('b'), track('c'), track('d'), track('e')];

const req = (over: Partial<Parameters<typeof decideAutoplay>[1]> = {}) => ({
  clientId: 'client-1',
  queueUris: [] as string[],
  candidates: CANDIDATES,
  ...over,
});

function enabledSession(id = 'group-1'): DjSession {
  return { ...emptySession(id), enabled: true };
}

test('previews three picks without touching the queue when autoplay is off', () => {
  const d = decideAutoplay(emptySession('g'), req(), 1000);
  assert.equal(d.upcoming.length, 3);
  assert.equal(d.enqueue, null, 'must not queue anything while disabled');
});

test('parks exactly one track when the queue has run dry', () => {
  const d = decideAutoplay(enabledSession(), req(), 1000);
  assert.equal(d.enqueue?.uri, 'a');
  assert.equal(d.fillerUri, 'a');
  // The other two are preview only.
  assert.deepEqual(d.upcoming.map((t) => t.uri), ['a', 'b', 'c']);
});

test('does not park anything while real tracks are still waiting', () => {
  // Playhead on the first track, one still ahead of it.
  const d = decideAutoplay(
    enabledSession(),
    req({ queueUris: ['now', 'user-track'], nowPlayingUri: 'now' }),
    1000,
  );
  assert.equal(d.enqueue, null, 'something is still queued ahead — nothing to fill');
});

test('ignores already-played tracks when judging whether the queue is dry', () => {
  // A Sonos queue keeps everything it has played; the playhead just moves. Six
  // tracks behind the pointer and nothing ahead still means "about to run out".
  const d = decideAutoplay(
    enabledSession(),
    req({
      queueUris: ['p1', 'p2', 'p3', 'p4', 'p5', 'now'],
      nowPlayingUri: 'now',
    }),
    1000,
  );
  assert.equal(d.enqueue?.uri, 'a', 'a long history of played tracks is not a full queue');
});

test('treats a queue holding only the playing track as dry', () => {
  const d = decideAutoplay(
    enabledSession(),
    req({ queueUris: ['now'], nowPlayingUri: 'now' }),
    1000,
  );
  assert.equal(d.enqueue?.uri, 'a');
});

test('only the lease holder is told to enqueue', () => {
  const first = decideAutoplay(enabledSession(), req({ clientId: 'client-1' }), 1000);
  assert.ok(first.leaseHeld);
  assert.ok(first.enqueue);

  // A second client polling moments later sees the same list but must not act.
  const second = decideAutoplay(first.session, req({ clientId: 'client-2', queueUris: ['a'] }), 2000);
  assert.equal(second.leaseHeld, false);
  assert.equal(second.enqueue, null, 'a second client would duplicate the filler');
  assert.deepEqual(second.upcoming.map((t) => t.uri), ['a', 'b', 'c']);
});

test('another client takes over once the lease expires', () => {
  const first = decideAutoplay(enabledSession(), req({ clientId: 'client-1' }), 1000);
  const later = decideAutoplay(first.session, req({ clientId: 'client-2' }), 1000 + LEASE_MS + 1);
  assert.ok(later.leaseHeld, 'a dead client must not hold the queue hostage');
});

test('does not park a second filler while the first is still waiting', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const again = decideAutoplay(first.session, req({ queueUris: ['a'] }), 2000);
  assert.equal(again.enqueue, null);
  assert.equal(again.fillerUri, 'a');
});

test('promotes the filler out of the preview once it starts playing', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);

  // The reported bug. The filler is playing but is STILL in the queue — Sonos
  // never removes it, the playhead just moved onto it. Judging by membership
  // said "still present", so it was never promoted and no follow-up was queued:
  // the DJ played exactly one track and stalled.
  const playing = decideAutoplay(
    first.session,
    req({ queueUris: ['a'], nowPlayingUri: 'a' }),
    2000,
  );
  assert.ok(!playing.upcoming.some((t) => t.uri === 'a'), 'should have moved out of upcoming');
  assert.equal(playing.enqueue?.uri, 'b', 'and the next pick must already be queued');
  assert.deepEqual(playing.upcoming.map((t) => t.uri), ['b', 'c', 'd']);
});

test('a filler the playhead has moved past counts as played', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const past = decideAutoplay(
    first.session,
    req({ queueUris: ['a', 'later'], nowPlayingUri: 'later' }),
    2000,
  );
  assert.ok(past.session.recentlyPlayed.includes('a'));
  assert.ok(!past.upcoming.some((t) => t.uri === 'a'));
});

test('a stale queue snapshot does not cause a duplicate', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  assert.equal(first.enqueue?.uri, 'a');

  // The client polls again before its own add is visible in Sonos. Absence here
  // means "not landed yet", not "gone" — parking a second filler would put the
  // same track in the queue twice.
  const stale = decideAutoplay(first.session, req({ queueUris: [] }), 3000);
  assert.equal(stale.enqueue, null, 'must not re-park an unconfirmed filler');
  assert.equal(stale.fillerUri, 'a');
});

test('once seen in the queue, later absence means it really is gone', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  // Someone's snapshot contains it — now we know it landed.
  const seen = decideAutoplay(first.session, req({ queueUris: ['a'] }), 2000);
  assert.ok(seen.session.enqueuedSeen);

  // It has since left the queue, so it played or was removed.
  const gone = decideAutoplay(seen.session, req({ queueUris: [] }), 3000);
  assert.ok(!gone.upcoming.some((t) => t.uri === 'a'));
  assert.equal(gone.enqueue?.uri, 'b', 'the next pick takes over');
});

test('does not offer a pick again once it has played', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const seen = decideAutoplay(first.session, req({ queueUris: ['a'] }), 2000);
  const gone = decideAutoplay(seen.session, req({ queueUris: [] }), 3000);

  assert.ok(gone.session.recentlyPlayed.includes('a'));
  // Several rounds later it must still not come back around.
  const later = decideAutoplay(gone.session, req({ queueUris: ['b'] }), 9000);
  assert.ok(!later.upcoming.some((t) => t.uri === 'a'), 'the DJ would be looping');
});

test('retries when an add never lands at all', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  // Never appears in any snapshot — the client's add failed.
  const retried = decideAutoplay(
    first.session,
    req({ queueUris: [] }),
    1000 + ENQUEUE_TIMEOUT_MS + 1,
  );
  assert.equal(retried.enqueue?.uri, 'a', 'should try the same pick again');
  assert.deepEqual(retried.upcoming.map((t) => t.uri), ['a', 'b', 'c']);
});

test('drops a suggestion a user queued themselves', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  assert.ok(first.upcoming.some((t) => t.uri === 'c'));

  // Someone queued 'c' by hand — it shouldn't also sit in the preview.
  const after = decideAutoplay(first.session, req({ queueUris: ['a', 'c'] }), 2000);
  assert.ok(!after.upcoming.slice(1).some((t) => t.uri === 'c'));
  assert.equal(after.upcoming.length, 3, 'preview tops back up');
});

test('a user queueing does not disturb the parked filler', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  // User track sits ahead of the filler; the filler stays where it is.
  const after = decideAutoplay(first.session, req({ queueUris: ['user-1', 'a'] }), 2000);
  assert.equal(after.fillerUri, 'a', 'filler still parked');
  assert.equal(after.enqueue, null, 'nothing new to add');
});

test('autoplay can be switched off for everyone', () => {
  const on = decideAutoplay(enabledSession(), req(), 1000);
  assert.ok(on.enqueue);

  const off = decideAutoplay(on.session, req({ setEnabled: false, queueUris: ['a'] }), 2000);
  assert.equal(off.session.enabled, false);
  assert.equal(off.enqueue, null);
});

test('runs out gracefully when the DJ has nothing left to offer', () => {
  const d = decideAutoplay(enabledSession(), req({ candidates: [] }), 1000);
  assert.deepEqual(d.upcoming, []);
  assert.equal(d.enqueue, null);
});

test('finds the filler again after Sonos re-keys its objectId', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const parked = first.enqueue!;

  // The queue reports the same track under a different objectId (issue #84).
  // Matching on uri alone loses it, and the coordinator then re-parks the same
  // pick forever: tracks keep getting queued, the preview never moves on.
  const rekeyed = decideAutoplay(
    first.session,
    req({
      queueUris: ['some-other-object-id'],
      queueKeys: [trackKey(parked.trackName, parked.artist)],
      nowPlayingUri: 'some-other-object-id',
      nowPlayingKey: trackKey(parked.trackName, parked.artist),
    }),
    2000,
  );

  assert.ok(!rekeyed.upcoming.some((t) => t.uri === parked.uri), 'should have moved on');
  assert.equal(rekeyed.enqueue?.uri, 'b', 'and queued the next pick');
});

test('does not re-suggest a re-keyed track already in the queue', () => {
  const session = enabledSession();
  const d = decideAutoplay(
    session,
    req({
      queueUris: ['unknown-id'],
      queueKeys: [trackKey('a', 'Band')],
      nowPlayingUri: 'unknown-id',
      nowPlayingKey: trackKey('a', 'Band'),
    }),
    1000,
  );
  // Candidate 'a' is that same track under a different id — offering it back
  // would queue what is playing right now.
  assert.ok(!d.upcoming.some((t) => t.uri === 'a'));
});

test('trackKey ignores case and padding', () => {
  assert.equal(trackKey(' Loser ', 'Tame Impala'), trackKey('loser', 'tame impala'));
});

test('trusts the reported playhead position over identifier matching', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const parked = first.enqueue!;

  // Neither the uri nor the name matches what the queue reports — re-keyed id
  // AND an artist string formatted differently from the event log. The position
  // the player gives us is unambiguous, so it wins.
  const byIndex = decideAutoplay(
    first.session,
    req({
      queueUris: ['played', 'renamed-id'],
      queueKeys: ['played||band', 'totally different||formatting'],
      nowPlayingIndex: 1,
    }),
    2000,
  );

  assert.equal(byIndex.enqueue, null, 'filler is not locatable, so nothing new is parked');
  assert.equal(byIndex.fillerUri, parked.uri, 'and it stays parked rather than being lost');
});

test('a reported playhead past the filler consumes it', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const parked = first.enqueue!;

  const consumed = decideAutoplay(
    first.session,
    req({
      queueUris: [parked.uri, 'next-one'],
      nowPlayingIndex: 1,
    }),
    2000,
  );

  assert.ok(consumed.session.recentlyPlayed.includes(parked.uri));
  assert.ok(!consumed.upcoming.some((t) => t.uri === parked.uri));
});

test('ignores a nonsense playhead position', () => {
  const first = decideAutoplay(enabledSession(), req(), 1000);
  const d = decideAutoplay(
    first.session,
    req({ queueUris: ['a'], nowPlayingIndex: 99 }),
    2000,
  );
  // Out of range, so it falls back to matching rather than trusting it.
  assert.equal(d.fillerUri, 'a');
});
