// Run: npm test (from server/).
//
// createRelay and authoriseUpgrade in server/src/shared/gatewayRelay.ts: the WebSocket half of the
// Sonos gateway. The HTTP half is tested in gatewayHttp.test.ts.
//
// Contract (frozen): GET /sonos/ws, a WebSocket upgrade with subprotocol v1.api.smartspeaker.audio.
//   - The upgrade needs `Authorization: Bearer <Entra ID token>`; authoriseUpgrade decides, and the
//     entry point refuses a null with 401 before any relay or Sonos socket exists.
//   - On accept, the relay fetches a fresh single-use ticket (GET https://play.sonos.com/api/mfe with the
//     session cookie; the ticket is the UUID under a key containing "ticket"), opens
//     wss://api.ws.sonos.com/websocket?ticket=<ticket> with the same subprotocol and no Origin header,
//     and relays frames verbatim in both directions (text and binary, in order).
//   - Frames the client sends before the upstream is open are buffered and delivered in order.
//   - Either side closing closes the other (the close code is passed on where it may be sent). A failed
//     ticket fetch or upstream connection closes the client with 1011; an mfe 401 is retried once with a
//     refreshed session. The ticket and the session are never sent to the client or logged.
//
// The relay is built with injected dependencies, so nothing here touches Sonos or the network:
//   createRelay({ session, fetch, connectUpstream(url, protocols) -> UpstreamSocket, log? }).accept(client)
//   authoriseUpgrade(headers, verify) -> { oid } | null
//
// Sockets are the minimal interfaces the relay exports (see gatewayKit.testkit.ts for the in-memory
// fakes). Text frames are `string`, binary frames are `Uint8Array`, in both directions:
//   interface ClientSocket   { send(data: string | Uint8Array): void; close(code?: number, reason?: string): void;
//                              on('message', (data: string | Uint8Array) => void);
//                              on('close', (code: number, reason: string) => void); on('error', (err: Error) => void) }
//   interface UpstreamSocket   the same, plus on('open', () => void)
// The fakes behave like `ws`: sending before open or after close throws, closing with a code that may
// not be sent (1005, 1006, 1015 ...) throws, and close() is followed by a 'close' event.
//
// Requirements covered here (the IDs are in the test names):
//   GW-1  A request without a valid work sign-in gets 401 and nothing reaches Sonos (the WebSocket half).
//   GW-4  (WebSocket half) a Sonos 401 on the ticket call is healed by one refresh and one retry; the
//         session and ticket never appear in anything sent to the client or logged.
//   GW-5  The relay gets its own ticket per connection, opens the upstream without an Origin header,
//         and relays frames both ways in order, including frames sent before the upstream opened.
//   GW-6  Closing either side closes the other; an upstream failure closes the client with 1011.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authoriseUpgrade, createRelay, selectSubprotocol } from './gatewayRelay';
import { createSonosSession } from './sonosSession';
import { OID, tenantKeys } from './authKit.testkit';
import { SONOS_PASSWORD, SONOS_USERNAME, createFakeSonos } from './sonosKit.testkit';
import {
  GOOD_AUTH,
  GOOD_OID,
  PLAY_ORIGIN,
  SESSION_COOKIE,
  SONOS_SUBPROTOCOL,
  SONOS_WS_URL,
  bearerVerifier,
  createFakeUpstream,
  createSocketHarness,
  createStubSession,
  isSendableCloseCode,
  loginError,
  outcomeOf,
  settle,
  stubVerify,
  waitFor,
  type FakeClientSocket,
  type FakeUpstream,
  type MfeFault,
  type StubSession,
} from './gatewayKit.testkit';

type Frame = string | Uint8Array;

