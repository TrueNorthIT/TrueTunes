// Run: npm test (from server/).
//
// P-12 Vestaboard: "a pure function renders the poll board (6 rows x 22 cols, using
// server/src/shared/vestaboard.ts conventions): row 0 THIS WEEK'S POLL centred, question
// word-wrapped across up to 4 rows (rows 1-4), last row VOTE IN TRUE TUNES centred; returns a
// `fits` flag (false if the question needs more than 4 rows after word-wrap, or contains a word
// longer than 22 chars); unsupported characters become spaces."
//
// Code under test: wrapForBoard and renderPollBoard in server/src/shared/pollBoard.ts
// (new module, currently a stub that throws NotImplemented).
// The renderer has a copy of wrapForBoard (renderer/src/lib/pollBoard.ts); its parity test is
// renderer/src/lib/__tests__/pollBoard.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPollBoard, wrapForBoard } from './pollBoard';

// Independent copy of the Vestaboard code table (see vestaboard.ts) for the characters used here.
const CODES: Record<string, number> = { ' ': 0 };
for (let i = 0; i < 26; i++) CODES[String.fromCharCode(65 + i)] = i + 1;
'123456789'.split('').forEach((d, i) => (CODES[d] = 27 + i));
CODES['0'] = 36;
Object.assign(CODES, { '!': 37, '-': 44, "'": 52, ',': 55, '.': 56, '?': 60 });
const CHARS = Object.fromEntries(Object.entries(CODES).map(([c, n]) => [n, c]));

const encode = (text: string): number[] => [...text].map((c) => CODES[c]);
const decode = (row: number[]): string => row.map((n) => CHARS[n] ?? `<${n}>`).join('');
const blankRow = (): number[] => Array.from({ length: 22 }, () => 0);

const word = (ch: string, len: number): string => ch.repeat(len);

// ---------------------------------------------------------------- wrapForBoard

test('P-12 wrapForBoard: a short question is one upper-case line', () => {
  assert.deepEqual(wrapForBoard('Best biscuit?'), ['BEST BISCUIT?'], 'Expected the question upper-cased on a single line');
});

test('P-12 wrapForBoard: wraps at word boundaries within 22 columns', () => {
  assert.deepEqual(
    wrapForBoard(`${word('A', 10)} ${word('B', 10)} CCC`),
    [`${word('A', 10)} ${word('B', 10)}`, 'CCC'],
    'Expected the third word to wrap because 10 + 1 + 10 + 1 + 3 exceeds 22 columns',
  );
});

test('P-12 wrapForBoard: a line of exactly 22 characters is allowed', () => {
  const line = `${word('A', 11)} ${word('B', 10)}`;
  assert.equal(line.length, 22);
  assert.deepEqual(wrapForBoard(line), [line], 'Expected a 22 character line not to be wrapped');
});

test('P-12 wrapForBoard: a line that would be 23 characters wraps', () => {
  assert.deepEqual(
    wrapForBoard(`${word('A', 11)} ${word('B', 11)}`),
    [word('A', 11), word('B', 11)],
    'Expected a 23 character line to wrap at the space',
  );
});

test('P-12 wrapForBoard: repeated whitespace and newlines collapse to single spaces', () => {
  assert.deepEqual(wrapForBoard('  Pick   a\n\n song  '), ['PICK A SONG'], 'Expected whitespace to be collapsed and trimmed');
});

test('P-12 wrapForBoard: unsupported characters become spaces', () => {
  assert.deepEqual(wrapForBoard('Rock~roll'), ['ROCK ROLL'], 'Expected ~ (not on the board) to act as a space');
  assert.deepEqual(wrapForBoard('Cafe ☕ time?'), ['CAFE TIME?'], 'Expected the emoji to become a space and collapse');
});

test('P-12 wrapForBoard: a word longer than 22 characters is kept whole on its own line', () => {
  const long = word('X', 30);
  assert.deepEqual(wrapForBoard(`Hi ${long} ok`), ['HI', long, 'OK'], 'Expected the over-long word to sit unbroken on its own line');
});

