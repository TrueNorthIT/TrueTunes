import type { ReactNode } from 'react';
import { useChampionFor } from '../../lib/champion';
import styles from './UserAvatar.module.css';

/**
 * A person's name beside their avatar: in the champion's gold when they won last week's Queuedle
 * (UserAvatar carries the words, so this is colour on top of a mark, not instead of one).
 */
export function PersonName({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  /** What to show, when it isn't just the name (e.g. "Queued by Rich"). */
  children?: ReactNode;
}) {
  const champion = useChampionFor(name);
  const cls = [className, champion ? styles.championName : null].filter(Boolean).join(' ');
  return <span className={cls || undefined}>{children ?? name}</span>;
}