/** A relay over a stub session (or a real one), a fake play.sonos.com and in-memory sockets. */
function rig(
  opts: {
    stub?: StubSession;
    /** Session tokens the fake Sonos accepts. Default: both the stub's first and refreshed token. */
    accept?: string[];
    upstream?: FakeUpstream;
    session?: Parameters<typeof createRelay>[0]['session'];
  } = {}
) {
  const upstream = opts.upstream ?? createFakeUpstream();
  for (const token of opts.accept ?? ['sess-old', 'sess-new']) upstream.accept(token);
  const stub = opts.stub ?? createStubSession('sess-old', 'sess-new');
  const harness = createSocketHarness();
  const logs: string[] = [];
  const relay = createRelay({
    session: opts.session ?? stub.session,
    fetch: upstream.fetch,
    connectUpstream: harness.connectUpstream,
    log: (msg) => void logs.push(msg),
  });

  /** A client connects; the relay is accepting, nothing has happened upstream yet. */
  const start = () => {
    const { client, socket } = harness.newClient();
    const accepted = relay.accept(socket);
    return { client, accepted };
  };

  /** A client connects and the upstream handshake completes. */
  const connect = async () => {
    const seen = harness.upstreams.length;
    const { client, accepted } = start();
    await waitFor(() => harness.upstreams.length > seen, 'the relay to open the upstream connection');
    const up = harness.upstreams[seen];
    up.open();
    await settle(5);
    return { client, accepted, up };
  };

  return { upstream, stub, harness, logs, relay, start, connect };
}

/** Frames equal in number, order, kind (text vs binary) and content. */
function assertFrames(actual: Frame[], expected: Frame[], what: string): void {
  assert.equal(actual.length, expected.length, `Expected ${expected.length} ${what}, got ${actual.length}`);
  expected.forEach((want, i) => {
    const got = actual[i];
    if (typeof want === 'string') {
      assert.equal(got, want, `Expected ${what} #${i + 1} to be the text frame ${JSON.stringify(want)}`);
    } else {
      assert.ok(typeof got !== 'string', `Expected ${what} #${i + 1} to stay a binary frame, but it became text`);
      assert.ok(
        Buffer.from(got).equals(Buffer.from(want)),
        `Expected ${what} #${i + 1} to carry the same ${want.length} bytes`
      );
    }
  });
}

const sendable = (code: number | undefined) => code === undefined || isSendableCloseCode(code);

function assertNoViolations(sockets: Array<{ violations: string[] }>, when: string): void {
  for (const s of sockets) assert.deepEqual(s.violations, [], `Expected no illegal socket use ${when}`);
}

const ALL_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);

// ── GW-1: only a signed-in colleague may open the relay ──────────────────────

test('GW-1: authoriseUpgrade with no Authorization header is refused (null)', async () => {
  const v = stubVerify();
  const who = await authoriseUpgrade({ host: 'gateway.example', upgrade: 'websocket' }, v.verify);
  assert.equal(who, null, 'Expected an upgrade with no work sign-in to be refused');
  assert.deepEqual(v.calls, [undefined], 'Expected verify to be asked, with no header, so it alone decides');
});

test('GW-1: authoriseUpgrade with an Authorization header verify rejects is refused (null)', async () => {
  const v = stubVerify();
  const who = await authoriseUpgrade({ authorization: 'Bearer not-a-colleague' }, v.verify);
  assert.equal(who, null, 'Expected an invalid token to be refused');
  assert.deepEqual(v.calls, ['Bearer not-a-colleague'], 'Expected verify to be given the header value as sent');
});

test('GW-1: authoriseUpgrade with a valid token returns the caller’s oid', async () => {
  const v = stubVerify();
  const who = await authoriseUpgrade({ authorization: GOOD_AUTH }, v.verify);
  assert.deepEqual(who, { oid: GOOD_OID }, 'Expected { oid } for a signed-in colleague');
});

test('GW-1: authoriseUpgrade never admits a caller when verify throws', async () => {
  const who = await authoriseUpgrade({ authorization: GOOD_AUTH }, async () => {
    throw new Error('JWKS fetch failed');
  }).catch(() => null);
  assert.equal(
    who,
    null,
    'Expected a failed token check to refuse the upgrade (null, or a rejection the entry point refuses with)'
  );
});

