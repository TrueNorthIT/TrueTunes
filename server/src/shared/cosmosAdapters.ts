/**
 * The Cosmos specifics behind the DJ's dependencies: error codes, 404-as-undefined
 * and the two event queries. functions/dj-autoplay.ts builds the service from
 * these; keeping them here makes them testable without the SDK.
 */

import type { Container, SqlQuerySpec } from '@azure/cosmos';
import type { DocStore, StoredDoc } from './djDayLedger';

/** The SDK reports HTTP status in `error.code`; the DocStore contract says `statusCode`. */
function statusOf(err: unknown): number | undefined {
  const e = err as { statusCode?: number; code?: number };
  return e.statusCode ?? e.code;
}

function withStatusCode(err: unknown): never {
  const wrapped = err instanceof Error ? err : new Error(String(err));
  throw Object.assign(wrapped, { statusCode: statusOf(err) });
}

/** Adapt a Cosmos container (partition key `/id`) to the DocStore contract. */
export function containerDocStore(container: Container): DocStore {
  return {
    async read<T extends StoredDoc>(id: string) {
      try {
        const { resource } = await container.item(id, id).read<T>();
        return resource;
      } catch (err) {
        if (statusOf(err) === 404) return undefined;
        return withStatusCode(err);
      }
    },
    async create<T extends StoredDoc>(doc: T) {
      try {
        const { resource } = await container.items.create(doc);
        return resource as unknown as T;
      } catch (err) {
        return withStatusCode(err);
      }
    },
    async replace<T extends StoredDoc>(doc: T, etag: string) {
      try {
        const { resource } = await container
          .item(doc.id, doc.id)
          .replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } });
        return resource as unknown as T;
      } catch (err) {
        return withStatusCode(err);
      }
    },
  };
}

const EVENT_FIELDS =
  'c.userId, c.eventType, c.trackName, c.artist, c.artistId, c.album, c.albumId, c.imageUrl, c.uri, c.serviceId, c.accountId, c.timestamp';

/** HEAVY query: every queued-track event, all time — no timestamp lower bound. */
export function historyQuery(): SqlQuerySpec {
  return { query: `SELECT ${EVENT_FIELDS} FROM c` };
}

/** CHEAP query: events with `c.timestamp >= @since`. */
export function eventsSinceQuery(sinceMs: number): SqlQuerySpec {
  return {
    query: `SELECT ${EVENT_FIELDS} FROM c WHERE c.timestamp >= @since`,
    parameters: [{ name: '@since', value: sinceMs }],
  };
}
