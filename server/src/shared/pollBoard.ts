/**
 * Vestaboard layout for the weekly poll (P-12). Pure; no network.
 *
 * Pinned by pollBoard.test.ts.
 *
 * Follows the conventions of vestaboard.ts: 6 rows x 22 columns of character codes
 * (0 blank, 1..26 A..Z, 27..35 digits 1..9, 36 zero, 37+ punctuation). Text is upper-cased
 * and any character vestaboard.ts cannot encode becomes a space.
 *
 * Layout: row 0 "THIS WEEK'S POLL" centred; rows 1..4 the question, word-wrapped;
 * row 5 "VOTE IN TRUE TUNES" centred. Centring is `floor((22 - len) / 2)` as in vestaboard.ts
 * (so the title starts at column 3 and the footer at column 2).
 *
 * The renderer keeps its own copy of wrapForBoard (renderer/src/lib/pollBoard.ts) because
 * the renderer does not import server code at runtime; renderer/src/lib/__tests__/pollBoard.test.ts
 * runs both over the same vectors.
 */
import { emptyBoard, sanitize, writeRow } from './vestaboard';

export const POLL_BOARD_COLS = 22;
export const POLL_QUESTION_ROWS = 4;

const TITLE = "THIS WEEK'S POLL";
const FOOTER = 'VOTE IN TRUE TUNES';

/**
 * Upper-case, replace unsupported characters with spaces, split on whitespace, then greedily
 * pack words into lines of at most 22 characters (single spaces between words). A word longer
 * than 22 characters is placed unbroken on a line of its own. Returns EVERY line, including
 * any beyond the fourth; an empty/blank question yields [].
 */
export function wrapForBoard(question: string): string[] {
  const words = sanitize(question, Infinity).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length <= POLL_BOARD_COLS) {
      line += ` ${word}`;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds the board. `fits` is false when wrapForBoard returns more than 4 lines or any
 * line is longer than 22 characters. When it does not fit, only the first 4 lines are
 * written (each truncated to 22 columns) and the rest is dropped.
 */
export function renderPollBoard(question: string): { board: number[][]; fits: boolean } {
  const lines = wrapForBoard(question);
  const fits = lines.length <= POLL_QUESTION_ROWS && lines.every((l) => l.length <= POLL_BOARD_COLS);
  const board = emptyBoard();
  writeRow(board, 0, TITLE, 'center');
  lines.slice(0, POLL_QUESTION_ROWS).forEach((line, i) => writeRow(board, 1 + i, line, 'center'));
  writeRow(board, 5, FOOTER, 'center');
  return { board, fits };
}

/** Posted instead of a question that does not fit (never a truncated question). */
export function renderPollFallbackBoard(): number[][] {
  const board = emptyBoard();
  writeRow(board, 0, TITLE, 'center');
  writeRow(board, 2, 'A NEW POLL IS LIVE', 'center');
  writeRow(board, 5, FOOTER, 'center');
  return board;
}