// ── GW-1 for browsers: the token as a subprotocol value ──

const GOOD_TOKEN_ONLY = GOOD_AUTH.slice('Bearer '.length);

test('GW-1: a browser’s token offered as a bearer.<token> subprotocol is checked like an Authorization header', async () => {
  const v = stubVerify();
  const who = await authoriseUpgrade(
    { 'sec-websocket-protocol': `${SONOS_SUBPROTOCOL}, bearer.${GOOD_TOKEN_ONLY}` },
    v.verify
  );
  assert.deepEqual(who, { oid: GOOD_OID });
  assert.deepEqual(v.calls, [GOOD_AUTH], 'Expected verify to be given the token as a Bearer credential');
});

test('GW-1: the bearer subprotocol may come first, without spaces, or as repeated headers', async () => {
  for (const offered of [
    `bearer.${GOOD_TOKEN_ONLY},${SONOS_SUBPROTOCOL}`,
    [SONOS_SUBPROTOCOL, `bearer.${GOOD_TOKEN_ONLY}`],
    `bearer.${GOOD_TOKEN_ONLY}`,
  ]) {
    const who = await authoriseUpgrade({ 'sec-websocket-protocol': offered }, stubVerify().verify);
    assert.deepEqual(who, { oid: GOOD_OID }, `Expected ${JSON.stringify(offered)} to be admitted`);
  }
});

test('GW-1: a bearer subprotocol that does not verify, or is empty, is refused', async () => {
  for (const offered of [`${SONOS_SUBPROTOCOL}, bearer.forged`, `${SONOS_SUBPROTOCOL}, bearer.`, SONOS_SUBPROTOCOL]) {
    const who = await authoriseUpgrade({ 'sec-websocket-protocol': offered }, stubVerify().verify);
    assert.equal(who, null, `Expected ${offered} to be refused`);
  }
});

test('GW-1: an Authorization header wins over a bearer subprotocol (the desktop path is unchanged)', async () => {
  const v = stubVerify();
  const who = await authoriseUpgrade(
    {
      authorization: 'Bearer not-a-colleague',
      'sec-websocket-protocol': `${SONOS_SUBPROTOCOL}, bearer.${GOOD_TOKEN_ONLY}`,
    },
    v.verify
  );
  assert.equal(who, null);
  assert.deepEqual(v.calls, ['Bearer not-a-colleague']);
});

test('GW-1: a genuine tenant token is admitted as a subprotocol, and a forged one is not', async () => {
  const { check, sign, rogue } = await tenantKeys();
  const verify = bearerVerifier(check);
  const offer = (token: string) => ({ 'sec-websocket-protocol': `${SONOS_SUBPROTOCOL}, bearer.${token}` });
  assert.deepEqual(await authoriseUpgrade(offer(await sign()), verify), { oid: OID });
  assert.equal(await authoriseUpgrade(offer(await sign(undefined, { key: rogue })), verify), null);
});

test('GW-1: the server selects the Sonos subprotocol only, never the entry carrying the token', () => {
  assert.equal(selectSubprotocol(new Set([SONOS_SUBPROTOCOL, 'bearer.abc.def.ghi'])), SONOS_SUBPROTOCOL);
  assert.equal(selectSubprotocol(new Set(['bearer.abc.def.ghi', SONOS_SUBPROTOCOL])), SONOS_SUBPROTOCOL);
  assert.equal(selectSubprotocol(new Set(['bearer.abc.def.ghi'])), false);
  assert.equal(selectSubprotocol(new Set()), false);
});

