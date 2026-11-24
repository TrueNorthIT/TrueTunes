// Spoken announcements through the gateway. The speakers fetch an announcement's audio themselves, cannot send
// a sign-in header, and each speaker in a group fetches separately; so the gateway makes the speech once
// (Azure Speech) and serves it from a short-lived, unguessable link. gatewayHttp.ts routes to this.
//
//   POST /tts            for a signed-in caller: { text, voice? } → 200 { url: "https://<Host>/tts/<id>.mp3" }
//                        401 sign-in required, 400 Invalid text / Invalid voice, 503 speech-unavailable
//   GET /tts/<id>.mp3    no sign-in: the MP3 for 5 minutes, then 404 (HEAD: the same headers, no audio)
//
// Like the rest of the gateway these are plain functions over plain objects. The Speech client signs in with
// the App Service managed identity: there is no Speech key anywhere.
//
// Nothing secret is logged or returned: not the text, the tokens, a link id, or what Speech said. A failure is
// reported as a SpeechError, whose message is a fixed phrase and a status only.
import { randomBytes } from 'node:crypto';
import type { GatewayRequest, GatewayResponse } from './gatewayHttp';
import { callerOf, type WebRouteKit } from './gatewayWeb';

/** Makes the MP3 for one announcement. Rejects when Speech cannot (the route answers 503). */
export type Speak = (input: { text: string; voice: string }) => Promise<Uint8Array>;

export interface SpeechOptions {
  fetch: typeof fetch;
  /** SPEECH_TTS_URL, SPEECH_RESOURCE_ID, IDENTITY_ENDPOINT, IDENTITY_HEADER. */
  env: Record<string, string | undefined>;
  /** Milliseconds since the epoch; defaults to Date.now. Decides when the managed-identity token has expired. */
  now?: () => number;
}

