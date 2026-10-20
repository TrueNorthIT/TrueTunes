/**
 * The DJ's durable, cross-group record of which songs have already been enqueued
 * today. It stores `trackKey()` strings (autoplay.ts), one document per London
 * day, written with ETag concurrency so two groups racing for the same song can
 * never both get it.
 */

import { londonDayKey } from './djDay';

export interface StoredDoc {
  id: string;
  _etag?: string;
}

/**
 * The slice of a Cosmos container the DJ needs. Production adapts a Container to
 * this (cosmosAdapters.ts); tests use an in-memory implementation.
 *
 * Every returned document carries its current `_etag`.
 */
export interface DocStore {
  /** Resolves undefined when the document does not exist. */
  read<T extends StoredDoc>(id: string): Promise<T | undefined>;
  /** Rejects with `{ statusCode: 409 }` when the id already exists. */
  create<T extends StoredDoc>(doc: T): Promise<T>;
  /** Rejects with `{ statusCode: 412 }` when the stored `_etag` differs from `etag`. */
  replace<T extends StoredDoc>(doc: T, etag: string): Promise<T>;
}

interface DayDoc extends StoredDoc {
  day: string;
  keys: string[];
}

/** Every writer retries on conflict, so this only bounds a pathological pile-up. */
const MAX_ATTEMPTS = 12;

const docId = (nowMs: number): string => `dj-day:${londonDayKey(nowMs)}`;

/**
 * Atomically record `key` as used for the London day containing `nowMs`.
 *
 * Resolves true if THIS call recorded it, false if it was already recorded (by
 * anyone, including an earlier call). Safe under concurrent callers: for the same
 * key exactly one resolves true; for different keys all resolve true and none is
 * lost. Rejects on any other store failure, so a caller never believes a key was
 * reserved when it was not.
 */
export async function reserveTrackKey(
  store: DocStore,
  nowMs: number,
  key: string,
): Promise<boolean> {
  const id = docId(nowMs);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await store.read<DayDoc>(id);
    if (current?.keys.includes(key)) return false;

    const updated: DayDoc = {
      id,
      day: londonDayKey(nowMs),
      keys: [...(current?.keys ?? []), key],
    };
    try {
      if (current?._etag) await store.replace(updated, current._etag);
      else await store.create(updated);
      return true;
    } catch (err) {
      // Someone else wrote first. Re-read, because their write may have been
      // this very key — a blind overwrite would hand it out twice.
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 412 || code === 409) continue;
      throw err;
    }
  }
  throw new Error('DJ day ledger contention — max retries exceeded');
}

/** Every key reserved for the London day containing `nowMs` (empty if none). */
export async function readUsedTrackKeys(store: DocStore, nowMs: number): Promise<Set<string>> {
  const doc = await store.read<DayDoc>(docId(nowMs));
  return new Set(doc?.keys ?? []);
}
