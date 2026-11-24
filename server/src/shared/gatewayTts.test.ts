// Run: npm test (from server/).
//
// Azure Speech through the Sonos gateway: server/src/shared/gatewayTts.ts, routed from
// createGatewayHandler in server/src/shared/gatewayHttp.ts (before the static-file fallthrough).
//
// Why it exists: the speakers fetch an announcement's audio themselves, cannot send a sign-in header, and
// each speaker in a group fetches separately. So the gateway makes the speech once and serves it from a
// short-lived, unguessable link.
//
// Contract (frozen):
//   POST /tts   Authorization: Bearer <Entra ID token>  (the handler's `verify` dep, as for /sonos/api and /fn)
//               Content-Type: application/json   Body { "text": string, "voice"?: string }
//                 text:  1..500 characters after trimming
//                 voice: optional; must match /^en-GB-[A-Za-z]+Neural$/ ; default "en-GB-SoniaNeural"
//     200 { "url": "https://<Host header>/tts/<id>.mp3" }   (id random, at least 128 bits, URL-safe)
//     401 { "error": "sign-in required" }  no/invalid token; Speech is NOT called
//     400 { "error": "Invalid text" }      missing, empty after trim, not a string, over 500; Speech NOT called
//     400 { "error": "Invalid voice" }     Speech NOT called
//     503 { "error": "speech-unavailable" } Speech failed (429, 5xx, network) or is not configured
//   GET /tts/<id>.mp3   no sign-in
//     200 audio/mpeg with Content-Length, body = the MP3 bytes Speech returned
//     404 unknown id, or an id older than 5 minutes
//   One POST makes exactly one Speech call; any number of GETs within 5 minutes serve the same bytes.
//
// New injected dependencies of createGatewayHandler (GatewayDeps in gatewayHttp.ts, already declared there):
//   speech?: (input: { text: string; voice: string }) => Promise<Uint8Array>   rejects on failure; absent = not configured
//   now?:    () => number                                                      milliseconds since the epoch; default Date.now
// The Speech client itself is `createSpeech({ fetch, env, now? })` in gatewayTts.ts; it returns a `speech`
// function, or undefined when SPEECH_TTS_URL, SPEECH_RESOURCE_ID, IDENTITY_ENDPOINT or IDENTITY_HEADER is missing.
//
// Requirements covered (the IDs are in the test names):
//   REQ-1  A spoken announcement plays in a natural British Azure voice.
//   REQ-2  The caller can choose the voice for one announcement.
//   REQ-3  A voice that is not a British neural voice is refused.
//   REQ-4  If Azure Speech cannot produce the audio, the announcement still plays in the Google voice
//          (this file: the gateway's half, the 503; the callers fall back in their own tests).
//   REQ-7  Only a signed-in person can have speech made.
//   REQ-8  One announcement uses the quota once, however many speakers are in the group.
//   REQ-9  The audio link needs no sign-in, cannot be guessed and stops working after 5 minutes.
//   REQ-10 Text over 500 characters is refused.
//   REQ-12 No Speech key is stored anywhere: the gateway signs in to Speech with its managed identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayHandler } from './gatewayHttp';
import { createSpeech, ttsLogPath } from './gatewayTts';
import {
  GOOD_TOKEN,
  IDENTITY_ENDPOINT,
  IDENTITY_HEADER,
  MP3_BYTES,
  SPEECH_ENV,
  SPEECH_RESOURCE_ID,
  SPEECH_TOKEN,
  SPEECH_TTS_URL,
  bodyBytes,
  bodyJson,
  bodyText,
  createFakeAzureSpeech,
  createFakeUpstream,
  createSpeechStub,
  createStubSession,
  gatewayRequest,
  header,
  reply,
  stubVerify,
  type VerifyStub,
} from './gatewayKit.testkit';

type Deps = Parameters<typeof createGatewayHandler>[0];

const T0 = 1_800_000_000_000;
const FIVE_MINUTES = 5 * 60 * 1000;
const jsonType = /application\/json/;
/** 128 bits is 22 base64url characters; the link is https://<host>/tts/<id>.mp3. */
const LINK = /^https:\/\/gateway\.example\/tts\/([A-Za-z0-9_-]{22,})\.mp3$/;

