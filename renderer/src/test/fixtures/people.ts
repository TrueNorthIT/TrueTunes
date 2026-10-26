// The invented office. No real colleagues: these names belong to nobody.
import { artUrl } from './art';

/** The signed-in viewer. */
export const ME = 'Wren Calloway';

export interface Person {
  name: string;
  /** Has a photo (a generated portrait); the rest show their initial. */
  photo: boolean;
}

export const PEOPLE: Person[] = [
  { name: ME, photo: true },
  { name: 'Tamsin Okoro-Vale', photo: true },
  { name: 'Bram Heslop', photo: false },
  { name: 'Idris Quennell', photo: true },
  { name: 'Marisol Tennant', photo: false },
  { name: 'Fenwick Aldous', photo: false },
  { name: 'Odalys Brandt', photo: true },
  { name: 'Kit Marchetti-Lowe', photo: false },
  { name: 'Saoirse Vandemeer', photo: false },
  { name: 'Lazlo Pembridge', photo: false },
];

export const names = PEOPLE.map((p) => p.name);
export const photoOf = (name: string) =>
  PEOPLE.find((p) => p.name === name)?.photo ? artUrl(`portrait:${name}`) : undefined;

/** Who is in the office on the frozen Monday (the viewer first). */
export const IN_OFFICE = [ME, 'Tamsin Okoro-Vale', 'Idris Quennell', 'Marisol Tennant', 'Odalys Brandt'];
