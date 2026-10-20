/**
 * Renderer copy of the Vestaboard poll wrap logic (P-12), for the admin preview.
 *
 * The renderer must not import server code at runtime, so this duplicates
 * server/src/shared/pollBoard.ts (wrapForBoard); renderer/src/lib/__tests__/pollBoard.test.ts
 * runs both implementations over the same vectors so they cannot drift.
 *
 * Board: 22 columns; the question may use up to 4 rows.
 */

export const POLL_BOARD_COLS = 22;
export const POLL_QUESTION_ROWS = 4;

// Characters the Vestaboard can show (see server/src/shared/vestaboard.ts CHAR_MAP).
const SUPPORTED = new Set([...' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+&=;:\'"%,./?']);

function sanitize(text: string): string {
  let out = '';
  for (const ch of text.toUpperCase()) out += SUPPORTED.has(ch) ? ch : ' ';
  return out;
}

/**
 * Identical contract to the server's wrapForBoard: upper-case, replace characters the
 * Vestaboard cannot show with spaces, split on whitespace, greedily pack into lines of at most
 * 22 characters; a word longer than 22 stays whole on its own line; returns every line.
 */
export function wrapForBoard(question: string): string[] {
  const words = sanitize(question).split(/\s+/).filter(Boolean);
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

/** Same as the server's `renderPollBoard(question).fits`: at most 4 lines and no line longer than 22. */
export function fitsOnBoard(question: string): boolean {
  const lines = wrapForBoard(question);
  return lines.length <= POLL_QUESTION_ROWS && lines.every((l) => l.length <= POLL_BOARD_COLS);
}
