// The Node-specific glue of the Sonos gateway entry point (src/gateway/main.ts), kept here as plain
// functions so it can be tested without a server: the request body cap and the adapter that makes a
// `ws` socket look like the minimal sockets gatewayRelay.ts works with.
import type { ClientSocket, UpstreamSocket } from './gatewayRelay';

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