/** A gateway whose Speech is a stub, with a clock the test moves, and a fetch that records stray calls. */
function rig(
  opts: {
    speech?: Deps['speech'] | null;
    verify?: VerifyStub['verify'];
    stub?: ReturnType<typeof createSpeechStub>;
  } = {}
) {
  const stub = opts.stub ?? createSpeechStub();
  const upstream = createFakeUpstream();
  const verifyStub = stubVerify();
  const logs: string[] = [];
  const clock = { t: T0 };
  const handler = createGatewayHandler({
    session: createStubSession().session,
    fetch: upstream.fetch,
    verify: opts.verify ?? verifyStub.verify,
    log: (msg) => void logs.push(msg),
    now: () => clock.t,
    ...(opts.speech === null ? {} : { speech: opts.speech ?? stub.speech }),
  });
  return {
    handler,
    stub,
    upstream,
    verifyStub,
    logs,
    clock,
    send: (url: string, init?: Parameters<typeof gatewayRequest>[1]) => handler(gatewayRequest(url, init)),
    /** POST /tts with a JSON body. */
    say: (body: unknown, init: Parameters<typeof gatewayRequest>[1] = {}) =>
      handler(
        gatewayRequest('/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
          ...init,
        })
      ),
  };
}

type Rig = ReturnType<typeof rig>;

/** POST /tts and return the id of the link it hands back; fails the test when there is no link. */
async function mint(r: Rig, body: unknown = { text: 'Pizza is here' }): Promise<string> {
  const res = await r.say(body);
  assert.equal(res.status, 200, `Expected 200 from POST /tts, got ${res.status}: ${bodyText(res)}`);
  const url = (bodyJson(res) as { url?: string }).url ?? '';
  const id = LINK.exec(url)?.[1];
  assert.ok(id, `Expected a link like https://gateway.example/tts/<id>.mp3, got "${url}"`);
  return id;
}

function assertSpeechNotCalled(r: Rig, why: string): void {
  assert.equal(
    r.stub.calls.length,
    0,
    `Expected Speech not to be called ${why}, but it was called ${r.stub.calls.length} time(s)`
  );
}

// ── REQ-1 / REQ-2: the voice ─────────────────────────────────────────────────

// Given { text } with no voice, POST /tts asks Speech for "en-GB-SoniaNeural" and answers 200 { url }.
test('REQ-1: POST /tts with text only speaks it in en-GB-SoniaNeural and answers 200 { url }', async () => {
  const r = rig();
  const res = await r.say({ text: 'Pizza is here' });
  assert.equal(res.status, 200, 'Expected 200 for a signed-in caller with valid text');
  assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected a JSON response');
  const url = (bodyJson(res) as { url?: unknown }).url;
  assert.match(
    String(url),
    LINK,
    'Expected { url } to be https://<Host header>/tts/<id>.mp3 with a URL-safe id of at least 22 characters'
  );
  assert.deepEqual(
    r.stub.calls,
    [{ text: 'Pizza is here', voice: 'en-GB-SoniaNeural' }],
    'Expected one Speech call for the text in the default voice en-GB-SoniaNeural'
  );
});

// Given { text, voice: "en-GB-RyanNeural" }, Speech is asked for Ryan.
test('REQ-2: POST /tts with a voice passes that voice to Speech', async () => {
  const r = rig();
  const res = await r.say({ text: 'Hi', voice: 'en-GB-RyanNeural' });
  assert.equal(res.status, 200, 'Expected 200 for a British neural voice');
  assert.deepEqual(
    r.stub.calls,
    [{ text: 'Hi', voice: 'en-GB-RyanNeural' }],
    'Expected Speech to be asked for en-GB-RyanNeural'
  );
});

// The link is built from the Host header the speakers will reach the gateway by.
test('REQ-9: the link names the Host header the request came in on', async () => {
  const r = rig();
  const res = await r.say({ text: 'Hi' }, { headers: { host: 'truetunes.example' } });
  const url = (bodyJson(res) as { url?: string }).url ?? '';
  assert.match(
    url,
    /^https:\/\/truetunes\.example\/tts\/[A-Za-z0-9_-]{22,}\.mp3$/,
    `Expected the link on the Host header, got "${url}"`
  );
});

// ── REQ-3: only British neural voices ────────────────────────────────────────

for (const voice of [
  'fr-FR-DeniseNeural',
  'en-US-JennyNeural',
  'en-gb-SoniaNeural',
  'en-GB-Sonia',
  'en-GB-SoniaNeural2',
  'en-GB-Sonia1Neural',
  'en-GB-Sonia Neural',
  'en-GB-SoniaNeural<x>',
  "en-GB-SoniaNeural'/><voice name='x",
  'en-GB--Neural',
  '',
  123,
  ['en-GB-SoniaNeural'],
]) {
  // Given a voice that is not /^en-GB-[A-Za-z]+Neural$/, the answer is 400 { error: "Invalid voice" } and Speech is not called.
  test(`REQ-3: POST /tts refuses the voice ${JSON.stringify(voice)} with 400 Invalid voice and does not call Speech`, async () => {
    const r = rig();
    const res = await r.say({ text: 'Hi', voice });
    assert.equal(res.status, 400, 'Expected 400 for a voice that is not a British neural voice');
    assert.deepEqual(bodyJson(res), { error: 'Invalid voice' }, 'Expected exactly { error: "Invalid voice" }');
    assertSpeechNotCalled(r, 'for an invalid voice');
  });
}

