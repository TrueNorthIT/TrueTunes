import type { CSSProperties, ReactNode } from 'react';
import { bubbleLabel, bubbleTip, driftFor, type BubbleCardSize, type BubblePerson } from '../../lib/pickBubbles';
import { arrangeBubbles, type ArrangedBubble, type BubbleArrangement } from '../../lib/bubbleArrangements';
import { UserAvatar } from './UserAvatar';
import styles from './FanBubbles.module.css';

interface Props {
  /** Who the pick is for, with their queue counts (most first from the server; sorted again here). */
  people: BubblePerson[];
  /** The card it hangs on: large cards get bigger bubbles. */
  size: BubbleCardSize;
  /** How the faces are laid out and move (exploration; `column` is the shipped one). */
  arrangement?: BubbleArrangement;
  /** Multiplies every face's size (the cloud is in em, so it all scales together). Exploration: try 1.3. */
  scale?: number;
  /** Profile picture per person; a missing one falls back to the initial. */
  imageFor?: (user: string) => string | null | undefined;
  /** The signed-in name, said as "you". */
  viewer?: string | null;
  /** False holds every bubble still (as prefers-reduced-motion does); for stories and screenshots. */
  animate?: boolean;
  className?: string;
}

const em = (n: number) => `${n}em`;

/** Per-bubble motion for each arrangement, as CSS custom properties the module's keyframes read. */
function motionVars(b: ArrangedBubble, i: number, arrangement: BubbleArrangement): Record<string, string> {
  if (b.orbit) {
    const o = b.orbit;
    const lap = Math.abs(o.period);
    const dir = o.period < 0 ? -1 : 1;
    // The X and Y slides are each a half-lap ease-in-out back and forth, a quarter-lap apart: an ellipse. The
    // delays start them at the face's rest phase, so moving and still agree at t = 0.
    const frac = (n: number) => n - Math.floor(n);
    const phase = dir * o.phase;
    return {
      '--ox-from': em(o.cx - o.a - b.x),
      '--ox-to': em(o.cx + o.a - b.x),
      '--oy-from': em(o.cy - dir * o.b - b.y),
      '--oy-to': em(o.cy + dir * o.b - b.y),
      '--orbit-half': `${lap / 2}s`,
      '--orbit-x-delay': `${-frac((phase + Math.PI) / (2 * Math.PI)) * lap}s`,
      '--orbit-y-delay': `${-frac((phase + Math.PI / 2) / (2 * Math.PI)) * lap}s`,
    };
  }
  if (b.spread) return { '--sx': em(b.spread.x), '--sy': em(b.spread.y) };
  const d = driftFor(i);
  // The constellation's lines end under the faces, so its drift stays small enough never to show a line's end.
  const k = arrangement === 'constellation' ? 0.5 : 1;
  return {
    '--dx': em(d.dx * k),
    '--dy': em(d.dy * k),
    '--drift-dur': `${d.duration * (arrangement === 'constellation' ? 1.4 : 1)}s`,
    '--drift-delay': `${d.delay}s`,
  };
}

/**
 * A floating cloud of the faces a pick is for, each sized by how much they like it. It sits on the art of an ArtCard
 * (its `aside`) and places itself for its arrangement, clear of the caption line, the title and the +.
 * Hovering a face names it with its count; the cloud as a whole is one image with everyone in its name.
 */
export function FanBubbles({
  people,
  size,
  arrangement = 'column',
  scale = 1,
  imageFor,
  viewer,
  animate = true,
  className,
}: Props) {
  if (!people.length) return null;
  const { bubbles, width, height, origin, links } = arrangeBubbles(people, size, arrangement);
  const counts = new Map(people.map((p) => [p.user, p.count]));
  return (
    <div
      className={[styles.cloud, styles[arrangement], animate ? null : styles.still, className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: em(width), height: em(height), fontSize: scale === 1 ? undefined : `${scale}em` }}
      role="img"
      aria-label={bubbleLabel(people, viewer)}
    >
      <div className={styles.field} style={{ transformOrigin: `${em(origin.x)} ${em(origin.y)}` }}>
        {links.length > 0 && (
          <svg className={styles.links} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
            {links.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={bubbles[a].x} y1={bubbles[a].y} x2={bubbles[b].x} y2={bubbles[b].y} />
            ))}
          </svg>
        )}
        {bubbles.map((b, i) => {
          const place = {
            left: em(b.x - b.r),
            top: em(b.y - b.r),
            width: em(b.r * 2),
            height: em(b.r * 2),
            zIndex: b.z,
            ...motionVars(b, i, arrangement),
          } as CSSProperties;
          const face: ReactNode =
            b.kind === 'more' ? (
              <>
                <span className={`${styles.face} ${styles.more}`}>+{b.more}</span>
                <span className={styles.tip}>{b.more} more</span>
              </>
            ) : (
              <>
                <UserAvatar name={b.user} imageUrl={imageFor?.(b.user)} className={styles.face} />
                <span className={styles.tip}>{bubbleTip({ user: b.user, count: counts.get(b.user) }, viewer)}</span>
              </>
            );
          return (
            <span
              key={b.kind === 'more' ? 'more' : b.user}
              className={styles.bubble}
              style={place}
              aria-hidden="true"
              data-fan-bubble=""
            >
              {b.orbit ? (
                <span className={styles.orbitX}>
                  <span className={styles.orbitY}>{face}</span>
                </span>
              ) : (
                face
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
