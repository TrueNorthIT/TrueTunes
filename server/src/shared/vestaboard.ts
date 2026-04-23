// Vestaboard Read/Write API helper.
//
// No-op when VESTABOARD_API_KEY is unset, mirroring the telemetry pattern.
// Posts a 6-row × 22-column character matrix to https://rw.vestaboard.com/.
// Character codes follow Vestaboard's public spec:
//   0          blank
//   1..26      A..Z
//   27..36     1..9, 0
//   37..70     punctuation + colour tiles
// (only the subset we need is mapped).

const API_URL = 'https://rw.vestaboard.com/';
const ROWS = 6;
const COLS = 22;

const CHAR_MAP: Record<string, number> = (() => {
  const m: Record<string, number> = { ' ': 0 };
  for (let i = 0; i < 26; i++) m[String.fromCharCode(65 + i)] = i + 1;
  // Vestaboard digit codes: 1→27, 2→28, …, 9→35, 0→36.
  m['1'] = 27; m['2'] = 28; m['3'] = 29; m['4'] = 30; m['5'] = 31;
  m['6'] = 32; m['7'] = 33; m['8'] = 34; m['9'] = 35; m['0'] = 36;
  m['!'] = 37; m['@'] = 38; m['#'] = 39; m['$'] = 40; m['('] = 41;
  m[')'] = 42; m['-'] = 44; m['+'] = 46; m['&'] = 47; m['='] = 48;
  m[';'] = 49; m[':'] = 50; m["'"] = 52; m['"'] = 53; m['%'] = 54;
  m[','] = 55; m['.'] = 56; m['/'] = 59; m['?'] = 60;
  return m;
})();

function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
}

// Replace any unsupported characters with spaces; truncate to maxLen.
function sanitize(text: string, maxLen: number): string {
  const upper = text.toUpperCase();
  let out = '';
  for (const ch of upper) {
    if (out.length >= maxLen) break;
    out += CHAR_MAP[ch] !== undefined ? ch : ' ';
  }
  return out;
}

function writeRow(board: number[][], row: number, text: string, align: 'left' | 'center' | 'right' = 'left'): void {
  if (row < 0 || row >= ROWS) return;
  const sanitized = sanitize(text, COLS);
  let start = 0;
  if (align === 'center') start = Math.floor((COLS - sanitized.length) / 2);
  else if (align === 'right') start = COLS - sanitized.length;
  for (let i = 0; i < sanitized.length; i++) {
    const code = CHAR_MAP[sanitized[i]];
    if (code !== undefined) board[row][start + i] = code;
  }
}

async function postBoard(board: number[][], log: (msg: string, ...args: unknown[]) => void): Promise<void> {
  const key = process.env['VESTABOARD_API_KEY'];
  if (!key) {
    log('[vestaboard] VESTABOARD_API_KEY not set — skipping');
    return;
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vestaboard-Read-Write-Key': key,
    },
    body: JSON.stringify(board),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vestaboard API ${res.status}: ${body}`);
  }
}

export async function sendScoreAnnouncement(
  userName: string,
  mainScore: number,
  bonusScore: number,
  maxPerRound: number,
  log: (msg: string, ...args: unknown[]) => void = console.log,
): Promise<void> {
  const total = mainScore + bonusScore;
  const maxTotal = maxPerRound * 2;
  const board = emptyBoard();
  writeRow(board, 0, 'QUEUEDLE TODAY', 'center');
  writeRow(board, 2, `${userName} SCORED`, 'center');
  writeRow(board, 3, `${total}/${maxTotal} OVERALL`, 'center');
  writeRow(board, 4, `(${mainScore} MAIN, ${bonusScore} BONUS)`, 'center');
  await postBoard(board, log);
}

export async function sendLeaderboard(
  scores: Array<{ userName: string; total: number }>,
  log: (msg: string, ...args: unknown[]) => void = console.log,
): Promise<void> {
  const board = emptyBoard();
  writeRow(board, 0, "TODAY'S TOP 5", 'center');
  const top = scores.slice(0, 5);
  for (let i = 0; i < top.length; i++) {
    const rank = i + 1;
    const score = String(top[i].total);
    // Layout: " 1 NAME           SC " — rank+space=2, score+space=score.length+1, name fills the rest.
    const rankPart = ` ${rank} `;
    const scorePart = ` ${score} `;
    const nameLen = COLS - rankPart.length - scorePart.length;
    const name = top[i].userName.toUpperCase().slice(0, nameLen).padEnd(nameLen, ' ');
    writeRow(board, i + 1, `${rankPart}${name}${scorePart}`, 'left');
  }
  await postBoard(board, log);
}