// ── REQ-7: only a signed-in person can have speech made ──────────────────────

// Given no Authorization header, POST /tts answers the gateway's usual 401 and uses no quota.
test('REQ-7: POST /tts with no Authorization header gets 401 { error: "sign-in required" } and Speech is not called', async () => {
  const r = rig();
  const res = await r.say({ text: 'Hi' }, { auth: null });
  assert.equal(res.status, 401, 'Expected 401 for a request with no sign-in');
  assert.deepEqual(
    bodyJson(res),
    { error: 'sign-in required' },
    'Expected the same 401 body the gateway uses elsewhere'
  );
  assertSpeechNotCalled(r, 'without a sign-in (it would spend quota)');
});

test('REQ-7: POST /tts with a token that verify rejects gets 401, and verify saw the header as sent', async () => {
  const r = rig();
  const res = await r.say({ text: 'Hi' }, { auth: 'Bearer not-a-colleague' });
  assert.equal(res.status, 401, 'Expected 401 for an invalid token');
  assert.deepEqual(
    r.verifyStub.calls,
    ['Bearer not-a-colleague'],
    'Expected verify to be given the Authorization header as sent'
  );
  assertSpeechNotCalled(r, 'for an invalid token');
});

test('REQ-7: when verify throws, POST /tts is refused and Speech is not called', async () => {
  const r = rig({
    verify: async () => {
      throw new Error('JWKS fetch failed');
    },
  });
  const res = await r.say({ text: 'Hi' }).catch(() => null);
  assert.ok(
    res === null || res.status === 401 || res.status >= 500,
    `Expected a refusal (401, or an error the entry point turns into one), got ${res?.status}`
  );
  assertSpeechNotCalled(r, 'when the token could not be checked');
});

// Auth is checked before the body: an anonymous caller learns nothing about what is valid.
test('REQ-7: an unauthenticated POST /tts with invalid text still gets 401, not 400', async () => {
  const r = rig();
  const res = await r.say({ text: '' }, { auth: null });
  assert.equal(res.status, 401, 'Expected 401 before any body validation');
});

// ── REQ-10: text length and shape ────────────────────────────────────────────

test('REQ-10: POST /tts accepts text of exactly 500 characters', async () => {
  const r = rig();
  const res = await r.say({ text: 'a'.repeat(500) });
  assert.equal(res.status, 200, 'Expected 500 characters to be accepted');
  assert.equal(r.stub.calls.length, 1, 'Expected one Speech call');
});

test('REQ-10: the 500-character limit is counted after trimming', async () => {
  const r = rig();
  const res = await r.say({ text: `   ${'a'.repeat(500)}   ` });
  assert.equal(
    res.status,
    200,
    'Expected 500 characters plus surrounding spaces to be accepted: the limit applies after trimming'
  );
});

test('REQ-10: POST /tts refuses text of 501 characters with 400 Invalid text and does not call Speech', async () => {
  const r = rig();
  const res = await r.say({ text: 'a'.repeat(501) });
  assert.equal(res.status, 400, 'Expected 400 for 501 characters');
  assert.deepEqual(bodyJson(res), { error: 'Invalid text' }, 'Expected exactly { error: "Invalid text" }');
  assertSpeechNotCalled(r, 'for over-long text (it would spend quota)');
});

for (const [what, body] of [
  ['an empty string', { text: '' }],
  ['only spaces', { text: '   \t\n ' }],
  ['a missing text field', {}],
  ['a number', { text: 42 }],
  ['null', { text: null }],
  ['an object', { text: { say: 'hi' } }],
  ['a list', { text: ['hi'] }],
] as Array<[string, unknown]>) {
  // Given text that is missing, empty after trimming, or not a string, the answer is 400 { error: "Invalid text" }.
  test(`REQ-10: POST /tts refuses text that is ${what} with 400 Invalid text and does not call Speech`, async () => {
    const r = rig();
    const res = await r.say(body);
    assert.equal(res.status, 400, `Expected 400 for text that is ${what}`);
    assert.deepEqual(bodyJson(res), { error: 'Invalid text' }, 'Expected exactly { error: "Invalid text" }');
    assertSpeechNotCalled(r, `for text that is ${what}`);
  });
}

// ── REQ-4 (the gateway's half): Speech cannot produce the audio ──────────────

