// Playback and volume commands over the relay: the WS handlers of src/ipc/sonos.ts, frame for frame.

import type { SonosConfig } from './sonosHttp';
import type { SonosSocket } from './sonosSocket';

const NOT_CONNECTED = { error: 'WS not connected' };

export function createCommands(socket: SonosSocket, config: SonosConfig) {
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
     */
    playAudioClip(clip: {
      url?: string;
      text?: string;
      volume?: number;
      playerIds?: string[];
    }): Promise<{ playerId: string; result: unknown }[] | { error: string }> {
      if (!socket.isOpen()) return Promise.resolve(NOT_CONNECTED);
      // shortcut: unofficial Google Translate TTS (no key, ~200 chars, could vanish); Azure Speech if this sticks.
      const streamUrl = clip?.text
        ? `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${encodeURIComponent(clip.text)}`
        : clip?.url;
      if (!streamUrl?.startsWith('https://')) return Promise.resolve({ error: 'Need text or an https url' });
      const volume = clip.volume ?? 30;
      if (typeof volume !== 'number' || volume < 0 || volume > 100) return Promise.resolve({ error: 'Invalid volume' });
      const playerIds = clip.playerIds ?? socket.groups().find((g) => g.id === config.groupId)?.playerIds ?? [];
      if (!playerIds.length) return Promise.resolve({ error: 'No active group' });
      const payload = {
        name: 'TrueTunes',
        appId: 'com.truetunes',
        clipType: 'CUSTOM',
        streamUrl,
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
