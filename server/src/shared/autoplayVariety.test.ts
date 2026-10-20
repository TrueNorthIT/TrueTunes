// Run: npm test (from server/).
//
// Artist variety is a soft preference: the DJ avoids following a track with the
// same act when it has an alternative, and never stalls for want of one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAutoplay, emptySession, trackKey, type DjSession } from './autoplay';
import type { DjTrack } from './dj';

const track = (uri: string, artist: string): DjTrack => ({
  uri,
  trackName: uri,
  artist,
  score: 0.5,
  because: 'the office plays this',
});

const enabled = (over: Partial<DjSession> = {}): DjSession => ({
  ...emptySession('g'),
  enabled: true,
  ...over,
});

/** A queue whose playing (and last) track is `song` by `artist`. */
const tailed = (artist: string) => ({
  queueUris: ['tail'],
  queueKeys: [trackKey('tail', artist)],
  nowPlayingUri: 'tail',
  nowPlayingKey: trackKey('tail', artist),
  nowPlayingIndex: 0,
});

test('variety: the pick after a track by Band is by another act when one is on offer', () => {
  const d = decideAutoplay(
    enabled(),
    {
      clientId: 'c',
      ...tailed('Band'),
      candidates: [track('a', 'Band'), track('b', 'Other'), track('c', 'Third')],
    },
    1000,
  );
  assert.equal(d.enqueue?.uri, 'b', 'Expected the first candidate by a different act');
  assert.deepEqual(d.upcoming.map((t) => t.uri), ['b', 'c', 'a'], 'Same-act pick is deferred, not dropped');
});

test('variety: a collab credited to the same lead act still counts as that act', () => {
  const d = decideAutoplay(
    enabled(),
    {
      clientId: 'c',
      ...tailed('Gorillaz'),
      candidates: [track('a', 'Gorillaz, De La Soul'), track('b', 'Other')],
    },
    1000,
  );
  assert.equal(d.enqueue?.uri, 'b');
});

test('variety: with nothing else on offer the same act is still picked (no stall)', () => {
  const d = decideAutoplay(
    enabled(),
    { clientId: 'c', ...tailed('Band'), candidates: [track('a', 'Band'), track('b', 'Band')] },
    1000,
  );
  assert.equal(d.enqueue?.uri, 'a');
});

test('variety: a stored preview head that now clashes with the queue tail is swapped for another act', () => {
  const stored = enabled({ upcoming: [track('a', 'Band'), track('b', 'Other')] });
  const d = decideAutoplay(stored, { clientId: 'c', ...tailed('Band'), candidates: [] }, 1000);
  assert.equal(d.enqueue?.uri, 'b');
  assert.equal(d.fillerUri, 'b');
});

test('variety: an empty queue has no tail to avoid, so the best-ranked candidate wins', () => {
  const d = decideAutoplay(
    enabled(),
    { clientId: 'c', queueUris: [], candidates: [track('a', 'Band'), track('b', 'Other')] },
    1000,
  );
  assert.equal(d.enqueue?.uri, 'a');
});
