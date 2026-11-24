// Run: npm --prefix mcp test
//
// speechUrl in mcp/lib/speech.ts: which audio URL the chat "Announce" tool (mcp/lib/tools.ts, 'announce') hands
// the speakers. Azure Speech through the gateway (POST <gatewayUrl>/tts, contract in
// server/src/shared/gatewayTts.test.ts) when it can, the Google Translate URL as today when it cannot.
//
// Expected signature (the developer builds to this):
//   speechUrl({ text, idToken, gatewayUrl, fetch? }) => Promise<{ streamUrl: string } | { error: string }>
//     text        what to say
//     idToken     the caller's Entra ID token, sent as `Authorization: Bearer <idToken>`
//     gatewayUrl  the gateway's origin, e.g. https://truetunes.tnapps.co.uk (no trailing slash)
//     fetch       defaults to the global fetch; tests give a fake, so nothing here touches a network
//   { streamUrl }  the link the gateway minted, or the Google URL on any failure except a 400
//   { error }      the gateway's own error string when it answered 400 (the tool reports it, plays nothing)
//
// Requirements covered (the IDs are in the test names):
//   REQ-6  The chat "Announce" tool uses the new voice, default voice only.
//   REQ-4  If Azure Speech cannot produce the audio, the announcement still plays in the Google voice.
//   REQ-10 Text over 500 characters is refused (the gateway's 400 comes back as { error }).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechUrl } from './speech.ts';

const GATEWAY = 'https://gw.test';
const MINTED = 'https://gw.test/tts/AbCdEfGhIjKlMnOpQrStUv.mp3';
const GOOGLE = (q: string) => `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${q}`;

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

/** A fetch that records its calls and answers with `respond`. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body == null ? '' : String(init.body),
    });
    return respond();
  }) as typeof fetch;
  return { calls, fetch: fetchImpl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Given the gateway mints a link, the speakers are given that link: one POST /tts with the caller's token and
// { text } only (no voice: the default voice is the gateway's).
test('REQ-6: the announcement uses the gateway’s minted link, asked for with the default voice only', async () => {
  const f = fakeFetch(() => json({ url: MINTED }));
  const res = await speechUrl({ text: 'Pizza is here', idToken: 'test-token', gatewayUrl: GATEWAY, fetch: f.fetch });
  assert.deepEqual(res, { streamUrl: MINTED }, 'Expected the minted gateway link as the stream URL');
  assert.equal(f.calls.length, 1, 'Expected exactly one request, to the gateway');
  const [call] = f.calls;
  assert.equal(call.url, 'https://gw.test/tts', 'Expected POST <gatewayUrl>/tts');
  assert.equal(call.method, 'POST', 'Expected a POST');
  assert.equal(
    call.headers.get('authorization'),
    'Bearer test-token',
    'Expected the caller’s Entra ID token as a Bearer token'
  );
  assert.match(call.headers.get('content-type') ?? '', /application\/json/, 'Expected a JSON body');
  assert.deepEqual(
    JSON.parse(call.body),
    { text: 'Pizza is here' },
    'Expected { text } only: the chat tool offers no voice choice'
  );
});

// REQ-10: the gateway refuses over-long text with 400 { error }; the tool must report that and play nothing.
test('REQ-10: a gateway 400 comes back as { error } with the gateway’s own message, and no Google URL', async () => {
  const f = fakeFetch(() => json({ error: 'Invalid text' }, 400));
  const res = await speechUrl({ text: 'a'.repeat(501), idToken: 'test-token', gatewayUrl: GATEWAY, fetch: f.fetch });
  assert.deepEqual(
    res,
    { error: 'Invalid text' },
    'Expected { error: "Invalid text" } so nothing is sent to the speakers'
  );
});

// REQ-4: every other failure plays today's Google voice.
for (const [what, respond] of [
  ['a 503 speech-unavailable', () => json({ error: 'speech-unavailable' }, 503)],
  ['a 429', () => json({ error: 'quota' }, 429)],
  ['a 500', () => new Response('boom', { status: 500 })],
  ['a 401', () => json({ error: 'sign-in required' }, 401)],
  ['a 200 that is not JSON', () => new Response('<html>oops</html>', { status: 200 })],
  [
    'a network error',
    (): Response => {
      throw new TypeError('fetch failed');
    },
  ],
] as Array<[string, () => Response]>) {
  test(`REQ-4: ${what} from the gateway falls back to the exact Google Translate URL`, async () => {
    const f = fakeFetch(respond);
    const res = await speechUrl({ text: 'Pizza & chips', idToken: 'test-token', gatewayUrl: GATEWAY, fetch: f.fetch });
    assert.deepEqual(
      res,
      { streamUrl: GOOGLE('Pizza%20%26%20chips') },
      'Expected the Google Translate URL built as before (en-GB, client=tw-ob, URL-encoded text)'
    );
    assert.equal(f.calls.length, 1, 'Expected the gateway to have been tried once before falling back');
  });
}

// A 200 that carries no usable link is a failure like any other.
for (const [what, body] of [
  ['no url', {}],
  ['a url that is not https', { url: 'http://gw.test/tts/x.mp3' }],
  ['a url that is not a string', { url: 42 }],
] as Array<[string, unknown]>) {
  test(`REQ-4: a 200 with ${what} falls back to the Google Translate URL`, async () => {
    const f = fakeFetch(() => json(body));
    const res = await speechUrl({ text: 'Hi', idToken: 'test-token', gatewayUrl: GATEWAY, fetch: f.fetch });
    assert.deepEqual(res, { streamUrl: GOOGLE('Hi') });
  });
}

test('a 400 the gateway did not explain is still an error, never a URL', async () => {
  const f = fakeFetch(() => new Response('bad', { status: 400 }));
  const res = await speechUrl({ text: 'Hi', idToken: 'test-token', gatewayUrl: GATEWAY, fetch: f.fetch });
  assert.deepEqual(res, { error: 'Invalid announcement' });
});

// identity.ts can come back with no token (the sign-in has lapsed): the gateway would only answer 401.
test('REQ-4: with no Entra ID token the gateway is not asked, and the Google voice plays', async () => {
  const f = fakeFetch(() => json({ url: MINTED }));
  const res = await speechUrl({ text: 'Hi', idToken: undefined, gatewayUrl: GATEWAY, fetch: f.fetch });
  assert.deepEqual(res, { streamUrl: GOOGLE('Hi') });
  assert.equal(f.calls.length, 0, 'Expected no request without a token');
});
