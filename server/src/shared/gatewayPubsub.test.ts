// Run: npm test (from server/).
//
// createPubSubRelay, validPubSubUrl, credentialFromHeaders and the path-aware subprotocol choice in
// server/src/shared/gatewayRelay.ts: GET /pubsub/ws, the gateway's relay to the caller's Azure Web PubSub
// connection, so the browser only ever talks to its own origin.
//
// Contract:
//   - The upgrade is authorised exactly like /sonos/ws (authoriseUpgrade); the entry point refuses with 401 first.
//   - On accept the relay calls POST <functions origin>/api/connect?username=<encoded> with the caller's own
//     Authorization value and nothing else, reads `webPubSubUrl`, checks it (wss:, host *.webpubsub.azure.com, no
//     userinfo), opens it with subprotocol json.webpubsub.azure.v1 and pipes frames like the Sonos relay does.
//   - A failed connect call, a missing or foreign URL or an upstream failure closes the client with 1011.
//   - The access URL, the caller's token and the connect response are never logged or sent to the client.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBSUB_WS_PROTOCOL,
  authoriseUpgrade,
  createPubSubRelay,
  credentialFromHeaders,
  handleProtocols,
  selectSubprotocolForPath,
  validPubSubUrl,
} from './gatewayRelay';
import {
  FUNCTIONS_URL,
  GOOD_AUTH,
  GOOD_OID,
  GOOD_TOKEN,
  PUBSUB_ACCESS_TOKEN,
  PUBSUB_SUBPROTOCOL,
  PUBSUB_URL,
  SONOS_SUBPROTOCOL,
  createFakeFunctions,
  createFakeUpstream,
  createSocketHarness,
  settle,
  stubVerify,
  waitFor,
  type ConnectFault,
  type FakeClientSocket,
} from './gatewayKit.testkit';

type Frame = string | Uint8Array;

function rig(opts: { fetchOverride?: typeof fetch } = {}) {
  const functions = createFakeFunctions();
  const sonos = createFakeUpstream(); // must never be asked anything
  const harness = createSocketHarness();
  const logs: string[] = [];
  const relay = createPubSubRelay({
    fetch: opts.fetchOverride ?? functions.fetch,
    functionsOrigin: FUNCTIONS_URL,
    connectUpstream: harness.connectUpstream,
    log: (m) => void logs.push(m),
  });
  const start = (username = 'Alex B', credential = GOOD_AUTH) => {
    const { client, socket } = harness.newClient();
    return { client, accepted: relay.accept(socket, { credential, username }) };
  };
  const connect = async (username?: string) => {
    const seen = harness.upstreams.length;
    const { client, accepted } = start(username);
    await waitFor(() => harness.upstreams.length > seen, 'the relay to open the upstream connection');
    const up = harness.upstreams[seen];
    up.open();
    await settle(5);
    return { client, accepted, up };
  };
  return { functions, sonos, harness, logs, relay, start, connect };
}

const visibleTo = (logs: string[], client: FakeClientSocket): string =>
  JSON.stringify({
    sent: client.sent.map((f) => (typeof f === 'string' ? f : Buffer.from(f).toString('latin1'))),
    closes: client.closeCalls,
  }) +
  '\n' +
  logs.join('\n');

// ── authorisation: the same rule as /sonos/ws ──

test('PS-1: authoriseUpgrade refuses an upgrade with no token, a forged one, or a protocol offer without a bearer entry', async () => {
  for (const headers of [
    {},
    { authorization: 'Bearer forged' },
    { 'sec-websocket-protocol': `${PUBSUB_SUBPROTOCOL}, bearer.forged` },
    { 'sec-websocket-protocol': PUBSUB_SUBPROTOCOL },
  ]) {
    assert.equal(await authoriseUpgrade(headers, stubVerify().verify), null, JSON.stringify(headers));
  }
});

test('PS-1: a token in the header or as a bearer.<token> subprotocol is admitted', async () => {
  const bearer = GOOD_TOKEN;
  assert.deepEqual(await authoriseUpgrade({ authorization: GOOD_AUTH }, stubVerify().verify), { oid: GOOD_OID });
  assert.deepEqual(
    await authoriseUpgrade(
      { 'sec-websocket-protocol': `${PUBSUB_SUBPROTOCOL}, bearer.${bearer}` },
      stubVerify().verify
    ),
    { oid: GOOD_OID }
  );
});

