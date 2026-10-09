import { useEffect, useState } from 'react';
import type { WsStatus } from '@truetunes/core/sonos/wsSession';
import { core } from './core';

/** Live Sonos WebSocket state. The hub replays the latest value, so late mounts are correct. */
export function useConnectionStatus(): WsStatus {
  const [status, setStatus] = useState<WsStatus>('connecting');
  useEffect(() => core.hub.on('ws:status', setStatus), []);
  return status;
}