test('P-12 wrapForBoard: returns every line, including those beyond the fourth', () => {
  const q = [word('A', 22), word('B', 22), word('C', 22), word('D', 22), word('E', 22)].join(' ');
  assert.equal(wrapForBoard(q).length, 5, 'Expected all 5 lines to be returned so callers can detect overflow');
});

test('P-12 wrapForBoard: a blank question yields no lines', () => {
  assert.deepEqual(wrapForBoard('   '), [], 'Expected no lines for a blank question');
});

// ---------------------------------------------------------------- renderPollBoard

test('P-12 renderPollBoard: the board is 6 rows of 22 columns', () => {
  const { board } = renderPollBoard('Best biscuit?');
  assert.equal(board.length, 6, 'Expected 6 rows');
  board.forEach((row, i) => assert.equal(row.length, 22, `Expected row ${i} to have 22 columns`));
});

test("P-12 renderPollBoard: row 0 is THIS WEEK'S POLL centred (starting at column 3)", () => {
  const { board } = renderPollBoard('Best biscuit?');
  const expected = blankRow();
  encode("THIS WEEK'S POLL").forEach((code, i) => (expected[3 + i] = code));
  assert.deepEqual(board[0], expected, "Expected row 0 to read THIS WEEK'S POLL centred, as vestaboard.ts writeRow centres it");
});

test('P-12 renderPollBoard: the last row is VOTE IN TRUE TUNES centred (starting at column 2)', () => {
  const { board } = renderPollBoard('Best biscuit?');
  const expected = blankRow();
  encode('VOTE IN TRUE TUNES').forEach((code, i) => (expected[2 + i] = code));
  assert.deepEqual(board[5], expected, 'Expected row 5 to read VOTE IN TRUE TUNES centred');
});

test('P-12 renderPollBoard: the question appears word-wrapped in rows 1 to 4', () => {
  const question = `${word('A', 10)} ${word('B', 10)} CCC ${word('D', 22)}`;
  const { board } = renderPollBoard(question);
  const lines = wrapForBoard(question);
  assert.equal(lines.length, 3, 'Test set-up: expected the question to wrap to 3 lines');
  lines.forEach((line, i) => {
    assert.equal(decode(board[1 + i]).trim(), line, `Expected row ${1 + i} to hold question line ${i + 1} (${line})`);
  });
  assert.deepEqual(board[4], blankRow(), 'Expected the unused question row 4 to be blank');
});

test('P-12 renderPollBoard: unsupported characters are blank tiles', () => {
  const { board } = renderPollBoard('Rock~roll');
  assert.equal(decode(board[1]).trim(), 'ROCK ROLL', 'Expected ~ to be written as a blank tile');
  assert.ok(board.every((row) => row.every((n) => Number.isInteger(n) && n >= 0)), 'Expected only valid character codes on the board');
});

test('P-12 renderPollBoard: fits is true for a question using exactly 4 rows', () => {
  const q = [word('A', 22), word('B', 22), word('C', 22), word('D', 22)].join(' ');
  const { board, fits } = renderPollBoard(q);
  assert.equal(fits, true, 'Expected 4 rows to fit');
  assert.equal(decode(board[4]).trim(), word('D', 22), 'Expected the fourth question line on row 4');
});

test('P-12 renderPollBoard: fits is false when the question needs 5 rows, and rows 1 to 4 plus the footer are still intact', () => {
  const q = [word('A', 22), word('B', 22), word('C', 22), word('D', 22), word('E', 22)].join(' ');
  const { board, fits } = renderPollBoard(q);
  assert.equal(fits, false, 'Expected 5 rows not to fit');
  assert.equal(decode(board[5]).trim(), 'VOTE IN TRUE TUNES', 'Expected the footer row not to be overwritten by overflow');
  assert.equal(decode(board[4]).trim(), word('D', 22), 'Expected only the first four lines to be written');
});

test('P-12 renderPollBoard: fits is false when a word is longer than 22 characters', () => {
  const { fits } = renderPollBoard(`Is ${word('Z', 23)} good`);
  assert.equal(fits, false, 'Expected a 23 character word not to fit on a 22 column board');
});

test('P-12 renderPollBoard: a normal question fits', () => {
  assert.equal(renderPollBoard('Which office snack is the best?').fits, true, 'Expected a typical question to fit');
});
