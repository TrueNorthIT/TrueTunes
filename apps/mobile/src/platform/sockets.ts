// WebSocket factories for React Native. RN's WebSocket takes a non-standard third `options`
// argument carrying request headers, which the Sonos endpoint needs (Origin, User-Agent).
// Verified on a Pixel 10 Pro XL in the Phase 0 spike.

import type { SocketFactory, SocketLike } from '../sonos/wsSession';

type HeaderWebSocketCtor = new (
  url: string,
  protocols: string[],
  options: { headers: Record<string, string> },
) => WebSocket;

export const createSonosSocket: SocketFactory = (url, protocols, headers) =>
  new (WebSocket as unknown as HeaderWebSocketCtor)(url, protocols, { headers }) as unknown as SocketLike;

/** Azure Web PubSub takes a plain subprotocol and no custom headers. */
export const createPubSubSocket = (url: string, protocol: string) =>
  new WebSocket(url, protocol) as unknown as SocketLike;