test('PS-1: credentialFromHeaders gives the Authorization value as sent, or the subprotocol token as a Bearer credential', () => {
  assert.equal(credentialFromHeaders({ authorization: 'Bearer abc' }), 'Bearer abc');
  assert.equal(
    credentialFromHeaders({ 'sec-websocket-protocol': `${PUBSUB_SUBPROTOCOL}, bearer.x.y.z` }),
    'Bearer x.y.z'
  );
  assert.equal(
    credentialFromHeaders({ 'sec-websocket-protocol': [PUBSUB_SUBPROTOCOL, 'bearer.x.y.z'] }),
    'Bearer x.y.z'
  );
  assert.equal(
    credentialFromHeaders({ authorization: 'Bearer abc', 'sec-websocket-protocol': 'bearer.other' }),
    'Bearer abc'
  );
  assert.equal(credentialFromHeaders({ 'sec-websocket-protocol': PUBSUB_SUBPROTOCOL }), undefined);
  assert.equal(credentialFromHeaders({}), undefined);
});

// ── subprotocol choice, per path ──

test('PS-2: /pubsub/ws is answered with the Web PubSub protocol and /sonos/ws with the Sonos one, never a bearer entry', () => {
  const offer = new Set([PUBSUB_SUBPROTOCOL, SONOS_SUBPROTOCOL, 'bearer.a.b.c']);
  assert.equal(selectSubprotocolForPath('/pubsub/ws', offer), PUBSUB_SUBPROTOCOL);
  assert.equal(selectSubprotocolForPath('/sonos/ws', offer), SONOS_SUBPROTOCOL);
  assert.equal(PUBSUB_WS_PROTOCOL, PUBSUB_SUBPROTOCOL);
});

test('PS-2: a path does not accept the other path’s protocol, nor a bearer entry alone', () => {
  assert.equal(selectSubprotocolForPath('/pubsub/ws', new Set([SONOS_SUBPROTOCOL, 'bearer.a.b.c'])), false);
  assert.equal(selectSubprotocolForPath('/sonos/ws', new Set([PUBSUB_SUBPROTOCOL, 'bearer.a.b.c'])), false);
  assert.equal(selectSubprotocolForPath('/pubsub/ws', new Set(['bearer.a.b.c'])), false);
  assert.equal(selectSubprotocolForPath('/pubsub/ws', new Set()), false);
  assert.equal(selectSubprotocolForPath('/elsewhere', new Set([PUBSUB_SUBPROTOCOL, SONOS_SUBPROTOCOL])), false);
});

test('PS-2: handleProtocols reads the path of the request and ignores its query string', () => {
  const offer = new Set([PUBSUB_SUBPROTOCOL, 'bearer.a.b.c']);
  assert.equal(handleProtocols(offer, { url: '/pubsub/ws?username=Alex%20B' }), PUBSUB_SUBPROTOCOL);
  assert.equal(handleProtocols(offer, { url: '/sonos/ws' }), false);
  assert.equal(handleProtocols(offer, {}), false);
});

// ── the access URL check ──

test('PS-3: validPubSubUrl accepts a wss URL on webpubsub.azure.com and nothing else', () => {
  assert.equal(validPubSubUrl(PUBSUB_URL), PUBSUB_URL);
  for (const bad of [
    undefined,
    null,
    42,
    '',
    'not a url',
    'ws://truetunes-wps.webpubsub.azure.com/client/hubs/office',
    'https://truetunes-wps.webpubsub.azure.com/client/hubs/office',
    'wss://evil.example/client/hubs/office',
    'wss://webpubsub.azure.com/client',
    'wss://evilwebpubsub.azure.com/client',
    'wss://truetunes-wps.webpubsub.azure.com.evil.example/client',
    'wss://evil.example#.webpubsub.azure.com',
    'wss://evil.example/.webpubsub.azure.com',
    'wss://user:pass@truetunes-wps.webpubsub.azure.com/client',
    'wss://user@truetunes-wps.webpubsub.azure.com/client',
    'wss://truetunes-wps.webpubsub.azure.com@evil.example/client',
  ]) {
    assert.equal(validPubSubUrl(bad), null, `Expected ${JSON.stringify(bad)} to be refused`);
  }
});

