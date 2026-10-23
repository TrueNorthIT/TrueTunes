// Run: npm test (from server/).
//
// The Cosmos binding for the poll store (server/src/shared/pollCosmosStore.ts, new module,
// containerPollStore currently throws NotImplemented), tested against a hand-rolled object
// shaped like an @azure/cosmos v4 Container (no SDK, no network, as cosmosAdapters.test.ts does).
//
// P-3: "answering only increments that choice's count on the poll document (Cosmos atomic patch
//      `incr` on /counts/<i>)". The answer path must therefore be exactly one
//      `container.item(id, id).patch([{ op: 'incr', path: '/counts/<i>', value: 1 }])`, never a
//      read followed by a replace (that would lose concurrent answers).
// Container `polls` has partition key /id, so every item() call is `item(id, id)`.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Container } from '@azure/cosmos';
import { containerPollStore } from './pollCosmosStore';
import { poll } from './pollsKit.testkit';
import type { Poll } from './polls';

function fakeContainer(seed: Poll[] = [], opts: { failPatchWith?: number } = {}) {
  const docs = new Map(seed.map((p) => [p.id, structuredClone(p)]));
  const calls = {
    itemArgs: [] as Array<[string, unknown]>,
    patches: [] as unknown[],
    replaced: [] as unknown[],
    created: [] as unknown[],
    deleted: [] as string[],
    queries: [] as unknown[],
  };
  const err = (status: number) => Object.assign(new Error(`HTTP ${status}`), { code: status });

  const container = {
    item(id: string, pk: unknown) {
      calls.itemArgs.push([id, pk]);
      return {
        async read() {
          const d = docs.get(id);
          if (!d) return { resource: undefined, statusCode: 404 };
          return { resource: structuredClone(d), statusCode: 200 };
        },
        async replace(doc: Poll) {
          if (!docs.has(id)) throw err(404);
          calls.replaced.push(structuredClone(doc));
          docs.set(id, structuredClone(doc));
          return { resource: structuredClone(doc) };
        },
        async delete() {
          calls.deleted.push(id);
          docs.delete(id);
          return {};
        },
        async patch(ops: Array<{ op: string; path: string; value: number }>) {
          calls.patches.push(structuredClone(ops));
          if (opts.failPatchWith) throw err(opts.failPatchWith);
          const d = docs.get(id);
          if (!d) throw err(404);
          for (const o of ops) {
            const idx = Number(o.path.split('/')[2]);
            if (o.op === 'incr') d.counts[idx] += o.value;
          }
          return { resource: structuredClone(d) };
        },
      };
    },
    items: {
      async create(doc: Poll) {
        calls.created.push(structuredClone(doc));
        if (docs.has(doc.id)) throw err(409);
        docs.set(doc.id, structuredClone(doc));
        return { resource: structuredClone(doc) };
      },
      query(spec: unknown) {
        calls.queries.push(spec);
        return { fetchAll: async () => ({ resources: [...docs.values()].map((d) => structuredClone(d)) }) };
      },
    },
  };
  return { container: container as unknown as Container, calls, docs };
}

test('P-3 incrementCount: is a single atomic Cosmos patch incr on /counts/<index>', async () => {
  const { container, calls, docs } = fakeContainer([
    poll('p1', '2026-10-19', { choices: ['a', 'b', 'c'], counts: [0, 0, 0] }),
  ]);
  await containerPollStore(container).incrementCount('p1', 2);
  assert.deepEqual(
    calls.patches,
    [[{ op: 'incr', path: '/counts/2', value: 1 }]],
    'Expected exactly one patch with a single incr of 1 on /counts/2'
  );
  assert.deepEqual(docs.get('p1')?.counts, [0, 0, 1], 'Expected only counts[2] to change');
  assert.deepEqual(calls.replaced, [], 'Expected no replace (a read-modify-write would lose concurrent answers)');
  assert.deepEqual(calls.created, [], 'Expected no new document (no per-answer record)');
});

test('P-3 incrementCount: addresses the item with the id as its own partition key', async () => {
  const { container, calls } = fakeContainer([poll('p1', '2026-10-19')]);
  await containerPollStore(container).incrementCount('p1', 0);
  assert.deepEqual(calls.itemArgs, [['p1', 'p1']], 'Expected item(id, id) because the container is partitioned on /id');
});

test('P-3 incrementCount: a missing poll rejects with statusCode 404', async () => {
  const { container } = fakeContainer([]);
  await assert.rejects(
    () => containerPollStore(container).incrementCount('ghost', 0),
    (e: unknown) => (e as { statusCode?: number }).statusCode === 404,
    'Expected the SDK error code 404 to surface as statusCode 404'
  );
});

test('P-3 incrementCount: other Cosmos failures are not swallowed', async () => {
  const { container } = fakeContainer([poll('p1', '2026-10-19')], { failPatchWith: 429 });
  await assert.rejects(
    () => containerPollStore(container).incrementCount('p1', 0),
    'Expected a throttling error to reject so the client can retry'
  );
});

test('P-9 read: resolves the poll, or undefined when it does not exist', async () => {
  const { container } = fakeContainer([poll('p1', '2026-10-26')]);
  const store = containerPollStore(container);
  assert.equal((await store.read('p1'))?.id, 'p1', 'Expected the stored poll');
  assert.equal(await store.read('ghost'), undefined, 'Expected undefined for a missing poll');
});

test('P-9 list: returns every poll', async () => {
  const { container } = fakeContainer([poll('p1', '2026-10-26'), poll('p2', '2026-11-02')]);
  const all = await containerPollStore(container).list();
  assert.deepEqual(all.map((p) => p.id).sort(), ['p1', 'p2'], 'Expected both polls');
});

test('P-9 create: stores the document as given and rejects a duplicate id with statusCode 409', async () => {
  const { container, calls } = fakeContainer([]);
  const store = containerPollStore(container);
  await store.create(poll('p1', '2026-10-26'));
  assert.equal((calls.created[0] as Poll).id, 'p1', 'Expected the document to be created');
  await assert.rejects(
    () => store.create(poll('p1', '2026-10-26')),
    (e: unknown) => (e as { statusCode?: number }).statusCode === 409,
    'Expected SDK code 409 to surface as statusCode 409'
  );
});

test('P-9 replace and remove: act on the item with id as partition key', async () => {
  const { container, calls, docs } = fakeContainer([poll('p1', '2026-10-26')]);
  const store = containerPollStore(container);
  await store.replace(poll('p1', '2026-11-02'));
  assert.equal(docs.get('p1')?.liveFrom, '2026-11-02', 'Expected the replacement to be stored');
  await store.remove('p1');
  assert.deepEqual(calls.deleted, ['p1'], 'Expected the item to be deleted');
  assert.ok(
    calls.itemArgs.every(([id, pk]) => id === pk),
    'Expected item(id, id) on every call'
  );
});
