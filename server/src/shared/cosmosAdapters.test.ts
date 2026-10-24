// Run: npm test (from server/).
//
// Contract tests for the thin Cosmos adapters the Azure handler uses
// (server/src/shared/cosmosAdapters.ts — new, currently stubs that throw).
// They close the gap between the in-memory DocStore the other tests use and the
// real @azure/cosmos v4 behaviour, using hand-rolled objects shaped like a
// Container (no SDK, no network):
//   - Item.read() on a missing item RESOLVES with `resource: undefined` (it does not throw).
//   - Errors carry the HTTP status in `error.code` (412 stale etag, 409 conflict).
//   - Conditional replace is `item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition } })`.
//
// D-2: "written atomically (ETag/conditional)" — only true in production if these
//      mappings are right.
// D-4: "a cheap query bounded by London midnight; the heavy history aggregate (now
//      ALL TIME, no 90-day window)".
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Container } from '@azure/cosmos';
import { containerDocStore, historyQuery, eventsSinceQuery } from './cosmosAdapters';

interface Doc {
  id: string;
  _etag?: string;
  n?: number;
}

function fakeContainer(
  opts: { errorShape?: 'code' | 'statusCode'; throwOnMissingRead?: boolean; failReadWith?: number } = {}
) {
  const docs = new Map<string, Doc>();
  let seq = 0;
  const calls = {
    itemArgs: [] as Array<[string, unknown]>,
    replaceOptions: [] as unknown[],
    created: [] as unknown[],
  };
  const err = (status: number) =>
    Object.assign(
      new Error(`HTTP ${status}`),
      opts.errorShape === 'statusCode' ? { statusCode: status } : { code: status }
    );

  const container = {
    item(id: string, pk: unknown) {
      calls.itemArgs.push([id, pk]);
      return {
        async read() {
          if (opts.failReadWith) throw err(opts.failReadWith);
          const d = docs.get(id);
          if (!d) {
            if (opts.throwOnMissingRead) throw err(404);
            return { resource: undefined, statusCode: 404 };
          }
          return { resource: structuredClone(d), statusCode: 200 };
        },
        async replace(doc: Doc, options?: { accessCondition?: { type: string; condition: string } }) {
          calls.replaceOptions.push(options);
          const current = docs.get(id);
          if (!current) throw err(404);
          if (options?.accessCondition?.type === 'IfMatch' && options.accessCondition.condition !== current._etag) {
            throw err(412);
          }
          const stored = { ...structuredClone(doc), _etag: `"etag-${++seq}"` };
          docs.set(id, stored);
          return { resource: structuredClone(stored), statusCode: 200 };
        },
      };
    },
    items: {
      async create(doc: Doc) {
        calls.created.push(doc);
        if (docs.has(doc.id)) throw err(409);
        const stored = { ...structuredClone(doc), _etag: `"etag-${++seq}"` };
        docs.set(doc.id, stored);
        return { resource: structuredClone(stored), statusCode: 201 };
      },
    },
  };
  return { container: container as unknown as Container, docs, calls };
}

const statusOf = (e: unknown): number | undefined => (e as { statusCode?: number }).statusCode;

for (const shape of ['code', 'statusCode'] as const) {
  test(`D-2 containerDocStore (SDK errors reported in .${shape}): read resolves undefined for a missing item`, async () => {
    const { container } = fakeContainer({ errorShape: shape });
    assert.equal(
      await containerDocStore(container).read('nope'),
      undefined,
      'Expected a missing item (resource undefined, 404) to read as undefined'
    );
  });

  test(`D-2 containerDocStore (SDK errors reported in .${shape}): a thrown 404 on read is also treated as missing`, async () => {
    const { container } = fakeContainer({ errorShape: shape, throwOnMissingRead: true });
    assert.equal(
      await containerDocStore(container).read('nope'),
      undefined,
      'Expected a thrown 404 to read as undefined'
    );
  });

  test(`D-2 containerDocStore (SDK errors reported in .${shape}): replace with a stale etag rejects with statusCode 412`, async () => {
    const { container } = fakeContainer({ errorShape: shape });
    const store = containerDocStore(container);
    const created = await store.create<Doc>({ id: 'd1', n: 1 });
    await store.replace<Doc>({ id: 'd1', n: 2 }, created._etag as string); // moves the etag on
    await assert.rejects(
      store.replace<Doc>({ id: 'd1', n: 3 }, created._etag as string),
      (e: unknown) => statusOf(e) === 412,
      'Expected the stale-etag failure to surface as statusCode 412 so callers can retry'
    );
  });

  test(`D-2 containerDocStore (SDK errors reported in .${shape}): create of an existing id rejects with statusCode 409`, async () => {
    const { container } = fakeContainer({ errorShape: shape });
    const store = containerDocStore(container);
    await store.create<Doc>({ id: 'd1' });
    await assert.rejects(
      store.create<Doc>({ id: 'd1' }),
      (e: unknown) => statusOf(e) === 409,
      'Expected a create conflict to surface as statusCode 409'
    );
  });
}

