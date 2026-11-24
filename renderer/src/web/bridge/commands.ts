// Playback and volume commands over the relay: the WS handlers of src/ipc/sonos.ts, frame for frame.

import type { Gateway } from './gateway';
import type { SonosConfig } from './sonosHttp';
import type { SonosSocket } from './sonosSocket';

const NOT_CONNECTED = { error: 'WS not connected' };

/** The fallback voice: unofficial Google Translate TTS (no key, ~200 chars, could vanish). */
const googleTtsUrl = (text: string) =>
  `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(text)}`;

/**
 * The audio URL that speaks `text`: the gateway's Azure Speech link (POST /tts), or the Google one when the
 * gateway cannot give a link. A 400 is the gateway refusing the text or the voice: an error, and nothing plays.
 * speechStreamUrl in src/sonos-transport.ts, through the browser's gateway door.
 */
async function speechStreamUrl(
  gateway: Gateway,
  text: string,
  voice: string | undefined
): Promise<{ streamUrl: string } | { error: string }> {
  try {
    const res = await gateway.fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    const body = res ? ((await res.json().catch(() => null)) as { url?: unknown; error?: unknown } | null) : null;
    if (res?.status === 400) return { error: typeof body?.error === 'string' ? body.error : 'Invalid announcement' };
    if (res?.ok && typeof body?.url === 'string' && body.url.startsWith('https://')) return { streamUrl: body.url };
  } catch {
    /* the gateway could not be reached: the Google voice */
  }
  return { streamUrl: googleTtsUrl(text) };
}

export function createCommands(socket: SonosSocket, config: SonosConfig, gateway: Gateway) {
  /** A command to the active group, or { error: 'WS not connected' } while the socket is down. */
  const playback =
    (command: string, payload: () => Record<string, unknown> = () => ({})) =>
    (): Promise<unknown> => {
      const groupId = config.groupId;
      if (!socket.isOpen()) return Promise.resolve(NOT_CONNECTED);
      return socket.send({ namespace: 'playback', groupId, command }, payload());
    };
  const transport = { allowTvPauseRestore: true, deviceFeedback: 'NONE' };

  return {
    play: playback('play', () => transport),
    pause: playback('pause', () => transport),
    skipNext: playback('skipToNextTrack'),
    skipPrev: playback('skipBack'),

    skipToTrack(trackNumber: number): Promise<unknown> {
      return playback('skipToTrack', () => ({ trackNumber }))();
    },
    seek(positionMillis: number): Promise<unknown> {
      return playback('seek', () => ({ positionMillis }))();
    },
    setPlayModes(playModes: Record<string, unknown>): Promise<unknown> {
      return playback('setPlayModes', () => ({ playModes }))();
    },
    loadContent(payload: Record<string, unknown>): Promise<unknown> {
      return playback('loadContent', () => payload)();
    },

    setGroupVolume(volume: number): Promise<unknown> {
      if (typeof volume !== 'number' || volume < 0 || volume > 100) return Promise.resolve({ error: 'Invalid volume' });
      const groupId = config.groupId;
      if (!groupId) return Promise.resolve({ error: 'No active group' });
      if (!socket.isOpen()) return Promise.resolve(NOT_CONNECTED);
      return socket.send({ namespace: 'groupVolume', groupId, command: 'setVolume' }, { volume });
    },

    /**
     * Plays a sound over the music without touching the queue (Sonos ducks the music, then carries on). Clips play
     * on one player each, so it goes to every player in the active group unless playerIds says otherwise.
     * `text` is spoken in `voice` (a British Azure neural voice; the gateway has a default).
     */
    async playAudioClip(clip: {
      url?: string;
      text?: string;
      voice?: string;
      volume?: number;
      playerIds?: string[];
    }): Promise<{ playerId: string; result: unknown }[] | { error: string }> {
      if (!socket.isOpen()) return NOT_CONNECTED;
      if (!clip?.text && !clip?.url?.startsWith('https://')) return { error: 'Need text or an https url' };
      const volume = clip.volume ?? 30;
      if (typeof volume !== 'number' || volume < 0 || volume > 100) return { error: 'Invalid volume' };
      const playerIds = clip.playerIds ?? socket.groups().find((g) => g.id === config.groupId)?.playerIds ?? [];
      if (!playerIds.length) return { error: 'No active group' };
      // Last, once nothing else can refuse the clip: the speech is made once, and every player gets the same link.
      const speech = clip.text ? await speechStreamUrl(gateway, clip.text, clip.voice) : { streamUrl: clip.url };
      if ('error' in speech) return speech;
      const payload = {
        name: 'TrueTunes',
        appId: 'com.truetunes',
        clipType: 'CUSTOM',
        streamUrl: speech.streamUrl,
        priority: 'LOW',
        volume,
      };
      return Promise.all(
        playerIds.map((playerId) =>
          socket
            .send({ namespace: 'audioClip', playerId, command: 'loadAudioClip' }, payload)
            .catch((e: unknown) => ({ error: String(e) }))
            .then((result) => ({ playerId, result }))
        )
      );
    },
  };
}
