// The Sonos gateway: a thin Node process that fronts Sonos for the True Tunes desktop app.
// Callers authenticate with an Entra ID token; the gateway holds the Sonos session.
//
// Runs on Azure App Service (Linux, Node 22): `node dist/gateway/main.js`, listening on PORT.
// All the logic is in shared/gatewayHttp.ts (HTTP) and shared/gatewayRelay.ts (WebSocket);
// this file only wires them to node:http and `ws`.
//
// Logs one line per request and per socket open/close. Never headers, query strings, bodies,
// tokens, tickets or the session.
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { entraCheckFromEnv, verifyEntraToken } from '../shared/auth';
import { createSonosSession } from '../shared/sonosSession';
import { createGatewayHandler } from '../shared/gatewayHttp';
import { authoriseUpgrade, createRelay } from '../shared/gatewayRelay';
import { BodyTooLargeError, adaptWs, readBodyCapped } from '../shared/gatewayNode';

const SUBPROTOCOL = 'v1.api.smartspeaker.audio';
const HEARTBEAT_MS = 30_000;
const log = (line: string) => console.log(line);

const session = createSonosSession({
  fetch: (...args) => fetch(...args),
  username: process.env['SONOS_USERNAME'] ?? '',
  password: process.env['SONOS_PASSWORD'] ?? '',
});

/** A valid Entra ID token for this tenant and app is always required: no AUTH_ENFORCE pass-through. */
async function verify(authorization: string | undefined): Promise<{ oid: string } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  const check = entraCheckFromEnv();
  if (!token || !check) return null;
  try {
    return { oid: await verifyEntraToken(token, check) };
  } catch {
    return null;
  }
}

const handler = createGatewayHandler({ session, fetch: (...args) => fetch(...args), verify, log });

const relay = createRelay({
  session,
  fetch: (...args) => fetch(...args),
  // No `origin` option, so ws sends no Origin header.
  connectUpstream: (url, protocols) => adaptWs(new WebSocket(url, protocols)),
  log,
});

const pathOf = (url: string | undefined) => (url ?? '/').split('?')[0] ?? '/';

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const path = pathOf(req.url);
  let status = 500;
  try {
    let body: Uint8Array;
    try {
      body = await readBodyCapped(req);
    } catch (err) {
      if (!(err instanceof BodyTooLargeError)) throw err;
      status = 413;
      res
        .writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' })
        .end('{"error":"payload too large"}');
      return;
    }
    const out = await handler({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: req.headers,
      ...(body.length ? { body } : {}),
    });
    status = out.status;
    res.writeHead(out.status, out.headers).end(out.body);
  } catch (err) {
    console.error(`[gateway] ${req.method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    status = 500;
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"internal"}');
  } finally {
    log(`[gateway] ${req.method} ${path} ${status} ${Date.now() - started}ms`);
  }
});

// ── WebSocket upgrades: /sonos/ws only ──
const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => (protocols.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
});
const alive = new WeakMap<WebSocket, boolean>();

function refuse(socket: Duplex, line: string) {
  socket.end(`${line}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

server.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => undefined);
  if (pathOf(req.url) !== '/sonos/ws') {
    log(`[gateway] upgrade ${pathOf(req.url)} 404`);
    return refuse(socket, 'HTTP/1.1 404 Not Found');
  }
  try {
    const caller = await authoriseUpgrade(req.headers, verify);
    if (!caller) {
      log('[gateway] upgrade /sonos/ws 401');
      return refuse(socket, 'HTTP/1.1 401 Unauthorized');
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const opened = Date.now();
      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));
      ws.on('error', () => undefined); // the adapter's own error listener reports it to the relay
      ws.on('close', (code) => log(`[gateway] ws /sonos/ws closed ${code} ${Date.now() - opened}ms oid=${caller.oid}`));
      log(`[gateway] ws /sonos/ws open oid=${caller.oid}`);
      relay.accept(adaptWs(ws)).catch((err) => {
        console.error(`[gateway] relay failed: ${err instanceof Error ? err.message : String(err)}`);
        ws.close(1011, 'internal');
      });
    });
  } catch (err) {
    console.error(`[gateway] upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    refuse(socket, 'HTTP/1.1 500 Internal Server Error');
  }
});

// Ping every 30 s: drops clients that never pong, and keeps App Service's ~4 minute idle timeout at bay.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, HEARTBEAT_MS);
heartbeat.unref();

const port = Number(process.env['PORT'] ?? 8080);
server.listen(port, () => log(`[gateway] listening on ${port}`));

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log(`[gateway] ${signal}: shutting down`);
  clearInterval(heartbeat);
  server.close();
  for (const ws of wss.clients) ws.close(1001, 'server shutting down');
  setTimeout(() => process.exit(0), 2000).unref();
  server.once('close', () => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A stray rejection must not take every relay down with it.
process.on('unhandledRejection', (err) =>
  console.error(`[gateway] unhandled rejection: ${err instanceof Error ? err.message : String(err)}`)
);
process.on('uncaughtException', (err) => console.error(`[gateway] uncaught exception: ${err.message}`));
