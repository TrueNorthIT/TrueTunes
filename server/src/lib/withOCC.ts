interface WithEtag {
  _etag?: string;
}

/**
 * Wraps a Cosmos read-modify-write with optimistic concurrency control.
 * On 412 PreconditionFailed (ETag mismatch) it re-reads and retries up to
 * `maxRetries` times before giving up.
 */
export async function withOCC<T extends WithEtag>(
  readFn: () => Promise<{ resource?: T }>,
  mutateFn: (doc: T) => void,
  replaceFn: (doc: T, etag: string) => Promise<unknown>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { resource } = await readFn();
    if (!resource) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
    const etag = resource._etag ?? '';
    mutateFn(resource);
    try {
      await replaceFn(resource, etag);
      return resource;
    } catch (err) {
      const code =
        (err as { statusCode?: number }).statusCode ??
        (err as { code?: number }).code;
      if (code === 412 && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
  throw new Error('OCC max retries exceeded');
}
