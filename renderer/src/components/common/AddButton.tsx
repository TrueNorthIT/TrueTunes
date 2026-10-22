import { Plus } from 'lucide-react';
import styles from './AddButton.module.css';

export type AddButtonVariant = 'quiet' | 'art' | 'corner';

interface Props {
  /** Accessible name, e.g. "Add Blue to queue". */
  label: string;
  onClick: () => void;
  /** quiet: rows, borderless until hovered. art: light disc over imagery. corner: dark disc on a tile corner. */
  variant?: AddButtonVariant;
  /** Placement and reveal (position, opacity) belong to the parent; this only styles the button. */
  className?: string;
}

/** The one + button. It never navigates: the click stops here so a card or row around it doesn't open. */
export function AddButton({ label, onClick, variant = 'quiet', className }: Props) {
  return (
    <button
      type="button"
      className={[styles.add, styles[variant], className].filter(Boolean).join(' ')}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Plus size={variant === 'art' ? 18 : 16} aria-hidden="true" />
    </button>
  );
}
