import type { ButtonHTMLAttributes } from 'react';
import styles from './PillButton.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  /** primary: the room inverted (one per view). ghost: tonal, for secondary actions. danger: tonal red, for destructive ones. */
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
}

/** The system's labelled button: a full pill, sentence case. Sized in em, so it follows the page scale. */
export function PillButton({ variant = 'ghost', className, type = 'button', ...rest }: Props) {
  return <button type={type} className={[styles.pill, styles[variant], className].filter(Boolean).join(' ')} {...rest} />;
}
