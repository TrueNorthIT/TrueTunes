import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { BodyTooLargeError, adaptWs, readBodyCapped, type WsLike } from './gatewayNode';

test('readBodyCapped joins chunks in order', async () => {
  const body = await readBodyCapped(Readable.from([Buffer.from('ab'), Buffer.from('cd')]), 10);
  assert.equal(Buffer.from(body).toString(), 'abcd');
});

test('readBodyCapped accepts a body exactly at the cap and refuses one byte over', async () => {
  assert.equal((await readBodyCapped(Readable.from([Buffer.alloc(4)]), 4)).length, 4);
  await assert.rejects(readBodyCapped(Readable.from([Buffer.alloc(3), Buffer.alloc(2)]), 4), BodyTooLargeError);
});

test('readBodyCapped returns an empty body for no chunks', async () => {
  assert.equal((await readBodyCapped(Readable.from([]), 4)).length, 0);
});

function fakeWs() {
  const listeners = new Map<string, Array<(...a: any[]) => void>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const sent: Array<{ data: string | Uint8Array; binary: boolean }> = [];
  const closes: Array<[number | undefined, string | undefined]> = [];
  const ws: WsLike = {
    send: (data, o) => void sent.push({ data, binary: o.binary }),
    close: (c, r) => void closes.push([c, r]),
    on: (e, l) => void listeners.set(e, [...(listeners.get(e) ?? []), l]),
  };
  const emit = (e: string, ...a: unknown[]) => (listeners.get(e) ?? []).forEach((l) => l(...a));
  return { ws, sent, closes, emit };
}

test('adaptWs delivers text frames as strings and binary frames as bytes', () => {
  const f = fakeWs();
  const got: unknown[] = [];
  adaptWs(f.ws).on('message', (d: unknown) => got.push(d));
  f.emit('message', Buffer.from('hello'), false);
  f.emit('message', Buffer.from([1, 2, 3]), true);
  f.emit('message', [Buffer.from([4]), Buffer.from([5])], true);
  assert.equal(got[0], 'hello');
  assert.deepEqual([...(got[1] as Uint8Array)], [1, 2, 3]);
  assert.deepEqual([...(got[2] as Uint8Array)], [4, 5]);
});

test('adaptWs sends strings as text and bytes as binary', () => {
  const f = fakeWs();
  const s = adaptWs(f.ws);
  s.send('x');
  s.send(new Uint8Array([9]));
  assert.deepEqual(
    f.sent.map((m) => m.binary),
    [false, true]
  );
});

test('adaptWs gives close reasons as strings and passes open, error and close() through', () => {
  const f = fakeWs();
  const s = adaptWs(f.ws);
  const events: unknown[][] = [];
  s.on('close', (...a: unknown[]) => events.push(['close', ...a]));
  (s as any).on('open', () => events.push(['open'])); // eslint-disable-line @typescript-eslint/no-explicit-any
  s.on('error', (e: unknown) => events.push(['error', e]));
  f.emit('close', 1001, Buffer.from('going away'));
  f.emit('open');
  const err = new Error('x');
  f.emit('error', err);
  assert.deepEqual(events, [['close', 1001, 'going away'], ['open'], ['error', err]]);
  s.close(1011, 'bad');
  assert.deepEqual(f.closes, [[1011, 'bad']]);
});
