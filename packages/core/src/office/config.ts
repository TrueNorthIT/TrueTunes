// Ported from TrueTunes/src/main.ts (loadConfig / saveConfig).
// The file on disk becomes a single JSON string in an injected key-value store.

import type { SonosConfig } from '../sonos/types';

export interface AppConfig extends SonosConfig {
  preferredCoordinatorId?: string;
  displayName?: string;
  entraOid?: string;
  entraName?: string;
  entraEmail?: string;
  lastSeenVersion?: string;
  queueDockedWidth?: number;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const CONFIG_KEY = 'config';

const STRING_FIELDS = [
  'displayName',
  'entraOid',
  'entraName',
  'entraEmail',
  'lastSeenVersion',
  'preferredCoordinatorId',
] as const;

/** Only persisted fields are loaded (not runtime-discovered ones); each is type-checked. */
export async function loadConfig(store: KeyValueStore, config: AppConfig): Promise<void> {
  try {
    const raw = await store.get(CONFIG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AppConfig> | null;
    if (!parsed || typeof parsed !== 'object') return;
    for (const key of STRING_FIELDS) {
      const value = parsed[key];
      if (typeof value === 'string') config[key] = value;
    }
    if (typeof parsed.queueDockedWidth === 'number') config.queueDockedWidth = parsed.queueDockedWidth;
  } catch {
    // No config yet or unreadable — use defaults
  }
}

export async function saveConfig(store: KeyValueStore, config: AppConfig): Promise<void> {
  try {
    // Only persist non-sensitive, user-set fields
    const toSave: Partial<AppConfig> = {
      displayName: config.displayName,
      entraOid: config.entraOid,
      entraName: config.entraName,
      entraEmail: config.entraEmail,
      lastSeenVersion: config.lastSeenVersion,
      preferredCoordinatorId: config.preferredCoordinatorId,
      queueDockedWidth: config.queueDockedWidth,
    };
    await store.set(CONFIG_KEY, JSON.stringify(toSave, null, 2));
  } catch (err) {
    console.warn('[config] Failed to save:', err);
  }
}
