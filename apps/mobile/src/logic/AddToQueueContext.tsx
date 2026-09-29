import { createContext, useContext } from 'react';
import type { SonosItem } from './types/sonos';

/**
 * Same contract as desktop's `handleAddToQueue` in App.tsx: add a track/album/playlist/program to
 * the active group's queue (position -1 = end), publish attribution, and surface failures as toasts.
 * Screens call `useAddToQueue()`; the real implementation is provided at the app root.
 */
export type AddToQueue = (
  item: SonosItem,
  position?: number,
  opts?: { attribute?: boolean; djFiller?: boolean },
) => Promise<void>;

export const AddToQueueContext = createContext<AddToQueue>(async () => {
  console.warn('AddToQueue used before the provider was mounted');
});

export const useAddToQueue = (): AddToQueue => useContext(AddToQueueContext);