test('REQ-4: when Speech fails, POST /tts answers 503 { error: "speech-unavailable" }', async () => {
  const stub = createSpeechStub();
  stub.failWith = new Error('Speech answered 429');
  const r = rig({ stub });
  const res = await r.say({ text: 'Hi' });
  assert.equal(res.status, 503, 'Expected 503 when Speech fails (quota, 5xx, network)');
  assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected a JSON error');
  assert.deepEqual(
    bodyJson(res),
    { error: 'speech-unavailable' },
    'Expected exactly { error: "speech-unavailable" } and no detail of why'
  );
  assert.equal(stub.calls.length, 1, 'Expected the failed request to have tried Speech once, and not to retry it');
});

test('REQ-4: when Speech is not configured (no `speech` dependency), POST /tts answers 503 speech-unavailable', async () => {
  const r = rig({ speech: null });
  const res = await r.say({ text: 'Hi' });
  assert.equal(res.status, 503, 'Expected 503 when Speech is not configured');
  assert.deepEqual(bodyJson(res), { error: 'speech-unavailable' }, 'Expected exactly { error: "speech-unavailable" }');
});

// ── REQ-8 / REQ-9: one Speech call, one link, served many times ──────────────

// Given three speakers fetching the link, Speech is called once, not three times.
test('REQ-8: one POST /tts is one Speech call, however many times the link is fetched', async () => {
  const r = rig();
  const id = await mint(r);
  for (let speaker = 1; speaker <= 3; speaker++) {
    const res = await r.send(`/tts/${id}.mp3`, { auth: null });
    assert.equal(res.status, 200, `Expected speaker ${speaker} to be served`);
  }
  assert.equal(r.stub.calls.length, 1, `Expected one Speech call for one announcement, got ${r.stub.calls.length}`);
});

test('REQ-9: GET /tts/<id>.mp3 needs no sign-in and serves the MP3 bytes as audio/mpeg with Content-Length', async () => {
  const r = rig();
  const id = await mint(r);
  const res = await r.send(`/tts/${id}.mp3`, { auth: null, headers: { 'user-agent': 'Sonos/80.1' } });
  assert.equal(res.status, 200, 'Expected 200 for a speaker with no sign-in');
  assert.equal(header(res, 'content-type'), 'audio/mpeg', 'Expected Content-Type audio/mpeg');
  assert.equal(
    header(res, 'content-length'),
    String(MP3_BYTES.length),
    'Expected Content-Length to be the size of the MP3'
  );
  assert.ok(
    bodyBytes(res).equals(Buffer.from(MP3_BYTES)),
    'Expected the exact bytes Speech returned (not text-encoded)'
  );
  assert.deepEqual(
    r.verifyStub.calls.slice(1),
    [],
    'Expected the link to be served without asking verify about anyone'
  );
});

test('REQ-9: every GET of the link within 5 minutes serves the same bytes', async () => {
  const r = rig();
  const id = await mint(r);
  r.clock.t += FIVE_MINUTES - 1000;
  const first = await r.send(`/tts/${id}.mp3`, { auth: null });
  const second = await r.send(`/tts/${id}.mp3`, { auth: null });
  assert.equal(first.status, 200, 'Expected the link to work just inside 5 minutes');
  assert.ok(bodyBytes(first).equals(bodyBytes(second)), 'Expected the same bytes on a second fetch');
});

test('REQ-9: the link stops working after 5 minutes (404)', async () => {
  const r = rig();
  const id = await mint(r);
  assert.equal((await r.send(`/tts/${id}.mp3`, { auth: null })).status, 200, 'Expected the link to play now');
  r.clock.t += 6 * 60 * 1000;
  const res = await r.send(`/tts/${id}.mp3`, { auth: null });
  assert.equal(res.status, 404, 'Expected 404 for a link six minutes old');
  assert.equal(r.stub.calls.length, 1, 'Expected an expired link not to call Speech again');
});

test('REQ-9: GET of an id the gateway never issued is 404', async () => {
  const r = rig();
  await mint(r);
  for (const url of [
    '/tts/AAAAAAAAAAAAAAAAAAAAAA.mp3',
    '/tts/unknown.mp3',
    '/tts/.mp3',
    '/tts/..%2f..%2fhealthz.mp3',
  ]) {
    const res = await r.send(url, { auth: null });
    assert.equal(res.status, 404, `Expected 404 for ${url}`);
  }
});

test('REQ-9: each POST /tts gets its own unguessable id', async () => {
  const r = rig();
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) ids.add(await mint(r));
  assert.equal(ids.size, 20, 'Expected 20 different ids for 20 announcements');
  for (const id of ids) assert.ok(id.length >= 22, `Expected at least 128 bits (22 URL-safe characters), got "${id}"`);
});

