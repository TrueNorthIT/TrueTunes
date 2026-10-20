/**
 * Cosmos binding for the poll store (container `polls`, partition key /id, no TTL).
 *
 * Pinned by pollCosmosStore.test.ts (P-3, P-11).
 * The SDK reports the HTTP status in `error.code`; it is surfaced as `statusCode`.
 */
import type { Container } from '@azure/cosmos';
import type { PollStore } from './pollService';
import type { Poll } from './polls';

function withStatusCode(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && err instanceof Error) {
    return Object.assign(err, { statusCode: code });
  }
  return err;
}

export function containerPollStore(container: Container): PollStore {
  return {
    async list() {
      const { resources } = await container.items.query<Poll>('SELECT * FROM c').fetchAll();
      return resources;
    },

    async read(id) {
      try {
        const { resource } = await container.item(id, id).read<Poll>();
        return resource ?? undefined;
      } catch (err) {
        if ((err as { code?: number }).code === 404) return undefined;
        throw withStatusCode(err);
      }
    },

    async create(poll) {
      try {
        const { resource } = await container.items.create(poll);
        return (resource as unknown as Poll) ?? poll;
      } catch (err) {
        throw withStatusCode(err);
      }
    },

    async replace(poll) {
      try {
        const { resource } = await container.item(poll.id, poll.id).replace(poll);
        return (resource as unknown as Poll) ?? poll;
      } catch (err) {
        throw withStatusCode(err);
      }
    },

    async remove(id) {
      try {
        await container.item(id, id).delete();
      } catch (err) {
        if ((err as { code?: number }).code === 404) return;
        throw withStatusCode(err);
      }
    },

    // One atomic server-side increment: no read first, so concurrent answers are never lost.
    async incrementCount(id, index) {
      try {
        await container.item(id, id).patch([{ op: 'incr', path: `/counts/${index}`, value: 1 }]);
      } catch (err) {
        throw withStatusCode(err);
      }
    },
  };
}
