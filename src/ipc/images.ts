// Image fetch for the renderer's image cache. The session cookie goes only where sendsSessionCookie allows.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { sendsSessionCookie } from '../sonos-cookie';
import { state, sonosVia, SONOS_GATEWAY_URL, SPOOF_UA } from '../state';
import { sonosImageRequest } from '../sonos-transport';
import { entraIdToken } from './entra';

export function register(): void {
  ipcMain.handle('image:fetch', async (_event: IpcMainInvokeEvent, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { error: 'Invalid URL' };
    }
    try {
      const via = sonosVia();
      const onSonosHost = sendsSessionCookie(url);
      const target = sonosImageRequest(via, url, {
        onSonosHost,
        gatewayBase: SONOS_GATEWAY_URL,
        bearer: via === 'gateway' && onSonosHost ? await entraIdToken() : null,
        sessionToken: state.sessionToken,
        userAgent: SPOOF_UA,
      });
      if (!target) return { error: 'No Entra token' };
      const res = await fetch(target.url, { headers: target.headers });
      if (!res.ok) return { error: `${res.status} ${res.statusText}` };
      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      return { data: buf.toString('base64'), mimeType };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
