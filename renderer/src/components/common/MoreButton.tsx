import { Ellipsis } from 'lucide-react';
import styles from './MoreButton.module.css';

interface Props {
  /** Accessible name, e.g. "More for Blue". */
  label: string;
  /** Gets the click, so the menu can open where it happened (it is the row's onContextMenu handler). */
  onClick: (e: React.MouseEvent) => void;
  /** Placement and reveal belong to the parent; this only styles the button. */
  className?: string;
}

/**
 * The visible way into a row's context menu, for a finger: a quiet ⋯ in the + button's family. Like the +, the
 * click stops here so the row around it doesn't open. Rows show it on the web where there is no hover.
 */
export function MoreButton({ label, onClick, className }: Props) {
  return (
    <button
      type="button"
      className={[styles.more, className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <Ellipsis size={18} aria-hidden="true" />
    </button>
  );
}