// Two announcements do not share audio: a link serves its own announcement's bytes.
test('REQ-9: a link serves the bytes made for its own announcement', async () => {
  const first = Uint8Array.from([1, 2, 3]);
  const second = Uint8Array.from([9, 8, 7, 6]);
  let n = 0;
  const r = rig({ speech: async () => (++n === 1 ? first : second) });
  const a = await mint(r, { text: 'one' });
  const b = await mint(r, { text: 'two' });
  assert.ok(
    bodyBytes(await r.send(`/tts/${a}.mp3`, { auth: null })).equals(Buffer.from(first)),
    'Expected the first link to serve the first audio'
  );
  assert.ok(
    bodyBytes(await r.send(`/tts/${b}.mp3`, { auth: null })).equals(Buffer.from(second)),
    'Expected the second link to serve the second audio'
  );
});

// ── nothing sensitive in the logs ────────────────────────────────────────────

// The gateway logs only method, path and status: never the text, the token, or whatever Speech's error said.
test('REQ-12: the text, the Entra token and Speech’s own error never appear in a log line or a response', async () => {
  const stub = createSpeechStub();
  stub.failWith = new Error(
    `Speech said no to "my secret announcement" with ${SPEECH_TOKEN} and ${SPEECH_RESOURCE_ID}`
  );
  const r = rig({ stub });
  const failed = await r.say({ text: 'my secret announcement' });
  const ok = await rig().say({ text: 'my secret announcement' });
  assert.equal(failed.status, 503);
  const everything = `${r.logs.join('\n')}\n${JSON.stringify(failed.headers)}\n${bodyText(failed)}\n${bodyText(ok)}`;
  for (const secret of ['my secret announcement', SPEECH_TOKEN, SPEECH_RESOURCE_ID, GOOD_TOKEN]) {
    assert.ok(!everything.includes(secret), `Expected "${secret}" to appear in no log line and no response body`);
  }
});

// ── the Speech client: createSpeech({ fetch, env, now }) ─────────────────────

/** A Speech client over the fake identity and Speech endpoints, on a clock the test moves. */
function speechRig(env: Record<string, string | undefined> = SPEECH_ENV) {
  const clock = { t: T0 };
  const az = createFakeAzureSpeech(() => clock.t);
  const speak = createSpeech({ fetch: az.fetch, env, now: () => clock.t });
  assert.ok(speak, 'Expected createSpeech to give a Speech client when all four settings are present');
  return { az, speak, clock };
}

