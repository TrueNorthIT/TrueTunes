import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { BodyTooLargeError, adaptWs, createStaticFiles, readBodyCapped, type WsLike } from './gatewayNode';
import { selectSubprotocol } from './gatewayRelay';

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

// ── createStaticFiles: the web app's files from disk ──

function webRoot(): { root: string; secret: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-gw-'));
  const root = path.join(dir, 'web');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>True Tunes</title>');
  fs.writeFileSync(path.join(root, 'assets', 'index-abc.js'), `console.log(${JSON.stringify('x'.repeat(4000))})`);
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
  fs.writeFileSync(path.join(root, 'icon.png'), Buffer.from([0x89, 0x50]));
  fs.writeFileSync(path.join(root, 'model.tflite'), Buffer.from([1, 2]));
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  const secret = path.join(dir, 'secret.txt');
  fs.writeFileSync(secret, 'outside the root');
  return { root, secret };
}

test('createStaticFiles serves a file with its content type', () => {
  const files = createStaticFiles(webRoot().root);
  assert.equal(files('/index.html')?.type, 'text/html; charset=utf-8');
  assert.match(Buffer.from(files('/index.html')?.body ?? []).toString(), /True Tunes/);
  assert.equal(files('/assets/index-abc.js')?.type, 'text/javascript; charset=utf-8');
  assert.equal(files('/manifest.webmanifest')?.type, 'application/manifest+json');
  assert.equal(files('/icon.png')?.type, 'image/png');
  assert.equal(files('/model.tflite')?.type, 'application/octet-stream');
});

test('createStaticFiles gives a brotli copy of large text files only, and it decodes to the original', () => {
  const files = createStaticFiles(webRoot().root);
  const js = files('/assets/index-abc.js');
  assert.ok(js?.br, 'Expected a compressed copy of a 4 kB script');
  assert.ok(js.br.length < js.body.length);
  assert.deepEqual(zlib.brotliDecompressSync(js.br), Buffer.from(js.body));
  assert.equal(files('/icon.png')?.br, undefined);
  assert.equal(files('/index.html')?.br, undefined, 'A tiny file is not worth compressing');
});

test('createStaticFiles returns the same object for a second request (read once)', () => {
  const files = createStaticFiles(webRoot().root);
  assert.equal(files('/index.html'), files('/index.html'));
});

test('createStaticFiles cannot be made to read outside its root, or a dot-file inside it', () => {
  const { root } = webRoot();
  const files = createStaticFiles(root);
  for (const p of [
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/..%2fsecret.txt',
    '/assets/..%5c..%5csecret.txt',
    '\\..\\secret.txt',
    '/..\\secret.txt',
    '//secret.txt',
    'secret.txt',
    '/.env',
    '/%2eenv',
    '/assets/%00',
    // other spellings of a file that exists: one spelling per file, so the cache cannot be grown
    '//index.html',
    '/assets//index-abc.js',
    '/%61ssets/index-abc.js',
    '/assets/index-abc%2ejs',
    '/index.html/',
    '/%',
    '/',
    '/assets',
    '/missing.js',
  ]) {
    assert.equal(files(p), null, `Expected no file for ${JSON.stringify(p)}`);
  }
});

test('createStaticFiles over a folder that does not exist has no files', () => {
  const files = createStaticFiles(path.join(os.tmpdir(), 'tt-gw-does-not-exist'));
  assert.equal(files('/index.html'), null);
});

// ── a real ws server with the gateway's subprotocol rule ──

test('a ws client offering the Sonos subprotocol and a bearer entry is answered with the Sonos subprotocol only', async () => {
  const wss = new WebSocketServer({ port: 0, handleProtocols: selectSubprotocol });
  await new Promise<void>((done) => wss.once('listening', done));
  const { port } = wss.address() as { port: number };
  try {
    const offered = await new Promise<string>((resolve, reject) => {
      wss.once('connection', (_socket, req) => resolve(String(req.headers['sec-websocket-protocol'])));
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, ['v1.api.smartspeaker.audio', 'bearer.aaa.bbb-ccc_ddd']);
      ws.once('open', () => {
        assert.equal(ws.protocol, 'v1.api.smartspeaker.audio');
        ws.close();
      });
      ws.once('error', reject);
    });
    assert.match(offered, /bearer\.aaa\.bbb-ccc_ddd/, 'The token entry reaches the server as a request header');
    await assert.rejects(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, ['bearer.aaa.bbb-ccc_ddd']);
        ws.once('open', () => resolve());
        ws.once('error', reject);
      }),
      'A client that does not offer the Sonos subprotocol is not connected'
    );
  } finally {
    await new Promise<void>((done) => wss.close(() => done()));
  }
});
