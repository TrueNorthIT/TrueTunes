import { useImage } from '../../hooks/useImage';

/** No purple: a name hash lands on 0–250° or 330–360°, never on the 250–330° violets. */
function avatarHue(hash: number): number {
  const hue = Math.abs(hash) % 280;
  return hue < 250 ? hue : hue + 80;
}

/**
 * Stable colour per person, so someone without a photo still looks like
 * themselves everywhere they appear. One hue, from 30% to 20% lightness,
 * so the white initial reads at 4.5:1 or better on every hue.
 */
export function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
    h |= 0;
  }
  const hue = avatarHue(h);
  return `linear-gradient(135deg, hsl(${hue},55%,30%), hsl(${hue},60%,20%))`;
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
