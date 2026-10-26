// Shared set-up for the "Pages/" stories: each renders one routed page of the app against the synthetic backend
// (renderer/src/test/mockBackend.ts), with the providers the app shell gives it and the same live state (playback,
// queue, Home's shelves) the shell hands down as props.

import type { ReactNode } from 'react';
import { ChampionProvider } from '../src/components/ChampionProvider';
import { ToastProvider } from '../src/components/common/Toast';
import { ContextMenuProvider } from '../src/components/common/ContextMenu';
import type { YtmSections } from '../src/components/HomePanel';
import { useAuth } from '../src/hooks/useAuth';
import { usePlayback, type PlaybackState } from '../src/hooks/usePlayback';
import { useQueue } from '../src/hooks/useQueue';
import { useYtmHome } from '../src/hooks/useYtmHome';
import type { NormalizedQueueItem } from '../src/types/provider';
import { GROUP_ID } from '../src/test/fixtures/sonosShapes';

/** `parameters` for a page story: the mock backend, and the route the page renders at. */
export function pageParameters(path: string, options: { pattern?: string; state?: unknown } = {}) {
  return { backend: 'mock', route: { path, ...options } };
}

export interface LiveState {
  isAuthed: boolean;
  playback: PlaybackState;
  queueItems: NormalizedQueueItem[];
  ytm: YtmSections | undefined;
  ytmLoading: boolean;
}

/** What the app shell holds for its pages, fed by the mock's pushes: paused on the fourth of twenty queued tracks. */
export function LiveShell({ children }: { children: (s: LiveState) => ReactNode }) {
  const isAuthed = useAuth();
  const { playback } = usePlayback(GROUP_ID);
  const { items } = useQueue(isAuthed, GROUP_ID, playback.queueId, undefined, undefined, playback.queueVersion);
  const { data: ytm, isLoading: ytmLoading } = useYtmHome(isAuthed);
  return <>{children({ isAuthed, playback, queueItems: items, ytm, ytmLoading })}</>;
}

/** The providers the app wraps its pages in. Queue actions stay the context's no-ops: a story never queues. */
export function PageProviders({ children }: { children: ReactNode }) {
  return (
    <ChampionProvider>
      <ToastProvider>
        <ContextMenuProvider>{children}</ContextMenuProvider>
      </ToastProvider>
    </ChampionProvider>
  );
}
