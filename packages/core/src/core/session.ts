// Sonos web-player session lifecycle. Replaces the Electron auth window + onAuthReady/401 handling
// in TrueTunes/src/main.ts (createAuthWindow, onAuthReady, saveSessionToken/loadSessionToken,
// validateSessionToken). Platform-neutral: token storage and validation are injected.

import { BASE_URL, SESSION_COOKIE, SPOOF_UA } from '../sonos/constants';

export interface TokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** A token is valid if /api/mfe answers 2xx with it (same check as desktop's validateSessionToken). */
export async function validateSessionToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${BASE_URL}/api/mfe`, {
      headers: {
        Cookie: `${SESSION_COOKIE}=${token}`,
        'User-Agent': SPOOF_UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type SessionEvent = 'ready' | 'expired';

export interface SessionDeps {
  store: TokenStore;
  validate: (token: string) => Promise<boolean>;
  log?: (...args: unknown[]) => void;
}

export class SessionManager {
  private token: string | null = null;
  // Desktop's `authConfirmed`: 'ready' fires once per login, not on every authenticated response.
  private confirmed = false;
  private listeners: Record<SessionEvent, Set<() => void>> = { ready: new Set(), expired: new Set() };
  private readonly log: (...args: unknown[]) => void;

  constructor(private readonly deps: SessionDeps) {
    this.log = deps.log ?? (() => {});
  }

  getToken = (): string | null => this.token;

  get isAuthed(): boolean {
    return this.confirmed;
  }

  on(event: SessionEvent, cb: () => void): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit(event: SessionEvent): void {
    for (const cb of [...this.listeners[event]]) cb();
  }

  /**
   * Try the persisted token. Returns 'authed' (and fires 'ready') if it still validates, else
   * clears it and returns 'needs-login'. A network failure is treated as invalid rather than
   * trusting a possibly-dead token.
   */
  async restore(): Promise<'authed' | 'needs-login'> {
    const stored = await this.deps.store.load().catch(() => null);
    if (!stored) return 'needs-login';
    if (await this.deps.validate(stored)) {
      this.log('[auth] restored persisted session');
      this.adopt(stored);
      return 'authed';
    }
    this.log('[auth] persisted session no longer valid');
    await this.deps.store.clear().catch(() => {});
    return 'needs-login';
  }

  /** A fresh token captured from the login WebView. Validates before adopting. */
  async submit(token: string): Promise<boolean> {
    if (token === this.token && this.confirmed) return true;
    if (!(await this.deps.validate(token))) return false;
    await this.deps.store.save(token).catch(() => {});
    this.adopt(token);
    return true;
  }

  private adopt(token: string): void {
    this.token = token;
    if (this.confirmed) return;
    this.confirmed = true;
    this.emit('ready');
  }

  /** A 401 came back: drop the token so the UI can send the user back to login. Idempotent. */
  async expire(): Promise<void> {
    if (!this.token && !this.confirmed) return;
    this.log('[auth] session expired');
    this.token = null;
    this.confirmed = false;
    await this.deps.store.clear().catch(() => {});
    this.emit('expired');
  }
}