// Through the REAL Entra check: only a genuine tenant token is admitted.
test('GW-1: authoriseUpgrade admits a genuine tenant token and refuses forged, expired and foreign ones', async () => {
  const { check, sign, rogue } = await tenantKeys();
  const verify = bearerVerifier(check);
  assert.deepEqual(
    await authoriseUpgrade({ authorization: `Bearer ${await sign()}` }, verify),
    { oid: OID },
    'Expected a genuine token to be admitted'
  );
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
  const other = 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0';
  for (const [what, token] of [
    ['a forged token', await sign(undefined, { key: rogue })],
    ['an expired token', await sign(undefined, { exp: twoHoursAgo })],
    ['a token from another tenant', await sign(undefined, { iss: other })],
  ] as const) {
    assert.equal(
      await authoriseUpgrade({ authorization: `Bearer ${token}` }, verify),
      null,
      `Expected ${what} to be refused`
    );
  }
  assert.equal(await authoriseUpgrade({}, verify), null, 'Expected no token to be refused, whatever AUTH_ENFORCE says');
});

// ── GW-5: a ticket per connection, no Origin, frames both ways in order ──────

test('GW-5: accepting a client fetches /api/mfe with the session cookie and connects to Sonos with the ticket and subprotocol', async () => {
  const r = rig();
  const { up } = await r.connect();
  const mfe = r.upstream.mfeCalls();
  assert.equal(mfe.length, 1, 'Expected exactly one ticket request to /api/mfe');
  assert.equal(mfe[0].method, 'GET', 'Expected the ticket request to be a GET');
  assert.equal(
    mfe[0].url.href,
    `${PLAY_ORIGIN}/api/mfe`,
    'Expected the ticket to be fetched from https://play.sonos.com/api/mfe'
  );
  assert.equal(
    mfe[0].headers.get('cookie'),
    `${SESSION_COOKIE}=sess-old`,
    'Expected the ticket request to carry the server’s session cookie'
  );
  assert.equal(r.harness.upstreams.length, 1, 'Expected one upstream connection for one client');
  assert.equal(
    up.url,
    `${SONOS_WS_URL}?ticket=${r.upstream.ticketsIssued[0]}`,
    'Expected wss://api.ws.sonos.com/websocket?ticket=<the ticket mfe issued>'
  );
  assert.deepEqual(up.protocols, [SONOS_SUBPROTOCOL], `Expected the subprotocol ${SONOS_SUBPROTOCOL}`);
});

// The mfe payload carries other UUIDs; only the one under a "ticket" key is the ticket.
test('GW-5: the ticket is the UUID under a key containing "ticket", not another UUID in the mfe response', async () => {
  const r = rig();
  const { up } = await r.connect();
  const ticket = r.upstream.ticketsIssued[0];
  assert.equal(up.ticket, ticket, 'Expected the connection to use the wsTicket value');
  assert.match(ticket, /^[0-9a-f-]{36}$/, 'Expected the fake ticket to be a UUID');
});

test('GW-5: the upstream connection is made with a URL and subprotocols only, so no Origin header can go with it', async () => {
  const r = rig();
  const { up } = await r.connect();
  assert.equal(
    up.args.length,
    2,
    `Expected connectUpstream(url, protocols) and nothing else, got ${up.args.length} arguments`
  );
  assert.ok(!/origin/i.test(JSON.stringify(up.args)), 'Expected no Origin anywhere in the connection arguments');
});

test('GW-5: every client connection gets its own ticket', async () => {
  const r = rig();
  const a = await r.connect();
  const b = await r.connect();
  const c = await r.connect();
  assert.equal(r.upstream.mfeCalls().length, 3, 'Expected one ticket request per client connection');
  const tickets = [a.up.ticket, b.up.ticket, c.up.ticket];
  assert.equal(
    new Set(tickets).size,
    3,
    `Expected three different tickets (a ticket is single-use), got ${tickets.join(', ')}`
  );
  assert.deepEqual(tickets, r.upstream.ticketsIssued, 'Expected each connection to use the ticket issued for it');
});

test('GW-5: frames from the client reach Sonos verbatim and in order, text as text and binary as binary', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  const frames: Frame[] = [
    JSON.stringify([{ namespace: 'households', command: 'getHouseholds', corrId: 'c-1' }, { connectedOnly: 'true' }]),
    '',
    'café \u{1f3b5}   {"nested":{"a":[1,2,3]}}',
    ALL_BYTES,
    new Uint8Array([0xff, 0xfe, 0x00, 0x01]),
    'last',
  ];
  for (const f of frames) client.peerMessage(f);
  await settle(5);
  assertFrames(up.sent, frames, 'frames at Sonos');
  assertNoViolations([up, client], 'while relaying client frames');
});

