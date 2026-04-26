import { api } from '../../lib/sonosApi';
import { extractItems } from '../../lib/itemHelpers';
import type { AudioProvider } from '../AudioProvider';
import type { NormalizedGroup, NormalizedPlaybackState, NormalizedQueueItem, NormalizedTrack } from '../../types/provider';
import type { PlaybackPayload, SonosItem, SonosItemId, SonosTrack } from '../../types/sonos';

function resolveArtistName(raw: SonosTrack['artist']): string {
  if (!raw) return '';
  if (typeof raw === 'object') return raw.name ?? '';
  return raw;
}

function resolveImageUrl(track: SonosTrack): string | null {
  const urls = [
    ...(track.images?.map((i) => i.url) ?? []),
    track.imageUrl,
  ].filter((u): u is string => !!u);
  return urls.find((u) => u.startsWith('https://')) ?? null;
}

function normalizeTrack(track: SonosTrack): NormalizedTrack {
  const id = track.id as SonosItemId | undefined;
  const albumObj = track.album as { name?: string; id?: { objectId?: string } } | undefined;
  return {
    id: id?.objectId ?? '',
    title: track.name ?? track.title ?? '',
    artist: resolveArtistName(track.artist ?? track.primaryArtist),
    albumName: albumObj?.name ?? null,
    albumId: albumObj?.id?.objectId ?? null,
    imageUrl: resolveImageUrl(track),
    durationMs: track.durationMillis ?? 0,
    isExplicit: !!(track.explicit ?? (track as Record<string, unknown>)['isExplicit']),
    serviceId: id?.serviceId ?? null,
    accountId: id?.accountId ?? null,
  };
}

export function normalizePlaybackPayload(payload: PlaybackPayload): NormalizedPlaybackState {
  const track = payload?.metadata?.currentItem?.track;
  const stateVal = payload?.playback?.playbackState ?? '';
  const repeatOne = payload?.playback?.playModes?.repeatOne ?? false;
  const repeatAll = payload?.playback?.playModes?.repeat ?? false;
  const status = stateVal.includes('PLAYING') ? 'playing' as const
    : stateVal.includes('PAUSED') ? 'paused' as const
    : 'idle' as const;

  return {
    status,
    isPlaying: status === 'playing',
    positionMs: payload?.playback?.positionMillis ?? 0,
    durationMs: track?.durationMillis ?? 0,
    currentTrack: track ? normalizeTrack(track) : null,
    shuffle: payload?.playback?.playModes?.shuffle ?? false,
    repeatMode: repeatOne ? 'one' : repeatAll ? 'all' : 'none',
    queueId: payload?.playback?.queueId ?? null,
    queueVersion: payload?.playback?.queueVersion ?? null,
    queueItemId: payload?.playback?.itemId ?? null,
  };
}

function normalizeSonosItemToQueueItem(item: SonosItem, index: number): NormalizedQueueItem {
  const track = item.track as SonosTrack | undefined;
  const id = (track?.id ?? item.id) as SonosItemId | undefined;
  const albumObj = track?.album as { name?: string; id?: { objectId?: string } } | undefined;

  const rawArt = track
    ? resolveImageUrl(track)
    : ((item.images as Record<string, string> | undefined)?.['tile1x1'] ?? item.imageUrl ?? null);

  const rawArtist = track?.artist ?? track?.primaryArtist ?? item.artist ?? item.primaryArtist;

  return {
    index,
    track: {
      id: id?.objectId ?? '',
      title: track?.name ?? track?.title ?? item.name ?? item.title ?? '',
      artist: resolveArtistName(rawArtist),
      albumName: albumObj?.name ?? null,
      albumId: albumObj?.id?.objectId ?? null,
      imageUrl: rawArt ?? null,
      durationMs: track?.durationMillis ?? 0,
      isExplicit: !!(
        track?.explicit ??
        (track as Record<string, unknown> | undefined)?.['isExplicit']
      ),
      serviceId: id?.serviceId ?? null,
      accountId: id?.accountId ?? null,
    },
  };
}

export class SonosProvider implements AudioProvider {
  readonly id = 'sonos' as const;

  play()                { return window.sonos.play() as Promise<void>; }
  pause()               { return window.sonos.pause() as Promise<void>; }
  skipNext()            { return window.sonos.skipNext() as Promise<void>; }
  skipPrev()            { return window.sonos.skipPrev() as Promise<void>; }
  seek(ms: number)      { return window.sonos.seek(ms) as Promise<void>; }
  loadContent(p: Record<string, unknown>) { return window.sonos.loadContent(p); }
  skipToTrack(n: number)    { return window.sonos.skipToTrack(n) as Promise<void>; }
  refreshPlayback()          { return window.sonos.refreshPlayback() as Promise<void>; }

  setPlayModes(modes: { shuffle?: boolean; repeat?: 'none' | 'one' | 'all' }) {
    return window.sonos.setPlayModes({
      shuffle: modes.shuffle,
      repeat: modes.repeat === 'all',
      repeatOne: modes.repeat === 'one',
    }) as Promise<void>;
  }

  async getQueue(params?: { count?: number; offset?: number }): Promise<{ items: NormalizedQueueItem[]; etag?: string; error?: string }> {
    const r = await api.queue.list({ count: params?.count, offset: params?.offset });
    if (r.error) return { items: [], error: r.error };
    const raw = extractItems(r.data) as SonosItem[];
    const offset = params?.offset ?? 0;
    return {
      items: raw.map((item, i) => normalizeSonosItemToQueueItem(item, offset + i)),
      etag: r.etag,
    };
  }

  removeFromQueue(indices: number[]) { return window.sonos.removeFromQueue(indices) as Promise<void>; }
  clearQueue()                       { return window.sonos.clearQueue() as Promise<void>; }
  reorderQueue(from: number[], to: number, len: number) {
    return window.sonos.reorderQueue(from, to, len) as Promise<void>;
  }

  getActiveGroup() { return window.sonos.getActiveGroup(); }
  setGroup(groupId: string) { return window.sonos.setGroup(groupId).then(() => undefined); }
  setVolume(volume: number) { return window.sonos.setGroupVolume(volume) as Promise<void>; }

  subscribePlayback(
    onState: (groupId: string | undefined, state: NormalizedPlaybackState) => void,
    onVolume: (volume: number) => void,
  ) {
    return window.sonos.onWsMessage((header, payload) => {
      const h = header as Record<string, unknown>;

      if (h?.['namespace'] === 'groupVolume') {
        const vol = (payload as { volume?: number })?.volume;
        if (vol !== undefined) onVolume(vol);
        return;
      }

      if (h?.['namespace'] !== 'playbackExtended') return;

      const p = payload as PlaybackPayload;
      const groupId = h?.['groupId'] as string | undefined;

      // Sonos signals no active groups — zero out volume
      if ((p?.playback?.playbackState ?? '') === 'NO_GROUPS') {
        onVolume(0);
      }

      onState(groupId, normalizePlaybackPayload(p));
    });
  }

  subscribeGroups(onGroups: (groups: NormalizedGroup[]) => void) {
    return window.sonos.onWsGroups((raw) => {
      const groups = (raw as Array<{ id: string; name: string; coordinatorId?: string }>).map(
        (g): NormalizedGroup => ({ id: g.id, name: g.name, providerId: 'sonos', coordinatorId: g.coordinatorId }),
      );
      onGroups(groups);
    });
  }
}