test('D-2 containerDocStore: read returns the stored document including its _etag', async () => {
  const { container } = fakeContainer();
  const store = containerDocStore(container);
  await store.create<Doc>({ id: 'd1', n: 7 });
  const doc = await store.read<Doc>('d1');
  assert.equal(doc?.n, 7, 'Expected the stored body to be returned');
  assert.ok(doc?._etag, 'Expected the _etag to be present so a later replace can be conditional');
});

test('D-2 containerDocStore: replace is conditional (IfMatch on the supplied etag) and returns the new etag', async () => {
  const { container, calls } = fakeContainer();
  const store = containerDocStore(container);
  const created = await store.create<Doc>({ id: 'd1', n: 1 });
  const replaced = await store.replace<Doc>({ id: 'd1', n: 2 }, created._etag as string);
  assert.deepEqual(
    calls.replaceOptions[0],
    { accessCondition: { type: 'IfMatch', condition: created._etag } },
    'Expected replace to send accessCondition IfMatch with the etag read earlier'
  );
  assert.notEqual(replaced._etag, created._etag, 'Expected the returned document to carry the new etag');
  assert.equal(replaced.n, 2);
});

test('D-2 containerDocStore: documents are addressed by id with the id as partition key (container partition /id)', async () => {
  const { container, calls } = fakeContainer();
  const store = containerDocStore(container);
  await store.read('group-9');
  assert.deepEqual(
    calls.itemArgs[0],
    ['group-9', 'group-9'],
    'Expected item(id, id): the sessions container is partitioned on /id'
  );
});

test('D-2 containerDocStore: other read failures (e.g. 503) are not swallowed as "missing"', async () => {
  const { container } = fakeContainer({ failReadWith: 503 });
  await assert.rejects(
    containerDocStore(container).read('x'),
    'Expected a 503 on read to reject, not read as undefined'
  );
});

// --- queries ----------------------------------------------------------------
const NEEDED_FIELDS = [
  'userId',
  'eventType',
  'trackName',
  'artist',
  'artistId',
  'album',
  'albumId',
  'imageUrl',
  'uri',
  'serviceId',
  'accountId',
  'timestamp',
];

function assertSelectsNeededFields(query: string): void {
  if (/select\s+\*/i.test(query)) return;
  for (const f of NEEDED_FIELDS) {
    assert.ok(
      new RegExp(`c\\.${f}\\b`).test(query),
      `Expected the query to select c.${f}, which buildDjSet and the service need. Query: ${query}`
    );
  }
}

test('D-4 historyQuery: reads every event with no timestamp lower bound (all time)', () => {
  const spec = historyQuery();
  assert.deepEqual(spec.parameters ?? [], [], 'Expected no parameters: an all-time query has nothing to bind');
  assert.ok(
    !/timestamp\s*(>=|>)/i.test(spec.query),
    `Expected no timestamp lower bound (the 90-day window is gone). Query: ${spec.query}`
  );
  assertSelectsNeededFields(spec.query);
});

test('D-4 eventsSinceQuery: filters on c.timestamp >= a parameter bound to the given instant', () => {
  const since = Date.UTC(2026, 9, 19, 23, 0, 0);
  const spec = eventsSinceQuery(since);
  const m = /c\.timestamp\s*>=\s*(@\w+)/i.exec(spec.query);
  assert.ok(m, `Expected "c.timestamp >= @param" in the query, got: ${spec.query}`);
  const param = (spec.parameters ?? []).find((p) => p.name === m[1]);
  assert.equal(param?.value, since, `Expected parameter ${m[1]} to be bound to ${since} (London midnight)`);
  assertSelectsNeededFields(spec.query);
});

test('D-4 eventsSinceQuery: has nothing else that would widen it (no OR, a single bound parameter)', () => {
  const spec = eventsSinceQuery(1_700_000_000_000);
  assert.ok(!/\bor\b/i.test(spec.query), `Expected no OR clause, got: ${spec.query}`);
  assert.equal((spec.parameters ?? []).length, 1, 'Expected exactly one bound parameter (the lower bound)');
});
