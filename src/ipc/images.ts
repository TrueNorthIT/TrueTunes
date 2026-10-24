// Image fetch for the renderer's image cache. The session cookie goes only where sendsSessionCookie allows.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { sendsSessionCookie } from '../sonos-cookie';
import { state, SPOOF_UA } from '../state';

export function register(): void {
  ipcMain.handle('image:fetch', async (_event: IpcMainInvokeEvent, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return { error: 'Invalid URL' };
    }
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': SPOOF_UA,
          ...(state.sessionToken && sendsSessionCookie(url)
            ? { Cookie: `__Secure-next-auth.session-token=${state.sessionToken}` }
            : {}),
        },
      });
      if (!res.ok) return { error: `${res.status} ${res.statusText}` };
      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      return { data: buf.toString('base64'), mimeType };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
