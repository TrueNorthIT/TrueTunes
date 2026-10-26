import type { CSSProperties } from 'react';
import { bubbleLabel, bubbleTip, layoutBubbles, type BubbleCardSize, type BubblePerson } from '../../lib/pickBubbles';
import { UserAvatar } from './UserAvatar';
import styles from './FanBubbles.module.css';

/** Faces are drawn at this multiple of the BUBBLE_RADII sizes: on a pick card's big print, 1× reads as specks. */
export const BUBBLE_SCALE = 1.3;

interface Props {
  /** Who the pick is for, with their queue counts (most first from the server; sorted again here). */
  people: BubblePerson[];
  /** The card it hangs on: large cards get bigger bubbles. */
  size: BubbleCardSize;
  /** Profile picture per person; a missing one falls back to the initial. */
  imageFor?: (user: string) => string | null | undefined;
  /** The signed-in name, said as "you". */
  viewer?: string | null;
  /** False holds the head still (as prefers-reduced-motion does); for stories and screenshots. */
  animate?: boolean;
  className?: string;
}

const em = (n: number) => `${n}em`;

/**
 * A cloud of the faces a pick is for, as a sunflower head: the biggest fan in the middle, the rest stepping out at
 * the golden angle, each sized by how much they like the artist. The head breathes slowly as one. It sits on the art
 * of an ArtCard (its `aside`), on the right, clear of the caption line, the title and the +.
 * Hovering a face names it with its count; the cloud as a whole is one image with everyone in its name.
 */
export function FanBubbles({ people, size, imageFor, viewer, animate = true, className }: Props) {
  if (!people.length) return null;
  const { bubbles, width, height, origin } = layoutBubbles(people, size);
  const counts = new Map(people.map((p) => [p.user, p.count]));
  return (
    <div
      className={[styles.cloud, animate ? null : styles.still, className].filter(Boolean).join(' ')}
      style={{ width: em(width), height: em(height), fontSize: `${BUBBLE_SCALE}em` }}
      role="img"
      aria-label={bubbleLabel(people, viewer)}
    >
      <div className={styles.head} style={{ transformOrigin: `${em(origin.x)} ${em(origin.y)}` }}>
        {bubbles.map((b) => {
          const place: CSSProperties = {
            left: em(b.x - b.r),
            top: em(b.y - b.r),
            width: em(b.r * 2),
            height: em(b.r * 2),
          };
          if (b.kind === 'more') {
            return (
              <span key="more" className={styles.bubble} style={place} aria-hidden="true" data-fan-bubble="">
                <span className={`${styles.face} ${styles.more}`}>+{b.more}</span>
                <span className={styles.tip}>{b.more} more</span>
              </span>
            );
          }
          return (
            <span key={b.user} className={styles.bubble} style={place} aria-hidden="true" data-fan-bubble="">
              <UserAvatar name={b.user} imageUrl={imageFor?.(b.user)} className={styles.face} />
              <span className={styles.tip}>{bubbleTip({ user: b.user, count: counts.get(b.user) }, viewer)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