// ── the connect call and the upstream ──

test('PS-4: accepting a client POSTs /api/connect with the display name and the caller’s own Authorization, and nothing else', async () => {
  const r = rig();
  await r.connect('Zoë & Co/1?');
  assert.equal(r.functions.calls.length, 1, 'Expected exactly one connect call');
  const [call] = r.functions.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.origin + call.url.pathname, `${FUNCTIONS_URL}/api/connect`);
  assert.equal(call.url.search, `?username=${encodeURIComponent('Zoë & Co/1?')}`);
  assert.equal(call.url.searchParams.get('username'), 'Zoë & Co/1?');
  assert.deepEqual([...call.headers.keys()], ['authorization'], 'Expected no header but the caller’s Authorization');
  assert.equal(call.headers.get('authorization'), GOOD_AUTH);
  assert.equal(call.body.length, 0, 'Expected no body');
  assert.equal(r.sonos.calls.length, 0, 'Expected no Sonos session lookup or request');
});

test('PS-4: the credential forwarded is the one given, whichever way the caller sent it', async () => {
  const r = rig();
  r.start('A', 'Bearer from.a.subprotocol');
  await waitFor(() => r.functions.calls.length === 1, 'the connect call');
  assert.equal(r.functions.calls[0].headers.get('authorization'), 'Bearer from.a.subprotocol');
});

test('PS-4: the relay opens the access URL with the Web PubSub subprotocol and no extra arguments', async () => {
  const r = rig();
  const { up } = await r.connect();
  assert.equal(r.harness.upstreams.length, 1);
  assert.equal(up.url, PUBSUB_URL);
  assert.deepEqual(up.protocols, [PUBSUB_SUBPROTOCOL]);
  assert.equal(up.args.length, 2, 'Expected connectUpstream(url, protocols) only, so no Origin header');
});

test('PS-4: every client gets its own connect call and its own upstream', async () => {
  const r = rig();
  const a = await r.connect('A');
  const b = await r.connect('B');
  assert.equal(r.functions.calls.length, 2);
  assert.equal(r.harness.upstreams.length, 2);
  a.client.peerMessage('for-a');
  await settle(5);
  assert.deepEqual(a.up.sent, ['for-a']);
  assert.deepEqual(b.up.sent, []);
});

// ── frames ──

test('PS-5: frames go both ways verbatim and in order, text as text and binary as binary', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  const out: Frame[] = [
    JSON.stringify({ type: 'joinGroup', group: 'office' }),
    '',
    new Uint8Array([0, 255, 1]),
    JSON.stringify({ type: 'sendToGroup', group: 'office', data: { user: 'café ♪' }, dataType: 'json', noEcho: true }),
  ];
  const back: Frame[] = [
    JSON.stringify({ type: 'message', from: 'group', group: 'office', data: { type: 'queued' } }),
    new Uint8Array([9, 8]),
    'last',
  ];
  for (const f of out) client.peerMessage(f);
  for (const f of back) up.peerMessage(f);
  await settle(5);
  assert.deepEqual(up.sent, out);
  assert.deepEqual(client.sent, back);
  assert.ok(typeof up.sent[2] !== 'string' && typeof client.sent[1] !== 'string', 'Expected binary to stay binary');
  assert.deepEqual([up.violations, client.violations], [[], []]);
});

test('PS-5: the relay adds nothing of its own to the conversation', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  await settle(10);
  assert.deepEqual([client.sent, up.sent], [[], []]);
});

