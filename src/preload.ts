import { contextBridge, ipcRenderer } from 'electron';
import type { FetchRequest, FetchResponse } from './types';

type VoidCallback = () => void;
type Unsubscribe = () => void;

export interface SonosAPI {
  setQueueId:      (queueId: string)                   => Promise<void>;
  loadContent:     (payload: Record<string, unknown>)  => Promise<unknown>;
  fetchImage:      (url: string) => Promise<{ data: string; mimeType: string } | { error: string }>;
  onAuthReady:    (cb: VoidCallback) => Unsubscribe;
  onAuthExpired:  (cb: VoidCallback) => Unsubscribe;
  fetch:          (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage:    (cb: (header: unknown, payload: unknown) => void) => Unsubscribe;
  onWsReady:      (cb: VoidCallback) => Unsubscribe;
  onWsGroups:     (cb: (groups: unknown[]) => void) => Unsubscribe;
  setGroup:       (groupId: string)     => Promise<{ ok?: boolean; error?: string }>;
  setGroupVolume: (volume: number)     => Promise<unknown>;
  openWsMonitor:   ()                               => Promise<void>;
  openHttpMonitor: ()                               => Promise<void>;
  refreshPlayback: ()                               => Promise<void>;
  resync:         ()                               => Promise<void>;
  setPlayModes:   (modes: Record<string, unknown>) => Promise<unknown>;
  play:           ()                    => Promise<unknown>;
  pause:          ()                    => Promise<unknown>;
  skipNext:       ()                    => Promise<unknown>;
  skipPrev:       ()                    => Promise<unknown>;
  skipToTrack:    (trackNumber: number) => Promise<unknown>;
  reorderQueue:   (fromIndices: number[], toIndex: number, queueLength: number) => Promise<unknown>;
  removeFromQueue:(indices: number[])   => Promise<unknown>;
  clearQueue:     ()                    => Promise<unknown>;
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
  onAuthReady: (cb: VoidCallback): Unsubscribe => {
    if (_authReady) cb();
    const listener = () => cb();
    ipcRenderer.on('auth:ready', listener);
    return () => ipcRenderer.removeListener('auth:ready', listener);
  },
  onAuthExpired: (cb: VoidCallback): Unsubscribe => {
    const listener = () => cb();
    ipcRenderer.on('auth:expired', listener);
    return () => ipcRenderer.removeListener('auth:expired', listener);
  },
  fetch: (request: FetchRequest): Promise<FetchResponse> =>
    ipcRenderer.invoke('api:fetch', request),
  onWsMessage: (cb: (header: unknown, payload: unknown) => void): Unsubscribe => {
    const listener = (_e: unknown, [h, p]: [unknown, unknown]) => cb(h, p);
    ipcRenderer.on('ws:message', listener);
    return () => ipcRenderer.removeListener('ws:message', listener);
  },
  onWsReady: (cb: VoidCallback): Unsubscribe => {
    if (_wsReady) cb();
    const listener = () => cb();
    ipcRenderer.on('ws:ready', listener);
    return () => ipcRenderer.removeListener('ws:ready', listener);
  },
  onWsGroups: (cb: (groups: unknown[]) => void): Unsubscribe => {
    if (_wsGroups !== null) cb(_wsGroups);
    const listener = (_e: unknown, groups: unknown[]) => cb(groups);
    ipcRenderer.on('ws:groups', listener);
    return () => ipcRenderer.removeListener('ws:groups', listener);
  },
  setQueueId:      (queueId: string)                   => ipcRenderer.invoke('queue:setId', queueId),
  loadContent:     (payload: Record<string, unknown>)  => ipcRenderer.invoke('playback:loadContent', payload),
  fetchImage:      (url: string)                       => ipcRenderer.invoke('image:fetch', url),
  setGroup:       (groupId: string)     => ipcRenderer.invoke('group:set', groupId),
  setGroupVolume: (volume: number)     => ipcRenderer.invoke('volume:group:set', volume),
  openWsMonitor:   ()                               => ipcRenderer.invoke('debug:openWsMonitor'),
  openHttpMonitor: ()                               => ipcRenderer.invoke('debug:openHttpMonitor'),
  refreshPlayback: ()                               => ipcRenderer.invoke('playback:refresh'),
  resync:          ()                               => ipcRenderer.invoke('ws:resync'),
  setPlayModes:   (modes: Record<string, unknown>) => ipcRenderer.invoke('playback:setPlayModes', modes),
  play:           ()                    => ipcRenderer.invoke('playback:play'),
  pause:          ()                    => ipcRenderer.invoke('playback:pause'),
  skipNext:       ()                    => ipcRenderer.invoke('playback:skipNext'),
  skipPrev:       ()                    => ipcRenderer.invoke('playback:skipPrev'),
  skipToTrack:    (trackNumber: number) => ipcRenderer.invoke('playback:skipToTrack', trackNumber),
  reorderQueue:   (fromIndices: number[], toIndex: number, queueLength: number) => ipcRenderer.invoke('queue:reorder', fromIndices, toIndex, queueLength),
  removeFromQueue:(indices: number[])   => ipcRenderer.invoke('queue:remove', indices),
  clearQueue:     ()                    => ipcRenderer.invoke('queue:clear'),
} satisfies SonosAPI);
