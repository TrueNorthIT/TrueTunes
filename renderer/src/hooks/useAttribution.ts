import { useEffect, useRef, useState } from 'react';

/**
 * Maintains a live map of trackUri → {user, timestamp, …} by listening for
 * IPC events from the Azure PubSub bridge in the main process.
 *
 * Returns an empty map if the office-presence feature is not configured
 * (PUBSUB_FUNCTION_URL not set, or user has no display name yet).
 */
export function useAttribution(onRemoteQueue?: () => void): AttributionMap {
  const [map, setMap] = useState<AttributionMap>({});
  const registered = useRef(false);
  const onRemoteQueueRef = useRef(onRemoteQueue);
  onRemoteQueueRef.current = onRemoteQueue;

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    const unsubMap = window.sonos.onAttributionMap((initialMap) => {
      setMap(initialMap);
    });

    const unsubEvent = window.sonos.onAttributionEvent((event) => {
      setMap((prev) => ({
        ...prev,
        [event.uri]: {
          user: event.user,
          timestamp: event.timestamp,
          trackName: event.trackName,
          artist: event.artist,
        },
      }));
      onRemoteQueueRef.current?.();
    });

    return () => {
      unsubMap();
      unsubEvent();
    };
  }, []);

  return map;
}
