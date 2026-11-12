// The live "who queued this" channel: the desktop's Web PubSub connection (src/pubsub.ts), through the gateway's
// /pubsub/ws relay so the browser stays on its own origin. The Entra ID token rides in a second subprotocol
// (`bearer.<token>`), never in the URL; the display name is in the query string. An addition, never a dependency:
// if this socket never connects, the map still refreshes on every queue change.

import type { WebAuth } from './types';

const PROTOCOL = 'json.webpubsub.azure.v1';
const GROUP = 'office';
const OPEN = 1; // WebSocket.OPEN: the injected class need not carry the constant

export interface AttributionSocket {
  /** Connects (once a name is known) and reconnects until `stop`. Does nothing if already running. */
  start(): void;
  /** Closes the socket and stops reconnecting. */
  stop(): void;
  /** The name changed: reconnect under the new one (the desktop re-inits pubsub there). Does nothing unless running. */
  rename(): void;
  /** Broadcasts to the office when the socket is open; otherwise does nothing. */
  send(event: AttributionEvent): void;
}

export function createAttributionSocket(o: {
  auth: WebAuth;
  WebSocket: typeof WebSocket;
  /** The relay, without a query string: `wss://host/pubsub/ws`. */
  url: string;
  name: () => string | undefined;
  /** A group message's event, for `attribution.ingest`, which decides what enters the map. */
  onEvent: (event: AttributionEvent) => void;
}): AttributionSocket {
  let ws: WebSocket | null = null;
  let running = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Moves on at every stop and rename, so a connect that was waiting for a token knows it is out of date. */
  let generation = 0;

  const isOpen = () => ws !== null && ws.readyState === OPEN;

  function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function closeSocket(): void {
    const sock = ws;
    ws = null;
    try {
      sock?.close();
    } catch {
      /* already gone */
    }
  }

  function scheduleReconnect(): void {
    if (!running || timer) return;
    const delay = Math.min(1000 * 2 ** attempts, 60_000);
    attempts++;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, delay);
  }

  function handleMessage(data: unknown): void {
    try {
      const msg = JSON.parse(String(data)) as {
        type?: string;
        from?: string;
        group?: string;
        data?: AttributionEvent;
      };
      if (msg.type === 'message' && msg.from === 'group' && msg.group === GROUP && msg.data) {
        if (typeof msg.data === 'object') o.onEvent(msg.data);
      }
    } catch {
      /* ignore malformed messages */
    }
  }

  async function connect(): Promise<void> {
    if (!running || ws) return;
    const name = o.name();
    if (!name) return; // no name yet: a rename starts the connection
    const mine = generation;
    let token: string | null = null;
    try {
      token = await o.auth.idToken(); // fresh for every attempt
    } catch {
      /* treated as no token */
    }
    if (!running || mine !== generation || ws) return;
    if (!token) {
      // No token: the main gateway path owns telling the user to sign in. Stay quiet until start() is called again.
      running = false;
      return;
    }

    let sock: WebSocket;
    try {
      sock = new o.WebSocket(`${o.url}?username=${encodeURIComponent(name)}`, [PROTOCOL, `bearer.${token}`]);
    } catch {
      scheduleReconnect(); // a browser may refuse to construct it: try again later, as for any failure
      return;
    }
    ws = sock;
    sock.addEventListener('open', () => {
      if (ws !== sock) return;
      attempts = 0;
      sock.send(JSON.stringify({ type: 'joinGroup', group: GROUP }));
    });
    sock.addEventListener('message', (e) => {
      if (ws === sock) handleMessage((e as MessageEvent).data);
    });
    sock.addEventListener('close', () => {
      if (ws !== sock) return; // replaced or stopped on purpose
      ws = null;
      scheduleReconnect();
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempts = 0;
      void connect();
    },
    stop() {
      running = false;
      generation++;
      clearTimer();
      closeSocket();
    },
    rename() {
      if (!running) return;
      generation++;
      clearTimer();
      closeSocket();
      attempts = 0;
      void connect();
    },
    send(event) {
      if (!ws || !isOpen()) return;
      try {
        ws.send(JSON.stringify({ type: 'sendToGroup', group: GROUP, data: event, dataType: 'json', noEcho: true }));
      } catch {
        /* the socket is going away: the durable record is the POST */
      }
    },
  };
}
