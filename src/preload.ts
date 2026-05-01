import { contextBridge, ipcRenderer } from 'electron';
import type { FetchRequest, FetchResponse, AttributionMap, AttributionEvent } from './types';

type VoidCallback = () => void;
type Unsubscribe = () => void;

export interface SonosAPI {
  getVersion: () => Promise<string>;
  isNewVersion: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  setQueueId: (queueId: string) => Promise<void>;
  loadContent: (payload: Record<string, unknown>) => Promise<unknown>;
  fetchImage: (url: string) => Promise<{ data: string; mimeType: string } | { error: string }>;
  onAuthReady: (cb: VoidCallback) => Unsubscribe;
  onAuthExpired: (cb: VoidCallback) => Unsubscribe;
  fetch: (request: FetchRequest) => Promise<FetchResponse>;
  onWsMessage: (cb: (header: unknown, payload: unknown) => void) => Unsubscribe;
  onWsReady: (cb: VoidCallback) => Unsubscribe;
  onWsGroups: (cb: (groups: unknown[]) => void) => Unsubscribe;
  getActiveGroup: () => Promise<string | null>;
  setGroup: (groupId: string) => Promise<{ ok?: boolean; error?: string }>;
  setGroupVolume: (volume: number) => Promise<unknown>;
  openWsMonitor: () => Promise<void>;
  openHttpMonitor: () => Promise<void>;
  openDevTools: () => Promise<void>;
  openMiniPlayer: () => Promise<void>;
  closeMiniPlayer: () => Promise<void>;
  refreshPlayback: () => Promise<void>;
  resync: () => Promise<void>;
  setPlayModes: (modes: Record<string, unknown>) => Promise<unknown>;
  play: () => Promise<unknown>;
  pause: () => Promise<unknown>;
  skipNext: () => Promise<unknown>;
  skipPrev: () => Promise<unknown>;
  skipToTrack: (trackNumber: number) => Promise<unknown>;
  seek: (positionMillis: number) => Promise<unknown>;
  reorderQueue: (fromIndices: number[], toIndex: number, queueLength: number) => Promise<unknown>;
  removeFromQueue: (indices: number[]) => Promise<unknown>;
  clearQueue: () => Promise<unknown>;
  // Attribution / office presence
  getDisplayName: () => Promise<string | null>;
  setDisplayName: (name: string) => Promise<void>;
  publishQueued: (item: { eventType: 'track' | 'album'; uri: string; trackName: string; artist: string; serviceId?: string; accountId?: string; artistId?: string; album?: string; albumId?: string; imageUrl?: string }) => Promise<void>;
  onAttributionMap: (cb: (map: AttributionMap) => void) => Unsubscribe;
  onAttributionEvent: (cb: (event: AttributionEvent) => void) => Unsubscribe;
  refreshAttribution: () => Promise<void>;
  fetchStats: (period: string, userId?: string) => Promise<unknown>;
  fetchDailyGame: (date?: string) => Promise<unknown>;
  submitGameScore: (input: {
    gameId: string;
    userName: string;
    guesses: { main: Array<'left' | 'right'>; bonus: string[] };
  }) => Promise<unknown>;
  fetchGameLeaderboard: (date?: string) => Promise<unknown>;
  fetchGameDates: (userName: string) => Promise<unknown>;
  fetchMyScore: (gameId: string, userName: string) => Promise<unknown>;
  fetchGameStats: (date?: string) => Promise<unknown>;
  geniusDescription: (trackName: string, artistName: string) => Promise<string | null>;
  trackEvent: (name: string, properties?: Record<string, string>) => Promise<void>;
  minimizeWindow:    () => Promise<void>;
  maximizeWindow:    () => Promise<void>;
  closeWindow:       () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximized: (cb: (maximized: boolean) => void) => Unsubscribe;
  onUpdateDownloaded: (cb: (version: string) => void) => Unsubscribe;
  installUpdate: () => Promise<void>;
}

// Buffer early IPC events that may fire before React mounts and registers listeners.
let _authReady = false;
let _wsReady = false;
let _wsGroups: unknown[] | null = null;
let _attributionMap: AttributionMap | null = null;

ipcRenderer.on('auth:ready', () => {
  _authReady = true;
});
ipcRenderer.on('auth:expired', () => {
  _authReady = false;
});
ipcRenderer.on('ws:ready', () => {
  _wsReady = true;
});
ipcRenderer.on('ws:groups', (_e, groups: unknown[]) => {
  _wsGroups = groups;
});
ipcRenderer.on('attribution:map', (_e, map: AttributionMap) => {
  _attributionMap = map;
});

