import { BASE_URL, SPOOF_UA, WS_SUBPROTOCOL, WS_URL } from './constants';
import { newCorrId } from './protocol';

type Frame = [Record<string, unknown>, unknown];

// React Native's WebSocket accepts a third `options.headers` argument that lib.dom types omit.
const HeaderWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: string[],
  options: { headers: Record<string, string> },
) => WebSocket;

/** Minimal Sonos WS client: corrId request/response plus one-shot push waiters. */
export class SonosWs {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (payload: unknown) => void>();
  private pushOnce = new Map<string, (payload: unknown) => void>();

  constructor(private onFrame: (header: Record<string, unknown>, payload: unknown) => void) {}

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(ticket: string, log: (msg: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new HeaderWebSocket(`${WS_URL}?ticket=${ticket}`, [WS_SUBPROTOCOL], {
        headers: { Origin: BASE_URL, 'User-Agent': SPOOF_UA },
      });
      this.ws = ws;
      ws.onopen = () => {
        log(`ws open, negotiated protocol="${ws.protocol}"`);
        resolve();
      };
      ws.onerror = (e) => {
        const msg = (e as { message?: string }).message ?? 'unknown';
        log(`ws error: ${msg}`);
        reject(new Error(msg));
      };
      ws.onclose = (e) => log(`ws closed code=${e.code} reason="${e.reason}"`);
      ws.onmessage = (e) => this.handle(String(e.data));
    });
  }

  private handle(raw: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(raw) as Frame;
    } catch {
      return;
    }
    const [header, payload] = frame;
    const corrId = header['corrId'] as string | undefined;
    if (corrId && this.pending.has(corrId)) {
      this.pending.get(corrId)!(payload);
      this.pending.delete(corrId);
    }
    const ns = header['namespace'] as string | undefined;
    const name = (header['name'] ?? header['type']) as string | undefined;
    if (ns && name) {
      const key = `${ns}:${name}`;
      const waiter = this.pushOnce.get(key);
      if (waiter) {
        waiter(payload);
        this.pushOnce.delete(key);
      }
    }
    this.onFrame(header, payload);
  }

  send(header: Record<string, unknown>, payload: Record<string, unknown>, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.isOpen) return reject(new Error('WebSocket not open'));
      const corrId = newCorrId();
      const timer = setTimeout(() => {
        this.pending.delete(corrId);
        reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
      }, timeoutMs);
      this.pending.set(corrId, (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      this.ws!.send(JSON.stringify([{ ...header, corrId }, payload]));
    });
  }

  waitForPush(key: string, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`push timeout: ${key}`)), timeoutMs);
      this.pushOnce.set(key, (p) => {
        clearTimeout(timer);
        resolve(p);
      });
    });
  }

  close(): void {
    this.ws?.close(1000);
    this.ws = null;
  }
}