test('PS-5: frames sent before the connect call returns, and before the upstream opens, arrive in order once it does', async () => {
  const r = rig();
  const { client } = r.start();
  client.peerMessage('join-1'); // before /api/connect has answered
  client.peerMessage(new Uint8Array([7]));
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  const up = r.harness.upstreams[0];
  client.peerMessage('while-connecting');
  await settle(5);
  assert.deepEqual(up.sent, [], 'Expected nothing sent to a socket that is not open (a real one would throw)');
  up.open();
  await settle(5);
  client.peerMessage('after-open');
  await settle(5);
  assert.deepEqual(up.sent, ['join-1', new Uint8Array([7]), 'while-connecting', 'after-open']);
  assert.deepEqual([up.violations, client.violations], [[], []]);
});

test('PS-5: a client that floods the relay before the upstream opens is closed with 1008', async () => {
  const r = rig();
  const { client } = r.start();
  for (let i = 0; i < 1001; i++) client.peerMessage(`f${i}`);
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1008);
});

// ── closing ──

for (const code of [1000, 1001, 4001]) {
  test(`PS-6: when the client closes with ${code}, the upstream is closed with ${code}`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    client.peerClose(code, 'bye');
    await waitFor(() => up.closeCalls.length > 0, 'the upstream to be closed');
    assert.equal(up.closeCalls[0].code, code);
  });

  test(`PS-6: when the upstream closes with ${code}, the client is closed with ${code}`, async () => {
    const r = rig();
    const { client, up } = await r.connect();
    up.peerClose(code, 'bye');
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(client.closeCalls[0].code, code);
  });
}

for (const code of [1005, 1006, 1015]) {
  test(`PS-6: a ${code}, which cannot be sent, is closed on without a code, in both directions`, async () => {
    const a = await rig().connect();
    assert.doesNotThrow(() => a.up.peerClose(code));
    await waitFor(() => a.client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(a.client.closeCalls[0].code, undefined);
    const b = await rig().connect();
    assert.doesNotThrow(() => b.client.peerClose(code));
    await waitFor(() => b.up.closeCalls.length > 0, 'the upstream to be closed');
    assert.equal(b.up.closeCalls[0].code, undefined);
    assert.deepEqual([a.up.violations, a.client.violations, b.up.violations, b.client.violations], [[], [], [], []]);
  });
}

test('PS-6: late frames after either side has closed are dropped without error', async () => {
  const r = rig();
  const a = await r.connect();
  a.client.peerClose(1000);
  assert.doesNotThrow(() => a.up.peerMessage('late'));
  const b = await r.connect();
  b.up.peerClose(1000);
  assert.doesNotThrow(() => b.client.peerMessage('late'));
  await settle(10);
  assert.deepEqual([a.up.violations, a.client.violations, b.up.violations, b.client.violations], [[], [], [], []]);
});

test('PS-6: the client leaving while the connect call is in flight opens no upstream', async () => {
  const r = rig();
  const { client } = r.start();
  client.peerClose(1001);
  await settle(30);
  assert.equal(r.harness.upstreams.length, 0, 'Expected no upstream for a client that has gone');
});

test('PS-6: the client leaving while the upstream is connecting closes the half-open upstream', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  client.peerClose(1001);
  await settle(20);
  const [up] = r.harness.upstreams;
  assert.ok(up.closeCalls.length > 0 || up.state === 'closed');
  assert.deepEqual(up.violations, []);
});

// ── failures: always 1011 ──

const FAULTS: Array<{ name: string; fault?: ConnectFault; url?: unknown }> = [
  { name: '/api/connect answers 500', fault: 'status' },
  { name: '/api/connect cannot connect', fault: 'network' },
  { name: '/api/connect answers something that is not JSON', fault: 'not-json' },
  { name: '/api/connect answers JSON with no webPubSubUrl', fault: 'no-url' },
  { name: 'webPubSubUrl is not a string', url: 42 },
  { name: 'webPubSubUrl does not parse', url: 'not a url' },
  { name: 'webPubSubUrl is on another host', url: 'wss://evil.example/client/hubs/office?access_token=x' },
  { name: 'webPubSubUrl is ws, not wss', url: 'ws://truetunes-wps.webpubsub.azure.com/client/hubs/office' },
  { name: 'webPubSubUrl carries userinfo', url: 'wss://u:p@truetunes-wps.webpubsub.azure.com/client/hubs/office' },
];