test('GW-5: frames from Sonos reach the client verbatim and in order, text as text and binary as binary', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  const frames: Frame[] = [
    JSON.stringify([
      { namespace: 'playbackExtended', name: 'playbackStatus' },
      { playback: { playbackState: 'PLAYBACK_STATE_PLAYING' } },
    ]),
    '',
    ALL_BYTES,
    'café \u{1f3b5}',
    new Uint8Array([0x00]),
  ];
  for (const f of frames) up.peerMessage(f);
  await settle(5);
  assertFrames(client.sent, frames, 'frames at the client');
  assertNoViolations([up, client], 'while relaying Sonos frames');
});

test('GW-5: a long interleaved conversation keeps its order in each direction', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  const toSonos: Frame[] = [];
  const toClient: Frame[] = [];
  for (let i = 0; i < 100; i++) {
    const out = i % 3 === 0 ? new Uint8Array([i, i + 1]) : `command-${i}`;
    const back = i % 4 === 0 ? new Uint8Array([200 - i]) : `push-${i}`;
    toSonos.push(out);
    toClient.push(back);
    client.peerMessage(out);
    up.peerMessage(back);
  }
  await settle(10);
  assertFrames(up.sent, toSonos, 'frames at Sonos');
  assertFrames(client.sent, toClient, 'frames at the client');
});

test('GW-5: the relay adds nothing of its own to the conversation', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  await settle(10);
  assert.deepEqual(client.sent, [], 'Expected nothing to be sent to the client until Sonos sends something');
  assert.deepEqual(up.sent, [], 'Expected nothing to be sent to Sonos until the client sends something');
});

// The app sends its first command the moment the socket is open, before Sonos has even been asked
// for a ticket: those frames are buffered and delivered in order once the upstream is open.
test('GW-5: frames the client sends before the upstream is open are delivered in order once it opens', async () => {
  const r = rig();
  const { client, accepted } = r.start();
  const early: Frame[] = ['subscribe-1', new Uint8Array([1, 2, 3]), 'subscribe-2'];
  for (const f of early) client.peerMessage(f); // before the ticket has been fetched
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  const up = r.harness.upstreams[0];
  client.peerMessage('while-connecting'); // after the ticket, before the handshake completes
  await settle(5);
  assert.deepEqual(
    up.sent,
    [],
    'Expected nothing to be sent to a socket that is not open yet (a real socket would throw)'
  );
  up.open();
  await settle(5);
  client.peerMessage('after-open');
  await settle(5);
  assertFrames(up.sent, [...early, 'while-connecting', 'after-open'], 'frames at Sonos');
  assertNoViolations([up, client], 'while buffering frames');
  assert.notEqual(await outcomeOf(accepted, 50), 'rejected', 'Expected accept not to reject');
});

test('GW-5: one client’s frames never reach another client’s Sonos connection', async () => {
  const r = rig();
  const a = await r.connect();
  const b = await r.connect();
  a.client.peerMessage('for-a');
  b.client.peerMessage('for-b');
  a.up.peerMessage('from-a-sonos');
  await settle(5);
  assertFrames(a.up.sent, ['for-a'], 'frames at A’s Sonos connection');
  assertFrames(b.up.sent, ['for-b'], 'frames at B’s Sonos connection');
  assertFrames(a.client.sent, ['from-a-sonos'], 'frames at client A');
  assertFrames(b.client.sent, [], 'frames at client B');
});

// ── GW-6: closing either side closes the other ───────────────────────────────

