import { contextBridge, ipcRenderer } from 'electron';
import type { FetchRequest, FetchResponse } from './types';

type VoidCallback = () => void;

export interface SonosAPI {
  onAuthReady:    (cb: VoidCallback) => void;
  onAuthExpired:  (cb: VoidCallback) => void;
  fetch:          (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage:    (cb: (header: unknown, payload: unknown) => void) => void;
  onWsReady:      (cb: VoidCallback) => void;
  onWsGroups:     (cb: (groups: unknown[]) => void) => void;
  setGroup:       (groupId: string)    => Promise<{ ok?: boolean; error?: string }>;
  setGroupVolume: (volume: number)    => Promise<unknown>;
  skipToTrack:    (trackNumber: number) => Promise<unknown>;
}

// Buffer early IPC events that may fire before React mounts and registers listeners.
let _authReady   = false;
let _wsReady     = false;
let _wsGroups:   unknown[] | null = null;

ipcRenderer.on('auth:ready',   () => { _authReady = true; });
ipcRenderer.on('auth:expired', () => { _authReady = false; });
ipcRenderer.on('ws:ready',     () => { _wsReady   = true; });
ipcRenderer.on('ws:groups',    (_e, groups: unknown[]) => { _wsGroups = groups; });

contextBridge.exposeInMainWorld('sonos', {
  onAuthReady: (cb: VoidCallback) => {
    if (_authReady) cb();
    ipcRenderer.on('auth:ready', () => cb());
  },
  onAuthExpired: (cb: VoidCallback) => {
    ipcRenderer.on('auth:expired', () => cb());
  },
  fetch: (request: FetchRequest): Promise<FetchResponse> =>
    ipcRenderer.invoke('api:fetch', request),
  onWsMessage: (cb: (header: unknown, payload: unknown) => void) =>
    ipcRenderer.on('ws:message', (_e, [h, p]: [unknown, unknown]) => cb(h, p)),
  onWsReady: (cb: VoidCallback) => {
    if (_wsReady) cb();
    ipcRenderer.on('ws:ready', () => cb());
  },
  onWsGroups: (cb: (groups: unknown[]) => void) => {
    if (_wsGroups !== null) cb(_wsGroups);
    ipcRenderer.on('ws:groups', (_e, groups: unknown[]) => cb(groups));
  },
  setGroup:       (groupId: string)     => ipcRenderer.invoke('group:set', groupId),
  setGroupVolume: (volume: number)     => ipcRenderer.invoke('volume:group:set', volume),
  skipToTrack:    (trackNumber: number) => ipcRenderer.invoke('playback:skipToTrack', trackNumber),
} satisfies SonosAPI);
