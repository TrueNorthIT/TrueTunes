// The Node-specific glue of the Sonos gateway entry point (src/gateway/main.ts), kept here as plain
// functions so it can be tested without a server: the request body cap and the adapter that makes a
// `ws` socket look like the minimal sockets gatewayRelay.ts works with.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { ClientSocket, UpstreamSocket } from './gatewayRelay';
import type { StaticFile, StaticLookup } from './gatewayWeb';

/**
 * Options of the gateway's WebSocketServer. `maxPayload` limits only the frames a client sends to the gateway:
 * commands and subscriptions on /sonos/ws, small JSON on /pubsub/ws. Frames coming from Sonos or Web PubSub arrive
 * on the upstream sockets, which this does not touch, so the Sonos path is safe (`ws`'s default is 100 MiB).
 */
export const WS_SERVER_OPTIONS = { maxPayload: 1024 * 1024 };

export const MAX_BODY_BYTES = 10 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('request body too large');
    this.name = 'BodyTooLargeError';
  }
}

/** Reads a request body into one Uint8Array, rejecting with BodyTooLargeError once it passes `max` bytes. */
export async function readBodyCapped(
  stream: AsyncIterable<Uint8Array | string>,
  max: number = MAX_BODY_BYTES
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf =
      typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    size += buf.length;
    if (size > max) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** The slice of a `ws` WebSocket the adapter uses. */
export interface WsLike {
  send(data: string | Uint8Array, options: { binary: boolean }): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: any[]) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type RawData = Buffer | ArrayBuffer | Buffer[];

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

/**
 * Makes a `ws` socket speak the relay's interface: text frames arrive as `string`, binary as
 * `Uint8Array`, close reasons as `string`, and each frame is sent in the form it came in.
 */
export function adaptWs(ws: WsLike): UpstreamSocket & ClientSocket {
  const adapted = {
    send: (data: string | Uint8Array) => ws.send(data, { binary: typeof data !== 'string' }),
    close: (code?: number, reason?: string) => ws.close(code, reason),
    on(event: string, listener: (...args: any[]) => void) {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      if (event === 'message') {
        ws.on('message', (data: RawData, isBinary: boolean) =>
          listener(isBinary ? toBytes(data) : toBytes(data).toString())
        );
      } else if (event === 'close') {
        ws.on('close', (code: number, reason: Buffer) => listener(code, Buffer.from(reason ?? '').toString('utf8')));
      } else {
        ws.on(event, listener);
      }
    },
  };
  return adapted as unknown as UpstreamSocket & ClientSocket;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|wasm)|image\/svg)/;

/**
 * The built web app's files, by URL path ("/assets/index-abc.js"), read from `root` and kept in memory.
 * Nothing outside `root` can be named: "..", backslashes, NULs and dot-files are refused before the disk is
 * touched, and the resolved path is checked again. Only a file's one plain spelling is served (no percent-encoding,
 * no empty segments), so each file is read, compressed and kept once however it is asked for.
 * A folder that does not exist simply has no files.
 */
export function createStaticFiles(root: string): StaticLookup {
  const base = path.resolve(root);
  const loaded = new Map<string, StaticFile>(); // hits only, one spelling per file, so requests cannot grow it
  return (urlPath) => {
    const hit = loaded.get(urlPath);
    if (hit) return hit;
    let rel: string;
    try {
      rel = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (rel !== urlPath || rel.includes('//') || rel.endsWith('/')) return null;
    if (!rel.startsWith('/') || rel.includes('\0') || rel.includes('\\')) return null;
    if (rel.split('/').some((segment) => segment === '..' || segment.startsWith('.'))) return null;
    const full = path.resolve(base, `.${rel}`);
    if (!full.startsWith(base + path.sep)) return null;
    try {
      if (!fs.statSync(full).isFile()) return null;
      const body = fs.readFileSync(full);
      const type = CONTENT_TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream';
      const file: StaticFile = { body, type };
      // ponytail: compressed on first request, on the event loop (tens of ms at quality 5). Precompress at
      // build time if the bundle grows enough for that pause to show.
      if (COMPRESSIBLE.test(type) && body.length > 1024) {
        file.br = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
      }
      loaded.set(urlPath, file);
      return file;
    } catch {
      return null;
    }
  };
}
