// The display name behind "who queued this": ensureEntraAuth's name logic and the claim, from src/ipc/entra.ts.

import type { FnFetch } from './functions';
import type { Store } from './storage';

export const NAME_KEY = 'tt.displayName';

export interface Identity {
  name(): string | undefined;
  setName(name: string): void;
  clear(): void;
  /** True if `name` is already owned by a different Entra account. A network failure counts as free, as on the desktop. */
  claim(oid: string, name: string): Promise<boolean>;
  /** Stored name, else the profile already linked to this account, else the Entra name; then registers it. */
  resolve(user: EntraUser): Promise<void>;
}

export function createIdentity(fn: FnFetch, store: Store): Identity {
  let name = store.get(NAME_KEY) ?? undefined;

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

  const setName = (next: string) => {
    name = next;
    store.set(NAME_KEY, next);
  };

  return {
    name: () => name,
    setName,
    clear() {
      name = undefined;
      store.remove(NAME_KEY);
    },
    claim,
    async resolve(user) {
      if (!name) setName((await lookup(user.oid)) ?? user.name);
      // Awaited: the functions resolve a token's caller through this claim, so it must land before the first write.
      await claim(user.oid, name ?? '');
    },
  };
}
