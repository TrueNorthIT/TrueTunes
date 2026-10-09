import { useImage } from '../../hooks/useImage';

/**
 * Stable colour per person, so someone without a photo still looks like
 * themselves everywhere they appear.
 */
export function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg, hsl(${hue},55%,38%), hsl(${(hue + 40) % 360},60%,28%))`;
}

/**
 * Round profile picture, falling back to the initial on a per-name gradient.
 * Sizing and shape come from `className` so each panel keeps its own layout.
 */
export function UserAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const art = useImage(imageUrl ?? null);
  return (
    <div
      className={className}
      style={art ? undefined : { background: avatarGradient(name) }}
      aria-hidden="true"
    >
      {art ? <img src={art} alt="" loading="lazy" /> : name.slice(0, 1).toUpperCase()}
    </div>
  );
}
