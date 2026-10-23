// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { albumBaseTitle, geniusHasText, namesMatch, pickAlbumHits, pickArtistHit } from './genius-match.ts';

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

test('albumBaseTitle strips edition suffixes only', () => {
  assert.equal(albumBaseTitle('Royal Blood (10th Anniversary Edition)'), 'Royal Blood');
  assert.equal(albumBaseTitle('Man Alive (Deluxe)'), 'Man Alive');
  assert.equal(albumBaseTitle('Abbey Road (Remastered 2019) [Super Deluxe Edition]'), 'Abbey Road');
  assert.equal(albumBaseTitle('Rumours - 2004 Remaster'), 'Rumours');
  assert.equal(albumBaseTitle('Lungs Deluxe'), 'Lungs');
  assert.equal(albumBaseTitle('Creature Songs EP'), 'Creature Songs');
  assert.equal(albumBaseTitle('Blush - EP'), 'Blush');
  assert.equal(albumBaseTitle('Royal Blood (10th Anniversary Edition (without live))'), 'Royal Blood');
  // Not editions: a different record, or part of the title.
  assert.equal(albumBaseTitle('Back in Black (Live)'), 'Back in Black (Live)');
  assert.equal(albumBaseTitle('(What’s the Story) Morning Glory?'), '(What’s the Story) Morning Glory?');
});

test('pickAlbumHits: exact title, then other editions, never another artist', () => {
  const hit = (id: number, name: string, artist: string) => ({ result: { id, name, artist: { name: artist } } });
  const hits = [
    hit(1, 'Royal Blood', 'Ozy (RUS)'),
    hit(2, 'Royal Blood', 'Royal Blood'),
    hit(3, 'Royal Blood (10th Anniversary Edition)', 'Royal Blood'),
    hit(4, 'How Did We Get So Dark?', 'Royal Blood'),
  ];
  assert.deepEqual(
    pickAlbumHits(hits, 'Royal Blood (10th Anniversary Edition)', 'Royal Blood').map((h) => h.result.id),
    [3, 2]
  );
  assert.deepEqual(
    pickAlbumHits(hits, 'Royal Blood', 'Royal Blood').map((h) => h.result.id),
    [2, 3]
  );
  assert.deepEqual(pickAlbumHits(hits, 'Royal Blood', 'Wiley'), []);
  assert.deepEqual(
    pickAlbumHits([{ result: { id: 5, name: 'Royal Blood', artist: null } }], 'Royal Blood', 'Royal Blood'),
    []
  );
});

test('geniusHasText treats "?" and empty roots as no description', () => {
  assert.equal(geniusHasText({ tag: 'root' }), false);
  assert.equal(geniusHasText({ tag: 'root', children: [{ tag: 'p', children: [' ? '] }] }), false);
  assert.equal(geniusHasText(null), false);
  assert.equal(
    geniusHasText({
      tag: 'root',
      children: ['', { tag: 'p', children: [{ tag: 'em', children: ['Royal Blood'] }, ' is a debut.'] }],
    }),
    true
  );
});
