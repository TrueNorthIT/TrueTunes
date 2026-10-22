// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { namesMatch, pickArtistHit } from './genius-match.ts';

test('namesMatch ignores case, punctuation, diacritics and a leading "the"', () => {
  assert.equal(namesMatch('Wiley', 'wiley'), true);
  assert.equal(namesMatch('The Black Keys', 'Black Keys'), true);
  assert.equal(namesMatch('P!nk', 'pnk'), true);
  assert.equal(namesMatch('AC/DC', 'AC DC'), true);
  assert.equal(namesMatch('Beyoncé', 'Beyonce'), true);
});

test('namesMatch rejects different artists, including substrings', () => {
  assert.equal(namesMatch('Sasha Baron Cohen', 'Wiley'), false);
  assert.equal(namesMatch('Wiley', 'Wiley Kat'), false);
  assert.equal(namesMatch('Eskiboy', ''), false);
  assert.equal(namesMatch('', ''), false);
});

test('pickArtistHit takes only a matching primary artist, else null', () => {
  const hits = [
    { result: { primary_artist: { id: 1, name: 'Wiley' } } },
    { result: { primary_artist: { id: 2, name: 'The Sasha Baron Cohen' } } },
  ];
  assert.equal(pickArtistHit(hits, 'Sasha Baron Cohen')?.result.primary_artist.id, 2);
  assert.equal(pickArtistHit(hits.slice(0, 1), 'Sasha Baron Cohen'), null);
  assert.equal(pickArtistHit([], 'x'), null);
});