for (const code of [1000, 1001, 4001]) {
  test(`GW-6: when the client closes with ${code}, the Sonos connection is closed with ${code}`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    client.peerClose(code, 'bye');
    await waitFor(() => up.closeCalls.length > 0, 'the Sonos connection to be closed');
    assert.equal(up.closeCalls[0].code, code, `Expected the close code ${code} to be passed on to Sonos`);
    assertNoViolations([up, client], 'when the client closed');
  });
}

for (const code of [1000, 1001, 1008, 4000]) {
  test(`GW-6: when Sonos closes with ${code}, the client is closed with ${code}`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    up.peerClose(code, 'bye');
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(client.closeCalls[0].code, code, `Expected the close code ${code} to be passed on to the client`);
    assertNoViolations([up, client], 'when Sonos closed');
  });
}

// 1005 (no status), 1006 (abnormal) and 1015 (TLS) are reported to a listener but may not be sent in a close frame.
for (const code of [1005, 1006, 1015]) {
  test(`GW-6: when Sonos closes with ${code}, which cannot be sent, the client is still closed (with a code it may be sent)`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    assert.doesNotThrow(() => up.peerClose(code), `Expected the relay not to throw when Sonos closes with ${code}`);
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.ok(
      sendable(client.closeCalls[0].code),
      `Expected the client to be closed with no code or a sendable one, not ${client.closeCalls[0].code}`
    );
    assertNoViolations([up, client], `when Sonos closed with ${code}`);
  });

  test(`GW-6: when the client closes with ${code}, which cannot be sent, Sonos is still closed (with a code it may be sent)`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    assert.doesNotThrow(
      () => client.peerClose(code),
      `Expected the relay not to throw when the client closes with ${code}`
    );
    await waitFor(() => up.closeCalls.length > 0, 'the Sonos connection to be closed');
    assert.ok(
      sendable(up.closeCalls[0].code),
      `Expected Sonos to be closed with no code or a sendable one, not ${up.closeCalls[0].code}`
    );
    assertNoViolations([up, client], `when the client closed with ${code}`);
  });
}

test('GW-6: once the client has closed, late frames from Sonos are not sent to it', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  client.peerClose(1000);
  assert.doesNotThrow(() => up.peerMessage('too late'), 'Expected a late Sonos frame not to blow up the relay');
  await settle(10);
  assertNoViolations([up, client], 'after the client closed');
});

test('GW-6: once Sonos has closed, late frames from the client are not sent to it', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  up.peerClose(1000);
  assert.doesNotThrow(() => client.peerMessage('too late'), 'Expected a late client frame not to blow up the relay');
  await settle(10);
  assertNoViolations([up, client], 'after Sonos closed');
});

test('GW-6: the client closing while the upstream is still connecting leaves no Sonos connection open', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  client.peerClose(1001);
  await settle(20);
  const [up] = r.harness.upstreams;
  assert.ok(
    up.closeCalls.length > 0 || up.state === 'closed',
    'Expected the half-open Sonos connection to be closed when the client left'
  );
  assertNoViolations([up, client], 'when the client left during the handshake');
});

test('GW-6: the client closing before the ticket has arrived leaves no Sonos connection open', async () => {
  const r = rig();
  const { client } = r.start();
  client.peerClose(1001);
  await settle(30);
  for (const up of r.harness.upstreams) {
    assert.ok(
      up.closeCalls.length > 0 || up.state === 'closed',
      'Expected any Sonos connection made after the client left to be closed straight away'
    );
  }
  assertNoViolations([client, ...r.harness.upstreams], 'when the client left before the ticket arrived');
});

// A socket that never opened is a failed connection: the client is told with 1011 (internal error).
test('GW-6: when the upstream connection fails (error, then close 1006), the client is closed with 1011', async () => {
  const r = rig();
  const { client, accepted } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  const [up] = r.harness.upstreams;
  up.peerError(new Error('Unexpected server response: 401'));
  up.peerClose(1006);
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011, 'Expected 1011 when the Sonos connection could not be made');
  assert.notEqual(await outcomeOf(accepted), 'rejected', 'Expected accept to handle the failure, not reject');
  assertNoViolations([up, client], 'when the upstream connection failed');
});