// REQ-12: the identity request, exactly as the App Service managed-identity endpoint expects it.
test('REQ-12: the Speech client signs in with the managed identity (no Speech key)', async () => {
  const { az, speak } = speechRig();
  await speak({ text: 'Hi', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 1, 'Expected one managed-identity token request');
  const call = az.identityCalls[0];
  assert.equal(call.method, 'GET', 'Expected the identity request to be a GET');
  assert.equal(
    call.url.origin + call.url.pathname,
    IDENTITY_ENDPOINT,
    'Expected the request to go to IDENTITY_ENDPOINT'
  );
  assert.equal(
    call.url.searchParams.get('resource'),
    'https://cognitiveservices.azure.com',
    'Expected resource=https://cognitiveservices.azure.com'
  );
  assert.equal(call.url.searchParams.get('api-version'), '2019-08-01', 'Expected api-version=2019-08-01');
  assert.equal(
    call.headers.get('x-identity-header'),
    IDENTITY_HEADER,
    'Expected X-IDENTITY-HEADER to carry IDENTITY_HEADER'
  );
});

// REQ-1: the Speech request itself.
test('REQ-1: the Speech request is POSTed to SPEECH_TTS_URL with the aad# bearer, SSML content type and MP3 output format', async () => {
  const { az, speak } = speechRig();
  const bytes = await speak({ text: 'Pizza is here', voice: 'en-GB-RyanNeural' });
  assert.equal(az.speechCalls.length, 1, 'Expected exactly one Speech call');
  const call = az.speechCalls[0];
  assert.equal(call.method, 'POST', 'Expected a POST');
  assert.equal(call.url.href, SPEECH_TTS_URL, 'Expected the request to go to SPEECH_TTS_URL');
  assert.equal(
    call.headers.get('authorization'),
    `Bearer aad#${SPEECH_RESOURCE_ID}#${SPEECH_TOKEN}`,
    'Expected Authorization: Bearer aad#<SPEECH_RESOURCE_ID>#<access_token>'
  );
  assert.equal(call.headers.get('content-type'), 'application/ssml+xml', 'Expected Content-Type application/ssml+xml');
  assert.equal(
    call.headers.get('x-microsoft-outputformat'),
    'audio-24khz-96kbitrate-mono-mp3',
    'Expected the 24kHz 96kbps mono MP3 output format'
  );
  assert.equal(call.headers.get('user-agent'), 'truetunes-gateway', 'Expected User-Agent truetunes-gateway');
  assert.equal(
    call.body,
    "<speak version='1.0' xml:lang='en-GB'><voice name='en-GB-RyanNeural'>Pizza is here</voice></speak>",
    'Expected the SSML <speak> with the chosen voice and the text'
  );
  assert.ok(Buffer.from(bytes).equals(Buffer.from(MP3_BYTES)), 'Expected the MP3 bytes Speech returned, untouched');
});

// Given text that looks like markup, it is escaped so it cannot add or close SSML elements.
test('REQ-1: the text is XML-escaped in the SSML (& < > " \')', async () => {
  const { az, speak } = speechRig();
  await speak({ text: `Tom & Jerry <3 "quoted" 'single' </voice><voice name='x'>`, voice: 'en-GB-SoniaNeural' });
  assert.equal(
    az.speechCalls[0].body,
    "<speak version='1.0' xml:lang='en-GB'><voice name='en-GB-SoniaNeural'>" +
      'Tom &amp; Jerry &lt;3 &quot;quoted&quot; &apos;single&apos; &lt;/voice&gt;&lt;voice name=&apos;x&apos;&gt;' +
      '</voice></speak>',
    'Expected & < > " and \' to become &amp; &lt; &gt; &quot; &apos;'
  );
});

test('REQ-1: the Speech client reuses its managed-identity token across calls', async () => {
  const { az, speak, clock } = speechRig();
  await speak({ text: 'One', voice: 'en-GB-SoniaNeural' });
  clock.t += 30 * 60 * 1000;
  await speak({ text: 'Two', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 1, 'Expected one token request for two calls inside the token’s lifetime');
  assert.equal(az.speechCalls.length, 2, 'Expected both announcements to reach Speech');
  assert.equal(
    az.speechCalls[1].headers.get('authorization'),
    `Bearer aad#${SPEECH_RESOURCE_ID}#${SPEECH_TOKEN}`,
    'Expected the second call to reuse the first token'
  );
});

test('REQ-1: the Speech client gets a new token once the old one has expired', async () => {
  const { az, speak, clock } = speechRig();
  await speak({ text: 'One', voice: 'en-GB-SoniaNeural' });
  clock.t += 2 * 3600 * 1000;
  await speak({ text: 'Two', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 2, 'Expected a second token request after expires_on has passed');
  assert.equal(
    az.speechCalls[1].headers.get('authorization'),
    `Bearer aad#${SPEECH_RESOURCE_ID}#${SPEECH_TOKEN}-2`,
    'Expected the second call to use the new token'
  );
});

for (const status of [400, 401, 403, 429, 500, 503]) {
  // Given Speech answers anything but 200, the client rejects (the route turns that into 503 speech-unavailable).
  test(`REQ-4: the Speech client rejects when Speech answers ${status}`, async () => {
    const { az, speak } = speechRig();
    az.speechReply = () => reply(status, 'quota spent', { 'content-type': 'text/plain' });
    await assert.rejects(
      speak({ text: 'Hi', voice: 'en-GB-SoniaNeural' }),
      `Expected a rejection for Speech status ${status}`
    );
  });
}

test('REQ-4: the Speech client rejects when the network to Speech fails', async () => {
  const clock = { t: T0 };
  const az = createFakeAzureSpeech(() => clock.t);
  const speak = createSpeech({
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input) === SPEECH_TTS_URL) throw new TypeError('fetch failed');
      return az.fetch(input, init);
    }) as typeof fetch,
    env: SPEECH_ENV,
    now: () => clock.t,
  });
  assert.ok(speak, 'Expected a Speech client');
  await assert.rejects(
    speak({ text: 'Hi', voice: 'en-GB-SoniaNeural' }),
    'Expected a rejection when Speech cannot be reached'
  );
});

for (const [what, fault] of [
  ['answers 500', () => reply(500, 'boom')],
  ['answers 200 without JSON', () => reply(200, '<html>no</html>', { 'content-type': 'text/html' })],
  [
    'answers 200 with no access_token',
    () => reply(200, JSON.stringify({ expires_on: '9999999999' }), { 'content-type': 'application/json' }),
  ],
] as Array<[string, () => Response]>) {
  test(`REQ-12: the Speech client rejects, and calls Speech with no token, when the identity endpoint ${what}`, async () => {
    const { az, speak } = speechRig();
    az.identityReply = fault;
    await assert.rejects(
      speak({ text: 'Hi', voice: 'en-GB-SoniaNeural' }),
      'Expected a rejection when no token could be had'
    );
    assert.equal(az.speechCalls.length, 0, 'Expected no Speech call without a token');
  });
}

