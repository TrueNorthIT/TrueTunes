import type { NormalizedGroup, NormalizedPlaybackState, NormalizedQueueItem, ProviderId } from '../types/provider';

type Unsubscribe = () => void;

export interface AudioProvider {
  readonly id: ProviderId;

  // Transport
  play(): Promise<void>;
  pause(): Promise<void>;
  skipNext(): Promise<void>;
  skipPrev(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setPlayModes(modes: { shuffle?: boolean; repeat?: 'none' | 'one' | 'all' }): Promise<void>;
  loadContent(payload: Record<string, unknown>): Promise<unknown>;
  skipToTrack(trackNumber: number): Promise<void>;
  refreshPlayback(): Promise<void>;

  // Queue
  getQueue(params?: { count?: number; offset?: number }): Promise<{ items: NormalizedQueueItem[]; etag?: string; error?: string }>;
  removeFromQueue(indices: number[]): Promise<void>;
  reorderQueue(fromIndices: number[], toIndex: number, queueLength: number): Promise<void>;
  clearQueue(): Promise<void>;

  // Output / groups
  getActiveGroup(): Promise<string | null>;
  setGroup(groupId: string): Promise<void>;
  setVolume(volume: number): Promise<void>;

  // Subscriptions
  // onState receives groupId (undefined if provider has no group concept) plus the normalized state
  subscribePlayback(
    onState: (groupId: string | undefined, state: NormalizedPlaybackState) => void,
    onVolume: (volume: number) => void,
  ): Unsubscribe;
  subscribeGroups(onGroups: (groups: NormalizedGroup[]) => void): Unsubscribe;
}
