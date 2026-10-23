import { UserAvatar } from './UserAvatar';
import styles from './PersonChip.module.css';

interface Props {
  name: string;
  /** Appended to the name, e.g. " (you)". */
  suffix?: string;
  imageUrl?: string | null;
  selected: boolean;
  /** The person's series colour when the page draws them on a chart: a dot beside the name. */
  colour?: string | null;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

/** A toggle chip for choosing people: avatar, name, tonal fill when selected. Sized in em: inside a .page-scale root. */
export function PersonChip({ name, suffix = '', imageUrl, selected, colour, disabled, title, onClick }: Props) {
  return (
    <button
      type="button"
      className={`${styles.chip}${selected ? ' ' + styles.on : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <UserAvatar name={name} imageUrl={imageUrl} className={styles.avatar} />
      {colour && <span className={styles.dot} style={{ background: colour }} />}
      <span className={styles.name}>{name}{suffix}</span>
    </button>
  );
}
