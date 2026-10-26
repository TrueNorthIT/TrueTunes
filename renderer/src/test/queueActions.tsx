import type { ComponentType, ReactNode } from 'react';
import { vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { displayNameKeys } from '../hooks/useDisplayName';
import { QueueActionsProvider, type QueueActions } from '../hooks/useQueueActions';

type Wrapper = ComponentType<{ children: ReactNode }>;

/** A render `wrapper` that serves `useQueueActions()` with the given mocks, inside an optional outer wrapper. */
export function queueActionsWrapper(addToQueue: QueueActions['addToQueue'] = vi.fn(), Outer?: Wrapper) {
  const value: QueueActions = { addToQueue, queueNext: vi.fn() };
  return function Wrapped({ children }: { children: ReactNode }) {
    const inner = <QueueActionsProvider value={value}>{children}</QueueActionsProvider>;
    return Outer ? <Outer>{inner}</Outer> : inner;
  };
}

/** Make `useDisplayName()` resolve to `name` without asking the (pending) bridge. */
export function seedDisplayName(client: QueryClient, name: string | null) {
  client.setQueryData(displayNameKeys.all, name);
}