// The error may end up in a log: it must not carry the token, the resource id, the identity header or the text.
test('REQ-12: the Speech client’s errors never contain the token, the resource id, the identity header or the text', async () => {
  const { az, speak } = speechRig();
  az.speechReply = () => reply(429, `quota spent for ${SPEECH_TOKEN}`);
  const err = await speak({ text: 'my secret announcement', voice: 'en-GB-SoniaNeural' }).then(
    () => null,
    (e: unknown) => e
  );
  assert.ok(err instanceof Error, 'Expected an Error for a 429 from Speech');
  const text = `${err.message}\n${err.stack ?? ''}\n${String((err as { cause?: unknown }).cause ?? '')}`;
  for (const secret of [SPEECH_TOKEN, SPEECH_RESOURCE_ID, IDENTITY_HEADER, 'my secret announcement']) {
    assert.ok(!text.includes(secret), `Expected the error not to contain "${secret}"`);
  }
});

for (const missing of ['SPEECH_TTS_URL', 'SPEECH_RESOURCE_ID', 'IDENTITY_ENDPOINT', 'IDENTITY_HEADER']) {
  // Given any of the four settings is missing (or empty), Speech is "not configured": no client, and no request is made.
  test(`REQ-12: createSpeech gives no Speech client when ${missing} is missing`, () => {
    const az = createFakeAzureSpeech();
    for (const value of [undefined, '']) {
      const speak = createSpeech({ fetch: az.fetch, env: { ...SPEECH_ENV, [missing]: value } });
      assert.equal(
        speak,
        undefined,
        `Expected Speech to count as not configured with ${missing}=${JSON.stringify(value)}`
      );
    }
    assert.equal(
      az.identityCalls.length + az.speechCalls.length,
      0,
      'Expected no request while Speech is not configured'
    );
  });
}

test('REQ-12: createSpeech gives no Speech client with an empty environment', () => {
  assert.equal(createSpeech({ fetch: createFakeAzureSpeech().fetch, env: {} }), undefined, 'Expected not configured');
});

// ── decisions the contract above leaves open ─────────────────────────────────

for (const [what, body] of [
  ['not JSON', 'Pizza is here'],
  ['empty', ''],
  ['JSON null', 'null'],
  ['a JSON string', '"Pizza is here"'],
  ['a JSON list', '[{"text":"Hi"}]'],
] as Array<[string, string]>) {
  test(`POST /tts with a body that is ${what} gets 400 Invalid text and does not call Speech`, async () => {
    const r = rig();
    const res = await r.say(body);
    assert.equal(res.status, 400, `Expected 400 for a body that is ${what}`);
    assert.deepEqual(bodyJson(res), { error: 'Invalid text' }, 'Expected exactly { error: "Invalid text" }');
    assertSpeechNotCalled(r, `for a body that is ${what}`);
  });
}

test('the text sent to Speech is the trimmed text', async () => {
  const r = rig();
  await r.say({ text: '  Pizza is here \n' });
  assert.deepEqual(
    r.stub.calls,
    [{ text: 'Pizza is here', voice: 'en-GB-SoniaNeural' }],
    'Expected the surrounding space to be dropped'
  );
});

test('any other method or path under /tts is 404, signed in or not, and Speech is not called', async () => {
  const r = rig();
  const id = await mint(r);
  for (const [method, url] of [
    ['GET', '/tts'],
    ['PUT', '/tts'],
    ['DELETE', '/tts'],
    ['POST', '/tts/'],
    ['POST', '/tts/extra'],
    ['POST', `/tts/${id}.mp3`],
    ['DELETE', `/tts/${id}.mp3`],
    ['GET', `/tts/${id}`],
    ['GET', `/tts/${id}.mp3/more`],
    ['GET', `/tts/${id}.wav`],
  ]) {
    for (const auth of [undefined, null]) {
      const res = await r.send(url, { method, ...(auth === null ? { auth: null } : {}) });
      assert.equal(res.status, 404, `Expected 404 for ${method} ${url}`);
    }
  }
  assert.equal(r.stub.calls.length, 1, 'Expected only the one announcement to have reached Speech');
  assert.equal(
    (await r.send(`/tts/${id}.mp3`, { auth: null })).status,
    200,
    'Expected the link itself to be untouched by all that'
  );
});

// A player may ask about the file before it fetches it.
test('REQ-9: HEAD on a link answers 200 with the audio headers and no audio, without sign-in', async () => {
  const r = rig();
  const id = await mint(r);
  const res = await r.send(`/tts/${id}.mp3`, { method: 'HEAD', auth: null });
  assert.equal(res.status, 200, 'Expected 200 for HEAD on a live link');
  assert.equal(res.headers['content-type'], 'audio/mpeg');
  assert.equal(res.headers['content-length'], String(MP3_BYTES.length));
  assert.equal(res.body.length, 0, 'Expected no audio in the answer to HEAD');
  assert.equal(r.stub.calls.length, 1, 'Expected HEAD not to reach Speech');
});

