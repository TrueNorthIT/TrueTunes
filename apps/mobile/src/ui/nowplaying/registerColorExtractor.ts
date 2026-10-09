import { getColors } from 'react-native-image-colors';
import { setColorExtractor } from '../../logic/hooks/useDominantColor';
import { pickTintFromColors } from './colorMath';

let registered = false;

/** Registers the native (Android Palette) colour extractor for useDominantColor. Idempotent. */
export function registerColorExtractor(): void {
  if (registered) return;
  registered = true;
  setColorExtractor(async (uri) => {
    try {
      const res = await getColors(uri, { fallback: '#1c1c1e', cache: true, key: uri });
      if (res.platform !== 'android') return null;
      return pickTintFromColors(res);
    } catch {
      return null;
    }
  });
}
