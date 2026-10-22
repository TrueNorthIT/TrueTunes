import { UserAvatar } from './UserAvatar';
import styles from './QueuerChip.module.css';

/** "Queued by Name" with their avatar; opens their profile. The page places it through `className`. */
export function QueuerChip({ user, imageUrl, onOpen, prefix = 'Queued by ', className }: {
  user: string;
  imageUrl?: string | null;
  onOpen: () => void;
  prefix?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={[styles.chip, className].filter(Boolean).join(' ')}
      onClick={onOpen}
      aria-label={`${prefix}${user}, open profile`}
    >
      <UserAvatar name={user} imageUrl={imageUrl} className={styles.avatar} />
      <span>{prefix}{user}</span>
    </button>
  );
}