test('/tts is never answered with a static file or the app shell', async () => {
  const shell = { body: Buffer.from('<title>True Tunes</title>'), type: 'text/html' };
  const handler = createGatewayHandler({
    session: createStubSession().session,
    fetch: createFakeUpstream().fetch,
    verify: stubVerify().verify,
    staticFile: () => shell,
  });
  for (const url of ['/tts', '/tts/', '/tts/index.html', '/tts/unknown.mp3', '/tts/a/b']) {
    const res = await handler(gatewayRequest(url, { auth: null }));
    assert.equal(res.status, 404, `Expected 404 for GET ${url}`);
    assert.ok(!bodyText(res).includes('True Tunes'), `Expected no app shell for GET ${url}`);
  }
});

test('with no Host header there is no link to give: 503 speech-unavailable, and Speech is not called', async () => {
  const r = rig();
  const res = await r.say({ text: 'Hi' }, { headers: { 'content-type': 'application/json', host: undefined } });
  assert.equal(res.status, 503);
  assert.deepEqual(bodyJson(res), { error: 'speech-unavailable' });
  assertSpeechNotCalled(r, 'when the link could not be built');
});

test('the gateway holds at most 50 links: the 51st announcement drops the oldest', async () => {
  const r = rig();
  const ids: string[] = [];
  for (let i = 0; i < 51; i++) ids.push(await mint(r, { text: `Announcement ${i}` }));
  assert.equal(
    (await r.send(`/tts/${ids[0]}.mp3`, { auth: null })).status,
    404,
    'Expected the oldest link to have been dropped'
  );
  for (const id of [ids[1], ids[50]]) {
    assert.equal((await r.send(`/tts/${id}.mp3`, { auth: null })).status, 200, 'Expected the 50 newest links to play');
  }
});

test('expired links are dropped when a new one is made, so they do not count towards the 50', async () => {
  const r = rig();
  for (let i = 0; i < 50; i++) await mint(r);
  r.clock.t += FIVE_MINUTES;
  const first = await mint(r);
  for (let i = 0; i < 49; i++) await mint(r);
  assert.equal(
    (await r.send(`/tts/${first}.mp3`, { auth: null })).status,
    200,
    'Expected 50 fresh links to fit once the expired ones had gone'
  );
});

test('a link is gone at exactly 5 minutes', async () => {
  const r = rig();
  const id = await mint(r);
  r.clock.t += FIVE_MINUTES;
  assert.equal((await r.send(`/tts/${id}.mp3`, { auth: null })).status, 404);
});

test('a Speech failure is logged in one fixed line, with a status only when the Speech client reported it', async () => {
  const { az, speak } = speechRig();
  az.speechReply = () => reply(429, 'quota spent');
  const r = rig({ speech: speak });
  assert.equal((await r.say({ text: 'Hi' })).status, 503);
  assert.deepEqual(r.logs, ['[gateway] Speech gave no audio: Speech answered 429']);
});

test('the request log shows /tts/:id for a link, never its id', () => {
  assert.equal(ttsLogPath('/tts/AbCdEfGhIjKlMnOpQrStUv.mp3'), '/tts/:id');
  assert.equal(ttsLogPath('/tts/anything/else'), '/tts/:id');
  for (const path of ['/tts', '/healthz', '/sonos/api/mfe', '/ttsx/a.mp3']) assert.equal(ttsLogPath(path), path);
});

// The managed-identity token is renewed 5 minutes before expires_on (the fake's tokens last an hour).
test('the Speech client keeps its token until 5 minutes before it expires, then gets a new one', async () => {
  const { az, speak, clock } = speechRig();
  await speak({ text: 'One', voice: 'en-GB-SoniaNeural' });
  clock.t += 54 * 60 * 1000;
  await speak({ text: 'Two', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 1, 'Expected the token to be reused 6 minutes before it expires');
  clock.t += 2 * 60 * 1000;
  await speak({ text: 'Three', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 2, 'Expected a new token 4 minutes before the old one expires');
});

test('a token Speech refuses (401) is not used again', async () => {
  const { az, speak } = speechRig();
  az.speechReply = () => reply(401, 'no');
  await assert.rejects(speak({ text: 'One', voice: 'en-GB-SoniaNeural' }));
  az.speechReply = () => reply(200, MP3_BYTES, { 'content-type': 'audio/mpeg' });
  await speak({ text: 'Two', voice: 'en-GB-SoniaNeural' });
  assert.equal(az.identityCalls.length, 2, 'Expected a new token after Speech refused the first');
});

test('the Speech client rejects when Speech answers 200 with no audio', async () => {
  const { az, speak } = speechRig();
  az.speechReply = () => reply(200, new Uint8Array(0), { 'content-type': 'audio/mpeg' });
  await assert.rejects(speak({ text: 'Hi', voice: 'en-GB-SoniaNeural' }), /no audio/);
});
