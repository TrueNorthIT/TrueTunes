import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useRemoteContext } from '../../logic/RemoteContext';

/**
 * Opens the /display-name modal once when the display name is unset (null) after it has loaded
 * (undefined = still loading). Prompts only once per mount so dismissing the modal does not loop.
 *
 * The More screen calls this today. The root layout (src/app/_layout.tsx, inside RemoteProvider)
 * may adopt it as-is to prompt on first launch: call `useRequireDisplayName()` from any component
 * under RemoteProvider that lives for the whole session.
 */
export function useRequireDisplayName(): void {
  const { displayName } = useRemoteContext();
  // A push before the root navigator has mounted is silently dropped, so wait for it.
  const navReady = !!useRootNavigationState()?.key;
  const prompted = useRef(false);
  useEffect(() => {
    if (navReady && displayName === null && !prompted.current) {
      prompted.current = true;
      router.push('/display-name');
    }
  }, [displayName, navReady]);
}