contextBridge.exposeInMainWorld('sonos', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  isNewVersion: () => ipcRenderer.invoke('app:isNewVersion'),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
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
  fetch: (request: FetchRequest): Promise<FetchResponse> => ipcRenderer.invoke('api:fetch', request),
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
  setQueueId: (queueId: string) => ipcRenderer.invoke('queue:setId', queueId),
  loadContent: (payload: Record<string, unknown>) => ipcRenderer.invoke('playback:loadContent', payload),
  fetchImage: (url: string) => ipcRenderer.invoke('image:fetch', url),
  getActiveGroup: () => ipcRenderer.invoke('group:getActive'),
  setGroup: (groupId: string) => ipcRenderer.invoke('group:set', groupId),
  setGroupVolume: (volume: number) => ipcRenderer.invoke('volume:group:set', volume),
  openWsMonitor: () => ipcRenderer.invoke('debug:openWsMonitor'),
  openHttpMonitor: () => ipcRenderer.invoke('debug:openHttpMonitor'),
  openDevTools: () => ipcRenderer.invoke('debug:openDevTools'),
  openMiniPlayer: () => ipcRenderer.invoke('mini:open'),
  closeMiniPlayer: () => ipcRenderer.invoke('mini:close'),
  refreshPlayback: () => ipcRenderer.invoke('playback:refresh'),
  resync: () => ipcRenderer.invoke('ws:resync'),
  setPlayModes: (modes: Record<string, unknown>) => ipcRenderer.invoke('playback:setPlayModes', modes),
  play: () => ipcRenderer.invoke('playback:play'),
  pause: () => ipcRenderer.invoke('playback:pause'),
  skipNext: () => ipcRenderer.invoke('playback:skipNext'),
  skipPrev: () => ipcRenderer.invoke('playback:skipPrev'),
  skipToTrack: (trackNumber: number) => ipcRenderer.invoke('playback:skipToTrack', trackNumber),
  seek: (positionMillis: number) => ipcRenderer.invoke('playback:seek', positionMillis),
  reorderQueue: (fromIndices: number[], toIndex: number, queueLength: number) =>
    ipcRenderer.invoke('queue:reorder', fromIndices, toIndex, queueLength),
  removeFromQueue: (indices: number[]) => ipcRenderer.invoke('queue:remove', indices),
  clearQueue: () => ipcRenderer.invoke('queue:clear'),
  // Attribution / office presence
  getDisplayName: () => ipcRenderer.invoke('config:getDisplayName'),
  setDisplayName: (name) => ipcRenderer.invoke('config:setDisplayName', name),
  publishQueued: (item) => ipcRenderer.invoke('pubsub:publishQueued', item),
  onAttributionMap: (cb: (map: AttributionMap) => void): Unsubscribe => {
    if (_attributionMap !== null) cb(_attributionMap);
    const listener = (_e: unknown, map: AttributionMap) => cb(map);
    ipcRenderer.on('attribution:map', listener);
    return () => ipcRenderer.removeListener('attribution:map', listener);
  },
  refreshAttribution: () => ipcRenderer.invoke('attribution:refresh'),
  fetchStats: (period: string, userId?: string) => ipcRenderer.invoke('stats:fetch', period, userId),
  fetchDailyGame: (date?: string) => ipcRenderer.invoke('game:fetch', date),
  submitGameScore: (input) => ipcRenderer.invoke('game:submit', input),
  fetchGameLeaderboard: (date?: string) => ipcRenderer.invoke('game:leaderboard', date),
  fetchGameDates: (userName: string) => ipcRenderer.invoke('game:dates', userName),
  fetchMyScore: (gameId: string, userName: string) => ipcRenderer.invoke('game:my-score', gameId, userName),
  fetchGameStats: (date?: string) => ipcRenderer.invoke('game:stats', date),
  onAttributionEvent: (cb: (event: AttributionEvent) => void): Unsubscribe => {
    const listener = (_e: unknown, event: AttributionEvent) => cb(event);
    ipcRenderer.on('attribution:event', listener);
    return () => ipcRenderer.removeListener('attribution:event', listener);
  },
  geniusDescription: (trackName: string, artistName: string) =>
    ipcRenderer.invoke('genius:description', trackName, artistName),
  trackEvent: (name: string, properties?: Record<string, string>) =>
    ipcRenderer.invoke('telemetry:event', name, properties),
  minimizeWindow:    () => ipcRenderer.invoke('win:minimize'),
  maximizeWindow:    () => ipcRenderer.invoke('win:maximize'),
  closeWindow:       () => ipcRenderer.invoke('win:close'),
  isWindowMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void): Unsubscribe => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on('win:maximized', listener);
    return () => ipcRenderer.removeListener('win:maximized', listener);
  },
  onUpdateDownloaded: (cb: (version: string) => void): Unsubscribe => {
    const listener = (_e: unknown, version: string) => cb(version);
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.removeListener('update:downloaded', listener);
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
} satisfies SonosAPI);
