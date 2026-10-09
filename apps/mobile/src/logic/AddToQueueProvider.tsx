import type { ReactNode } from 'react';
import { AddToQueueContext } from './AddToQueueContext';
import { AutoplayContext } from './AutoplayContext';
import { useAddToQueueImpl } from './useAddToQueueImpl';

/** Mount inside RemoteProvider (and the toast provider). */
export function AddToQueueProvider({ children }: { children: ReactNode }) {
  const { addToQueue, autoplay } = useAddToQueueImpl();
  return (
    <AddToQueueContext.Provider value={addToQueue}>
      <AutoplayContext.Provider value={autoplay}>{children}</AutoplayContext.Provider>
    </AddToQueueContext.Provider>
  );
}
