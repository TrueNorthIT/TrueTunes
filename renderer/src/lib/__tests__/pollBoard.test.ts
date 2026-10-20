// P-12 Vestaboard preview in the poll admin dialog: "Same wrap logic exported for the renderer
// preview (or duplicated with a shared test vector - renderer must not import server code at
// runtime)". The renderer therefore has its own copy, renderer/src/lib/pollBoard.ts (stub that
// throws NotImplemented), and this file pins it two ways:
//   1. explicit expectations for the wrap rules (same vectors as server/src/shared/pollBoard.test.ts);
//   2. a parity check that runs the renderer copy and the server module over the same vectors.
// Importing server code from a TEST is allowed (gameGenerator.test.ts does the same).
import { describe, expect, it } from 'vitest';
import { fitsOnBoard, wrapForBoard } from '../pollBoard';
import { renderPollBoard, wrapForBoard as serverWrap } from '../../../../server/src/shared/pollBoard';

const word = (ch: string, len: number) => ch.repeat(len);

describe('P-12 renderer wrapForBoard', () => {
  it('upper-cases a short question onto one line', () => {
    expect(wrapForBoard('Best biscuit?'), 'Expected one upper-case line').toEqual(['BEST BISCUIT?']);
  });

  it('wraps at word boundaries within 22 columns', () => {
    expect(wrapForBoard(`${word('A', 10)} ${word('B', 10)} CCC`)).toEqual([`${word('A', 10)} ${word('B', 10)}`, 'CCC']);
  });

  it('allows a line of exactly 22 characters and wraps at 23', () => {
    expect(wrapForBoard(`${word('A', 11)} ${word('B', 10)}`)).toHaveLength(1);
    expect(wrapForBoard(`${word('A', 11)} ${word('B', 11)}`)).toEqual([word('A', 11), word('B', 11)]);
  });

  it('turns unsupported characters into spaces and collapses whitespace', () => {
    expect(wrapForBoard('Rock~roll')).toEqual(['ROCK ROLL']);
    expect(wrapForBoard('  Pick   a\n\n song  ')).toEqual(['PICK A SONG']);
  });

  it('keeps a word longer than 22 characters whole on its own line', () => {
    const long = word('X', 30);
    expect(wrapForBoard(`Hi ${long} ok`)).toEqual(['HI', long, 'OK']);
  });
});

describe('P-12 renderer fitsOnBoard', () => {
  it('is true for up to four lines', () => {
    expect(fitsOnBoard([word('A', 22), word('B', 22), word('C', 22), word('D', 22)].join(' ')), 'Expected 4 rows to fit').toBe(true);
    expect(fitsOnBoard('Which office snack is the best?')).toBe(true);
  });

  it('is false for five lines', () => {
    expect(fitsOnBoard([word('A', 22), word('B', 22), word('C', 22), word('D', 22), word('E', 22)].join(' ')), 'Expected 5 rows not to fit').toBe(false);
  });

  it('is false when a word is longer than 22 characters', () => {
    expect(fitsOnBoard(`Is ${word('Z', 23)} good`)).toBe(false);
  });
});

describe('P-12 renderer and server wrap logic agree', () => {
  const vectors: string[] = [
    'Best biscuit?',
    "What's the best office snack of all time?",
    'Rock~roll & ☕ beverages',
    `${word('A', 10)} ${word('B', 10)} CCC`,
    `${word('A', 11)} ${word('B', 10)}`,
    `${word('A', 11)} ${word('B', 11)}`,
    `Hi ${word('X', 30)} ok`,
    [word('A', 22), word('B', 22), word('C', 22), word('D', 22), word('E', 22)].join(' '),
    'Which song would you least like to hear at the Christmas party this year? Be honest now please',
    '   ',
    "1 2 3 4 5 6 7 8 9 0 ! . , - ' ?",
  ];

  it.each(vectors.map((v) => [JSON.stringify(v), v]))('wraps %s identically', (_label, question) => {
    expect(wrapForBoard(question), 'Expected the renderer copy to wrap exactly as server wrapForBoard does').toEqual(serverWrap(question));
  });

  it.each(vectors.map((v) => [JSON.stringify(v), v]))('reports the same fit for %s', (_label, question) => {
    expect(fitsOnBoard(question), 'Expected the preview warning to match the server fits flag').toBe(renderPollBoard(question).fits);
  });
});
