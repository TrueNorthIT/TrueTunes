// Normalize an uploaded avatar before it goes to blob storage.
// Desktop center-crops to 512px WebP via canvas. In RN the UI layer plugs a
// resizer in with setImageResizer (TODO: expo-image-manipulator); default is pass-through.

export interface NormalizedImage {
  buffer: ArrayBuffer;
  mimeType: string;
}

/** Minimal file shape (browser File satisfies this; RN callers can supply their own). */
export interface AvatarFile {
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type ImageResizer = (file: AvatarFile) => Promise<NormalizedImage>;

const passthrough: ImageResizer = async (file) => ({
  buffer: await file.arrayBuffer(),
  mimeType: file.type,
});

let resizer: ImageResizer = passthrough;

export function setImageResizer(fn: ImageResizer | null): void {
  resizer = fn ?? passthrough;
}

export async function normalizeAvatar(file: AvatarFile): Promise<NormalizedImage> {
  // Leave GIFs untouched so animation is preserved.
  if (file.type === 'image/gif') return passthrough(file);
  try {
    return await resizer(file);
  } catch {
    return passthrough(file);
  }
}