for (const f of FAULTS) {
  test(`PS-7: when ${f.name}, the client is closed with 1011 and no upstream is opened`, async () => {
    const r = rig();
    if (f.fault) r.functions.fault = f.fault;
    if ('url' in f) r.functions.webPubSubUrl = f.url;
    const { client, accepted } = r.start();
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(client.closeCalls[0].code, 1011);
    assert.equal(r.harness.upstreams.length, 0);
    await accepted; // handled, not rejected
    assert.deepEqual(client.violations, []);
    assert.equal(r.sonos.calls.length, 0);
  });
}

test('PS-7: when the upstream errors and closes before it opened, the client is closed with 1011', async () => {
  const r = rig();
  const { client } = r.start();
  await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
  const [up] = r.harness.upstreams;
  up.peerError(new Error('Unexpected server response: 401'));
  up.peerClose(1006);
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011);
  assert.deepEqual([up.violations, client.violations], [[], []]);
});

test('PS-7: when the upstream only errors, or only closes before opening, the client is closed with 1011', async () => {
  for (const act of [
    (u: { peerError(e: Error): void }) => u.peerError(new Error('connect ECONNREFUSED')),
    (u: { peerClose(c: number): void }) => (u as { peerClose(c: number): void }).peerClose(1006),
  ]) {
    const r = rig();
    const { client } = r.start();
    await waitFor(() => r.harness.upstreams.length === 1, 'the upstream connection to be started');
    act(r.harness.upstreams[0] as never);
    await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
    assert.equal(client.closeCalls[0].code, 1011);
  }
});

test('PS-7: an error on the open upstream closes the client with 1011 and the upstream', async () => {
  const r = rig();
  const { client, up } = await r.connect();
  up.peerError(new Error('boom'));
  await waitFor(() => client.closeCalls.length > 0, 'the client to be closed');
  assert.equal(client.closeCalls[0].code, 1011);
});

// ── nothing secret reaches the client or the logs ──

test('PS-8: the access URL, its token, the caller’s token and the connect response are in no log and nothing sent to the client', async () => {
  const secrets = [PUBSUB_URL, PUBSUB_ACCESS_TOKEN, GOOD_TOKEN, 'truetunes-wps', 'webPubSubUrl'];

  // a working connection
  const ok = rig();
  const a = await ok.connect('Alex');
  a.up.peerMessage('hello');
  a.client.peerMessage('hi');
  await settle(5);
  // an upstream that fails with an error quoting the URL
  const bad = rig();
  const b = bad.start();
  await waitFor(() => bad.harness.upstreams.length === 1, 'the upstream connection');
  const [up] = bad.harness.upstreams;
  up.peerError(new Error(`Unexpected server response: 403 for ${up.url}`));
  up.peerClose(1006, up.url);
  await waitFor(() => b.client.closeCalls.length > 0, 'the client to be closed');
  // a connect call that fails with an error quoting the URL and the token
  const net = rig();
  net.functions.fault = 'network';
  const c = net.start();
  await waitFor(() => c.client.closeCalls.length > 0, 'the client to be closed');
  // a connect call that hands out a bad URL
  const foreign = rig();
  foreign.functions.webPubSubUrl = 'wss://evil.example/x?access_token=EVIL-TOKEN';
  const d = foreign.start();
  await waitFor(() => d.client.closeCalls.length > 0, 'the client to be closed');

  for (const [what, logs, client] of [
    ['a working connection', ok.logs, a.client],
    ['an upstream error', bad.logs, b.client],
    ['a connect failure', net.logs, c.client],
    ['a foreign URL', foreign.logs, d.client],
  ] as const) {
    const seen = visibleTo(logs, client);
    for (const secret of [...secrets, 'EVIL-TOKEN'])
      assert.ok(!seen.includes(secret), `Expected "${secret}" in nothing sent to the client or logged (${what})`);
  }
});

test('PS-8: a missing display name still asks for a connection, with an empty username', async () => {
  const r = rig();
  r.start('');
  await waitFor(() => r.functions.calls.length === 1, 'the connect call');
  assert.equal(r.functions.calls[0].url.search, '?username=');
});