export const DEFAULT_VOICE = 'en-GB-SoniaNeural';
/** British neural voices only. Also what keeps a voice from carrying markup into the SSML. */
const VOICE = /^en-GB-[A-Za-z]+Neural$/;
export const MAX_TEXT_CHARS = 500;
/** How long a link plays for: long enough for every speaker in a group to fetch it, and little longer. */
export const LINK_TTL_MS = 5 * 60 * 1000;
export const MAX_LINKS = 50;
/** How long the gateway waits for the identity endpoint or Speech before it gives up (503 speech-unavailable). */
export const SPEECH_TIMEOUT_MS = 15_000;
/** The managed-identity token is replaced this long before it expires. */
const TOKEN_RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Why Speech gave no audio. The message is built here from fixed phrases and statuses, so it is safe to log. */
export class SpeechError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechError';
  }
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/** The Speech client, or undefined when any of the four settings is missing ("not configured"). */
export function createSpeech({ fetch, env, now = Date.now }: SpeechOptions): Speak | undefined {
  const ttsUrl = env['SPEECH_TTS_URL'];
  const resourceId = env['SPEECH_RESOURCE_ID'];
  const identityEndpoint = env['IDENTITY_ENDPOINT'];
  const identityHeader = env['IDENTITY_HEADER'];
  if (!ttsUrl || !resourceId || !identityEndpoint || !identityHeader) return undefined;

  let token: { value: string; renewAt: number } | undefined;

  /** The gateway's own Entra token for Speech, from the App Service managed-identity endpoint. */
  const accessToken = async (): Promise<string> => {
    if (token && now() < token.renewAt) return token.value;
    let res: Response;
    try {
      res = await fetch(`${identityEndpoint}?resource=https://cognitiveservices.azure.com&api-version=2019-08-01`, {
        headers: { 'X-IDENTITY-HEADER': identityHeader },
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch {
      // The cause is dropped, here and below: a fetch error can quote the request, identity header included.
      throw new SpeechError('the managed identity could not be reached');
    }
    if (!res.ok) throw new SpeechError(`the managed identity answered ${res.status}`);
    let body: { access_token?: unknown; expires_on?: unknown };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new SpeechError('the managed identity did not answer in JSON');
    }
    if (typeof body?.access_token !== 'string' || !body.access_token) {
      throw new SpeechError('the managed identity gave no token');
    }
    // expires_on is Unix seconds, as a string. One that cannot be read is not kept: the next call asks again.
    const expiresAt = Number(body.expires_on) * 1000;
    token = Number.isFinite(expiresAt)
      ? { value: body.access_token, renewAt: expiresAt - TOKEN_RENEW_BEFORE_MS }
      : undefined;
    return body.access_token;
  };

  return async function speak({ text, voice }) {
    const bearer = await accessToken();
    let res: Response;
    try {
      res = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          // Entra sign-in to Speech: the token alone is not enough, it goes with the account's resource id.
          Authorization: `Bearer aad#${resourceId}#${bearer}`,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
          'User-Agent': 'truetunes-gateway',
        },
        body: `<speak version='1.0' xml:lang='en-GB'><voice name='${xml(voice)}'>${xml(text)}</voice></speak>`,
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch {
      throw new SpeechError('Speech could not be reached');
    }
    if (res.status === 401) token = undefined; // the token was refused: the next announcement asks for a new one
    // Speech's own answer is not read: it may quote the request.
    if (res.status !== 200) throw new SpeechError(`Speech answered ${res.status}`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      throw new SpeechError('the Speech response broke off');
    }
    if (!bytes.length) throw new SpeechError('Speech answered with no audio');
    return bytes;
  };
}

/** The path to log for a request: a link's id is a capability while it lasts, so it never reaches a log line. */
export const ttsLogPath = (path: string): string => (path.startsWith('/tts/') ? '/tts/:id' : path);

/**
 * `/tts` and everything under it. The links live here, in the closure of the one handler that made them.
 * `speech` absent means Speech is not configured.
 */
export function createTtsRoute(
  kit: WebRouteKit,
  speech: Speak | undefined,
  now: () => number
): (req: GatewayRequest, path: string) => Promise<GatewayResponse> {
  // ponytail: in-memory on a single gateway instance, so a link works only on the instance that made it and
  // none survives a restart. A shared store (blob or Redis) is the upgrade if the gateway ever scales out.
  // Bounded: at most MAX_LINKS announcements (12 KB a second of speech each) are held at once.
  const links = new Map<string, { bytes: Uint8Array; expiresAt: number }>();

  function keep(bytes: Uint8Array): string {
    const t = now();
    for (const [id, link] of links) if (link.expiresAt <= t) links.delete(id);
    // A Map lists its keys in the order they were added, so the first is the oldest.
    while (links.size >= MAX_LINKS) links.delete(links.keys().next().value as string);
    // 128 random bits: the id is all that stands between a stranger and the audio.
    const id = randomBytes(16).toString('base64url');
    links.set(id, { bytes, expiresAt: t + LINK_TTL_MS });
    return id;
  }

  return async function ttsRoute(req, path) {
    const notFound = kit.json(404, { error: 'not found' });

    if (path !== '/tts') {
      // The speakers' fetch: no sign-in, nothing checked but the id. HEAD is answered too, with the same
      // headers and no audio, in case a player asks about the file before it fetches it.
      const head = req.method === 'HEAD';
      const id = req.method === 'GET' || head ? /^\/tts\/([A-Za-z0-9_-]+)\.mp3$/.exec(path)?.[1] : undefined;
      const link = id ? links.get(id) : undefined;
      if (!link || link.expiresAt <= now()) return notFound;
      return {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(link.bytes.length),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
        body: head ? '' : link.bytes,
      };
    }
    if (req.method !== 'POST') return notFound;

    // Sign-in first: an anonymous caller spends no quota and learns nothing about what is valid.
    if (!(await callerOf(req, kit))) return kit.json(401, { error: 'sign-in required' });

    let input: { text?: unknown; voice?: unknown } | null = null;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(req.body ?? []).toString('utf8'));
      if (parsed && typeof parsed === 'object') input = parsed;
    } catch {
      /* not JSON, or no body: refused below as having no text */
    }
    const text = typeof input?.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > MAX_TEXT_CHARS) return kit.json(400, { error: 'Invalid text' });
    const voice = input?.voice === undefined ? DEFAULT_VOICE : input.voice;
    if (typeof voice !== 'string' || !VOICE.test(voice)) return kit.json(400, { error: 'Invalid voice' });

    const unavailable = kit.json(503, { error: 'speech-unavailable' });
    // The link is on the host the caller reached the gateway by, which is the one the speakers can reach too.
    const host = req.headers['host'];
    if (!speech || typeof host !== 'string' || !host) return unavailable;

    let bytes: Uint8Array;
    try {
      bytes = await speech({ text, voice });
    } catch (err) {
      // Only a SpeechError's message is logged (see above); anything else might quote the text or a token.
      kit.log(`[gateway] Speech gave no audio${err instanceof SpeechError ? `: ${err.message}` : ''}`);
      return unavailable;
    }
    return kit.json(200, { url: `https://${host}/tts/${keep(bytes)}.mp3` });
  };
}
