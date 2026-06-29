// Normalize an uploaded avatar before it goes to blob storage.
//
// The upload pipeline is lossless end-to-end, so a multi-megapixel camera photo
// is stored at full resolution and then downscaled straight to the 72px home
// avatars. That single harsh reduction aliases badly on Chromium and reads as
// "compression" / distortion. Center-cropping to a square and capping the
// resolution with high-quality smoothing makes the eventual downscale crisp,
// while a high WebP quality keeps the result visually lossless and small.

const AVATAR_SIZE = 512;
const WEBP_QUALITY = 0.95;

export interface NormalizedImage {
  buffer: ArrayBuffer;
  mimeType: string;
}

export async function normalizeAvatar(file: File): Promise<NormalizedImage> {
  const passthrough = async (): Promise<NormalizedImage> => ({
    buffer: await file.arrayBuffer(),
    mimeType: file.type,
  });

  // Leave GIFs untouched so animation is preserved (canvas would flatten them).
  if (file.type === 'image/gif') return passthrough();

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return passthrough();

  try {
    // Center-crop to a square, and never upscale a source smaller than the cap.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const target = Math.min(AVATAR_SIZE, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY),
    );
    if (!blob) return passthrough();
    return { buffer: await blob.arrayBuffer(), mimeType: 'image/webp' };
  } finally {
    bitmap.close();
  }
}
