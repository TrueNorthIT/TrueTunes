// expo-image caches by URL, so no blob/objectURL LRU is needed in RN.
export function useImage(url: string | null | undefined): string | null {
  return url || null;
}