test('GW-6: when the upstream connection errors and nothing else follows, the client is closed with 1011', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  r.harness.upstreams[0].peerError(new Error('connect ECONNREFUSED'));
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011, 'Expected 1011 for an upstream error before it opened');
});

test('GW-6: when the upstream closes before it ever opened, the client is closed with 1011', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  r.harness.upstreams[0].peerClose(1006);
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011, 'Expected 1011 for an upstream that closed before it opened');
  assertNoViolations([client, ...r.harness.upstreams], 'when the upstream closed before opening');
});

const TICKET_FAILURES: Array<{ name: string; fault?: MfeFault; session?: () => StubSession }> = [
  { name: 'the /api/mfe request cannot connect', fault: 'network' },
  { name: '/api/mfe answers 500', fault: 'server-error' },
  { name: '/api/mfe answers 200 with no ticket in it', fault: 'no-ticket' },
  { name: '/api/mfe answers 200 with something that is not JSON', fault: 'not-json' },
  {
    name: 'the Sonos login fails',
    session: () => {
      const s = createStubSession();
      s.failAll(loginError());
      return s;
    },
  },
];

for (const failure of TICKET_FAILURES) {
  test(`GW-6: when ${failure.name}, the client is closed with 1011 and no Sonos connection is made`, async () => {
    const r = rig({ stub: failure.session?.() });
    r.upstream.mfeFault = failure.fault ?? null;
    const { client, accepted } = r.start();
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(client.closeCalls[0].code, 1011, `Expected 1011 when ${failure.name}`);
    assert.equal(r.harness.upstreams.length, 0, 'Expected no upstream connection without a ticket');
    assert.notEqual(await outcomeOf(accepted), 'rejected', 'Expected accept to handle the failure, not reject');
    assertNoViolations([client], `when ${failure.name}`);
  });
}

// ── GW-4 (WebSocket half): a Sonos 401 on the ticket call is healed once ─────

test('GW-4: a Sonos 401 on the ticket request is healed by one session refresh and one retry, and the client stays connected', async () => {
  const r = rig({ accept: ['sess-new'] });
  const { client, up } = await r.connect();
  assert.deepEqual(
    r.stub.calls,
    [{ refresh: false }, { refresh: true }],
    'Expected one cached lookup, then exactly one refresh'
  );
  const mfe = r.upstream.mfeCalls();
  assert.equal(mfe.length, 2, 'Expected the 401 and exactly one retry');
  assert.equal(
    mfe[0].headers.get('cookie'),
    `${SESSION_COOKIE}=sess-old`,
    'Expected the first attempt to use the cached session'
  );
  assert.equal(
    mfe[1].headers.get('cookie'),
    `${SESSION_COOKIE}=sess-new`,
    'Expected the retry to use the refreshed session'
  );
  assert.equal(up.ticket, r.upstream.ticketsIssued[0], 'Expected the connection to use the ticket from the retry');
  assert.deepEqual(client.closeCalls, [], 'Expected the client not to be disturbed by the healed 401');
});

test('GW-4: a second Sonos 401 on the ticket request closes the client with 1011 after one refresh and one retry', async () => {
  const r = rig({ accept: [] });
  const { client } = r.start();
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(
    client.closeCalls[0].code,
    1011,
    'Expected 1011 when the ticket cannot be had even with a fresh session'
  );
  assert.equal(r.upstream.mfeCalls().length, 2, 'Expected one attempt and one retry, no more');
  assert.equal(r.stub.refreshes(), 1, 'Expected exactly one refresh');
  assert.equal(r.harness.upstreams.length, 0, 'Expected no upstream connection without a ticket');
});

test('GW-4: when the refresh after a Sonos 401 cannot log in, the client is closed with 1011', async () => {
  const stub = createStubSession();
  stub.failRefresh(loginError());
  const r = rig({ stub, accept: [] });
  const { client } = r.start();
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011, 'Expected 1011 when the session cannot be refreshed');
  assert.equal(r.harness.upstreams.length, 0, 'Expected no upstream connection');
});

