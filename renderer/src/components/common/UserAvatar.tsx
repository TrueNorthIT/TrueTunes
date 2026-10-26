import type { CSSProperties } from 'react';
import { useImage } from '../../hooks/useImage';
import { championLabel, useChampionFor } from '../../lib/champion';
import styles from './UserAvatar.module.css';

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

/** The 👑, drawn as a scalable glyph so it sizes with the avatar rather than a font size. */
function Crown() {
  return (
    <svg className={styles.crown} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <text x="10" y="16" textAnchor="middle" fontSize="16">
        👑
      </text>
    </svg>
  );
}

/**
 * Round profile picture, falling back to the initial on a per-name gradient.
 * Sizing and shape come from `className` so each panel keeps its own layout.
 * Last week's Queuedle champion (from ChampionContext) gets a gold ring and a crown, and says so
 * in its accessible name and tooltip; everyone else renders exactly as before.
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
  const champion = useChampionFor(name);
  // No photo: the initial is drawn by CSS (::before from --initial), not a text node. It's decoration, so it
  // must not count as visible text of the button around it (axe label-content-name-mismatch compares the two).
  const style = art
    ? undefined
    : ({
        background: avatarGradient(name),
        '--initial': JSON.stringify(name.slice(0, 1).toUpperCase()),
      } as CSSProperties);
  const content = art ? <img src={art} alt="" loading="lazy" /> : null;
  const cls = [className, art ? null : styles.initial];
  if (!champion) {
    return (
      <div className={cls.filter(Boolean).join(' ') || undefined} style={style} aria-hidden="true">
        {content}
      </div>
    );
  }
  const label = championLabel(champion);
  return (
    <div
      className={[...cls, styles.champion].filter(Boolean).join(' ')}
      style={style}
      role="img"
      aria-label={label}
      title={label}
      data-champion=""
    >
      {content}
      <span className={styles.ring} aria-hidden="true" />
      <Crown />
    </div>
  );
}
