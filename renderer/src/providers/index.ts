import { SonosProvider } from './sonos/SonosProvider';
import type { AudioProvider } from './AudioProvider';

const _sonos: AudioProvider = new SonosProvider();

export function getActiveProvider(): AudioProvider {
  return _sonos;
}

// Future: export function setActiveProvider(id: ProviderId) { ... }
