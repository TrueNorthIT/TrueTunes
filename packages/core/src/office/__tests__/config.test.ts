import { describe, expect, it, vi } from 'vitest';
import { loadConfig, saveConfig } from '../config';
import type { AppConfig, KeyValueStore } from '../config';

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => {
      data[k] = v;
    },
    remove: async (k) => {
      delete data[k];
    },
  };
}

describe('config', () => {
  it('round-trips only the persisted fields', async () => {
    const store = memStore();
    const cfg: AppConfig = {
      displayName: 'Rich',
      entraOid: 'oid',
      entraName: 'Richard',
      entraEmail: 'r@x.co',
      lastSeenVersion: '1.2.3',
      preferredCoordinatorId: 'RINCON_1',
      queueDockedWidth: 320,
      householdId: 'hh', // runtime-discovered: must not persist
    };
    await saveConfig(store, cfg);
    expect(Object.keys(JSON.parse(store.data.config)).sort()).toEqual([
      'displayName',
      'entraEmail',
      'entraName',
      'entraOid',
      'lastSeenVersion',
      'preferredCoordinatorId',
      'queueDockedWidth',
    ]);
    expect(store.data.config).not.toContain('householdId');

    const loaded: AppConfig = {};
    await loadConfig(store, loaded);
    expect(loaded).toEqual({
      displayName: 'Rich',
      entraOid: 'oid',
      entraName: 'Richard',
      entraEmail: 'r@x.co',
      lastSeenVersion: '1.2.3',
      preferredCoordinatorId: 'RINCON_1',
      queueDockedWidth: 320,
    });
  });

  it('type-checks each field on load and ignores unknown ones', async () => {
    const store = memStore({
      config: JSON.stringify({
        displayName: 5,
        entraOid: 'o',
        queueDockedWidth: '300',
        lastSeenVersion: null,
        householdId: 'x',
      }),
    });
    const cfg: AppConfig = {};
    await loadConfig(store, cfg);
    expect(cfg).toEqual({ entraOid: 'o' });
  });

  it('does not throw on missing, corrupt or throwing stores', async () => {
    const cfg: AppConfig = {};
    await expect(loadConfig(memStore(), cfg)).resolves.toBeUndefined();
    await expect(loadConfig(memStore({ config: '{nope' }), cfg)).resolves.toBeUndefined();
    await expect(loadConfig(memStore({ config: 'null' }), cfg)).resolves.toBeUndefined();
    const bad: KeyValueStore = {
      get: async () => {
        throw new Error('x');
      },
      set: async () => {
        throw new Error('y');
      },
      remove: async () => {},
    };
    await expect(loadConfig(bad, cfg)).resolves.toBeUndefined();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(saveConfig(bad, cfg)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(cfg).toEqual({});
  });
});
