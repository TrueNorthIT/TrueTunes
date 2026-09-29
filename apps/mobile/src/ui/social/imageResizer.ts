import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { AvatarFile, ImageResizer } from '../../logic/lib/avatarImage';

/** An AvatarFile that also remembers where it lives on disk (RN has no File.arrayBuffer for content:// URIs). */
export interface UriAvatarFile extends AvatarFile {
  uri: string;
  width?: number;
  height?: number;
}

export const AVATAR_SIZE = 512;

/** Centre-crop to a square then resize to 512px WebP, like desktop's canvas resizer. */
export const expoImageResizer: ImageResizer = async (file) => {
  const f = file as UriAvatarFile;
  const w = f.width ?? 0;
  const h = f.height ?? 0;
  const actions: Parameters<typeof manipulateAsync>[1] = [];
  if (w > 0 && h > 0 && w !== h) {
    const side = Math.min(w, h);
    actions.push({ crop: { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side } });
  }
  actions.push({ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } });
  const out = await manipulateAsync(f.uri, actions, { format: SaveFormat.WEBP, compress: 0.85 });
  const buffer = await (await fetch(out.uri)).arrayBuffer();
  return { buffer, mimeType: 'image/webp' };
};
