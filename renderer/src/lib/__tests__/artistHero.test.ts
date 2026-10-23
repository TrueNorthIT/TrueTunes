import { describe, it, expect } from 'vitest';
import { heroPortrait, creditNames } from '../artistHero';

describe('heroPortrait', () => {
  it('commits to nothing while the photo is unknown', () => {
    expect(heroPortrait('unknown', 'photo.jpg', 'cover.jpg', ['song.jpg'])).toBeNull();
  });
  it('shows the photo once it is known to be real', () => {
    expect(heroPortrait('photo', 'photo.jpg', 'cover.jpg', [])).toEqual({ kind: 'photo', url: 'photo.jpg' });
  });
  it('hangs the latest cover as a print for a placeholder or missing photo', () => {
    expect(heroPortrait('placeholder', 'photo.jpg', 'cover.jpg', ['song.jpg'])).toEqual({
      kind: 'print',
      url: 'cover.jpg',
    });
    expect(heroPortrait('placeholder', null, 'cover.jpg', [])).toEqual({ kind: 'print', url: 'cover.jpg' });
  });
  it('falls back to the first top song with art when there is no release', () => {
    expect(heroPortrait('placeholder', null, null, [null, undefined, 'song.jpg', 'other.jpg'])).toEqual({
      kind: 'print',
      url: 'song.jpg',
    });
  });
  it('is null when there is no art at all, so no tint is invented', () => {
    expect(heroPortrait('placeholder', null, null, [null])).toBeNull();
  });
});

describe('creditNames', () => {
  it('splits a shared credit', () => {
    expect(creditNames('Sacha Baron Cohen, Johnny Depp,Tomothy Spall')).toEqual([
      'Sacha Baron Cohen',
      'Johnny Depp',
      'Tomothy Spall',
    ]);
  });
  it('keeps a single name whole', () => {
    expect(creditNames('Simon & Garfunkel')).toEqual(['Simon & Garfunkel']);
  });
});
