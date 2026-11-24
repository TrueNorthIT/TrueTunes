// Which audio URL the chat "Announce" tool hands the speakers: Azure Speech through the gateway, else Google.
// No imports, so `npm test` can run it as it stands. The desktop app's copy is speechStreamUrl in
// src/sonos-transport.ts; the gateway's side is server/src/shared/gatewayTts.ts.

export type SpeechUrl = { streamUrl: string } | { error: string };

/** The fallback voice: the unofficial Google Translate TTS the desktop app falls back to as well. */
const googleTtsUrl = (text: string) =>
  `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(text)}`;

/**
 * The gateway's link to `text` spoken in its default voice (POST /tts), or the Google URL when the gateway cannot
 * give one. A 400 is the gateway refusing the text: that comes back as `{ error }`, and nothing should play.
 */
export async function speechUrl(input: {
  text: string;
  /** The caller's Entra ID token, sent to the gateway as a Bearer token. Without one the gateway is not asked. */
  idToken: string | undefined;
  /** The gateway's origin, e.g. https://truetunes.tnapps.co.uk. */
  gatewayUrl: string;
  fetch?: typeof fetch;
}): Promise<SpeechUrl> {
  const { text, idToken, gatewayUrl, fetch: doFetch = fetch } = input;
  if (idToken) {
    try {
      const res = await doFetch(`${gatewayUrl}/tts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
      if (res.status === 400) return { error: typeof body?.error === 'string' ? body.error : 'Invalid announcement' };
      if (res.ok && typeof body?.url === 'string' && body.url.startsWith('https://')) return { streamUrl: body.url };
    } catch {
      /* the gateway could not be reached: the Google voice */
    }
  }
  return { streamUrl: googleTtsUrl(text) };
}