// Several apps reconnect at once when the session has expired: every one gets a ticket, Sonos sees one new login.
test('GW-4: ten concurrent connections on an expired session are all healed by one new Sonos login, each with its own ticket', async () => {
  const sonos = createFakeSonos();
  const upstream = createFakeUpstream(sonos);
  const session = createSonosSession({ fetch: upstream.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const r = rig({ upstream, session, accept: [] });
  await r.connect(); // the first connection logs in
  sonos.expireAllSessions();
  const before = r.harness.upstreams.length;
  const clients = Array.from({ length: 10 }, () => r.start());
  await waitFor(() => r.harness.upstreams.length === before + 10, 'ten upstream connections', 5000);
  assert.equal(
    sonos.counts.sessionsIssued,
    2,
    `Expected one new login in all, Sonos issued ${sonos.counts.sessionsIssued} sessions`
  );
  const tickets = r.harness.upstreams.slice(before).map((u) => u.ticket);
  assert.equal(new Set(tickets).size, 10, 'Expected ten different tickets, one per connection');
  for (const t of tickets)
    assert.ok(upstream.ticketsIssued.includes(t as string), 'Expected every ticket to be one Sonos issued');
  for (const c of clients) assert.deepEqual(c.client.closeCalls, [], 'Expected no client to be closed');
});

// ── the ticket and the session never reach the client or the logs ────────────

/** Everything the client was sent or told, and everything logged. */
const visibleTo = (r: { logs: string[] }, client: FakeClientSocket): string =>
  JSON.stringify({
    sent: client.sent.map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))),
    closes: client.closeCalls,
  }) +
  '\n' +
  r.logs.join('\n');

test('GW-5: on a working connection the ticket and the session token appear nowhere the client or the logs can see', async () => {
  const r = rig({ accept: ['sess-new'] }); // the first attempt is healed, so both session tokens are in play
  const { client, up } = await r.connect();
  up.peerMessage('hello from sonos');
  client.peerMessage('hello from the app');
  await settle(5);
  const seen = visibleTo(r, client);
  for (const secret of [up.ticket as string, 'sess-old', 'sess-new']) {
    assert.ok(!seen.includes(secret), `Expected "${secret}" to appear in nothing sent to the client or logged`);
  }
});

test('GW-6: when the upstream fails with an error that quotes the ticket URL, neither the ticket nor the session reaches the client or the logs', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  const [up] = r.harness.upstreams;
  up.peerError(new Error(`Unexpected server response: 403 for ${up.url} (Cookie: ${SESSION_COOKIE}=sess-old)`));
  up.peerClose(1006, `${up.url}`);
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  const seen = visibleTo(r, client);
  for (const secret of [up.ticket as string, 'sess-old']) {
    assert.ok(!seen.includes(secret), `Expected "${secret}" to appear in nothing sent to the client or logged`);
  }
});

test('GW-6: when the ticket request fails with an error that quotes the session cookie, the session does not reach the client or the logs', async () => {
  const r = rig();
  r.upstream.mfeFault = 'network'; // throws "fetch failed: Cookie: <session cookie>"
  const { client } = r.start();
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.ok(
    !visibleTo(r, client).includes('sess-old'),
    'Expected the session token to appear in nothing sent to the client or logged'
  );
});

test('GW-4: a failing Sonos login on connect leaks neither the password nor the session into the client’s close or the logs', async () => {
  const sonos = createFakeSonos();
  sonos.fault = 'mfa-required';
  sonos.echoCredentials = true;
  const upstream = createFakeUpstream(sonos);
  const session = createSonosSession({ fetch: upstream.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const r = rig({ upstream, session });
  const { client } = r.start();
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011, 'Expected 1011 when the Sonos login fails');
  assert.ok(
    !visibleTo(r, client).includes(SONOS_PASSWORD),
    'Expected the password to appear in nothing sent to the client or logged'
  );
});
