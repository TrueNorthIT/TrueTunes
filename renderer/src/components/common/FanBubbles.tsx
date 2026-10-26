import type { CSSProperties } from 'react';
import {
  bubbleLabel,
  bubbleTip,
  driftFor,
  layoutBubbles,
  type BubbleCardSize,
  type BubblePerson,
} from '../../lib/pickBubbles';
import { UserAvatar } from './UserAvatar';
import styles from './FanBubbles.module.css';

interface Props {
  /** Who the pick is for, with their queue counts (most first from the server; sorted again here). */
  people: BubblePerson[];
  /** The card it hangs on: large cards get bigger bubbles. */
  size: BubbleCardSize;
  /** Profile picture per person; a missing one falls back to the initial. */
  imageFor?: (user: string) => string | null | undefined;
  /** The signed-in name, said as "you". */
  viewer?: string | null;
  /** False holds every bubble still (as prefers-reduced-motion does); for stories and screenshots. */
  animate?: boolean;
  className?: string;
}

/**
 * A floating cloud of the faces a pick is for, each sized by how much they like it, drifting slowly and out of step.
 * It sits on the art of an ArtCard (its `aside`), right-aligned under the caption line and above the title.
 * Hovering a face names it with its count; the cloud as a whole is one image with everyone in its name.
 */
export function FanBubbles({ people, size, imageFor, viewer, animate = true, className }: Props) {
  if (!people.length) return null;
  const { bubbles, width, height } = layoutBubbles(people, size);
  const counts = new Map(people.map((p) => [p.user, p.count]));
  return (
    <div
      className={[styles.cloud, animate ? null : styles.still, className].filter(Boolean).join(' ')}
      style={{ width: `${width}em`, height: `${height}em` }}
      role="img"
      aria-label={bubbleLabel(people, viewer)}
    >
      {bubbles.map((b, i) => {
        const d = driftFor(i);
        const place = {
          left: `${b.x - b.r}em`,
          top: `${b.y - b.r}em`,
          width: `${b.r * 2}em`,
          height: `${b.r * 2}em`,
          '--dx': `${d.dx}em`,
          '--dy': `${d.dy}em`,
          '--drift-dur': `${d.duration}s`,
          '--drift-delay': `${d.delay}s`,
        } as CSSProperties;
        if (b.kind === 'more') {
          return (
            <span key="more" className={styles.bubble} style={place} aria-hidden="true">
              <span className={`${styles.face} ${styles.more}`}>+{b.more}</span>
              <span className={styles.tip}>{b.more} more</span>
            </span>
          );
        }
        return (
          <span key={b.user} className={styles.bubble} style={place} aria-hidden="true">
            <UserAvatar name={b.user} imageUrl={imageFor?.(b.user)} className={styles.face} />
            <span className={styles.tip}>{bubbleTip({ user: b.user, count: counts.get(b.user) }, viewer)}</span>
          </span>
        );
      })}
    </div>
  );
}
