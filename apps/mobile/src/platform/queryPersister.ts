import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { File, Paths } from 'expo-file-system';

// One JSON file in the app cache directory (Android may clear it under storage pressure, which is
// fine - it only costs a refetch). Every operation is best effort: a corrupt or unreadable cache
// must behave like an empty one, never as an error.
const file = new File(Paths.cache, 'query-cache.json');

export const queryPersister = createAsyncStoragePersister({
  key: 'true-tunes-query-cache',
  throttleTime: 3000,
  storage: {
    getItem: async () => {
      try {
        return file.exists ? await file.text() : null;
      } catch {
        return null;
      }
    },
    setItem: async (_key, value) => {
      try {
        if (!file.exists) file.create();
        file.write(value);
      } catch {
        /* best effort */
      }
    },
    removeItem: async () => {
      try {
        if (file.exists) file.delete();
      } catch {
        /* best effort */
      }
    },
  },
});
