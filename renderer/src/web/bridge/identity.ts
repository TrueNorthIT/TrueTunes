// The display name behind "who queued this": ensureEntraAuth's name logic and the claim, from src/ipc/entra.ts.

import type { FnFetch } from './functions';
import type { Store } from './storage';

/** One name per Entra account: a second user on the same browser never inherits the first one's. */
export const nameKey = (oid: string) => `tt.displayName.${oid}`;

export interface Identity {
  name(): string | undefined;
  setName(name: string): void;
  clear(): void;
  /** True if `name` is already owned by a different Entra account. A network failure counts as free, as on the desktop. */
  claim(oid: string, name: string): Promise<boolean>;
  /** Stored name, else the profile already linked to this account, else the Entra name; then registers it. */
  resolve(user: EntraUser): Promise<void>;
}

export function createIdentity(fn: FnFetch, store: Store, currentOid: () => string | undefined): Identity {
  async function claim(oid: string, displayName: string): Promise<boolean> {
    try {
      const res = await fn('profile/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oid, displayName }),
      });
      return res.status === 409;
    } catch {
      return false;
    }
  }

  /** The display name linked to this oid, or null. */
  async function lookup(oid: string): Promise<string | null> {
    try {
      const res = await fn(`profile/lookup?oid=${encodeURIComponent(oid)}`);
      if (!res.ok) return null;
      const data: { displayName?: string } = await res.json();
      return data.displayName ?? null;
    } catch {
      return null;
    }
  }

  const read = (oid: string | undefined) => (oid ? (store.get(nameKey(oid)) ?? undefined) : undefined);
  const write = (oid: string | undefined, next: string) => {
    if (oid) store.set(nameKey(oid), next);
  };

  return {
    name: () => read(currentOid()),
    setName: (next) => write(currentOid(), next),
    clear() {
      const oid = currentOid();
      if (oid) store.remove(nameKey(oid));
    },
    claim,
    async resolve(user) {
      if (!read(user.oid)) write(user.oid, (await lookup(user.oid)) ?? user.name);
      // Awaited: the functions resolve a token's caller through this claim, so it must land before the first write.
      await claim(user.oid, read(user.oid) ?? '');
    },
  };
}
