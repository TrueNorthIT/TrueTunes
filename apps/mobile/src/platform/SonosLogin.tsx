import { useCallback, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { BASE_URL, SPOOF_UA } from '../sonos/constants';
import { looksSignedIn } from '../core/loginUrl';
import { readSonosSessionToken } from './sonosCookie';

/**
 * Sonos sign-in. Replaces the Electron auth BrowserWindow: the user signs in on play.sonos.com,
 * and once the WebView lands on a signed-in page we read the HttpOnly session cookie natively and
 * hand it up. The caller validates it (SessionManager.submit) - a false positive here is harmless.
 */
export function SonosLogin({ onToken }: { onToken: (token: string) => void }) {
  const inFlight = useRef(false);

  const check = useCallback(
    async (url: string) => {
      if (inFlight.current || !looksSignedIn(url)) return;
      inFlight.current = true;
      try {
        const token = await readSonosSessionToken();
        if (token) onToken(token);
      } finally {
        inFlight.current = false;
      }
    },
    [onToken]
  );

  return (
    <WebView
      source={{ uri: BASE_URL }}
      userAgent={SPOOF_UA}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      onNavigationStateChange={(s) => void check(s.url)}
    />
  );
}
