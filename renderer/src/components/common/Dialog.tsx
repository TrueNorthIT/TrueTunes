import { useId, useLayoutEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Dialog.module.css';

interface Props {
  /** Sentence case. Names the dialog for screen readers too. */
  title: ReactNode;
  onClose: () => void;
  /** Sits after the title, e.g. a version chip. */
  headContent?: ReactNode;
  /** The action row, right-aligned: secondary actions first, the primary (or destructive) one last. */
  actions?: ReactNode;
  /**
   * Makes the body and the action row one form, so Enter submits and a type="submit" PillButton can sit in
   * `actions`. A form dialog doesn't close on a backdrop click, so a stray click can't lose what was typed.
   */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** sm 26em (a question, a name), md 36em (a short form), lg 64em (a reader or a list). */
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The one modal. A native <dialog> opened with showModal(): it sits in the top layer, the page behind is
 * inert, so Tab stays inside without a hand-written trap. Esc closes; focus goes to the first field (or to
 * an element marked data-autofocus, or the dialog itself) and returns to the opener on close. Portalled
 * to <body> so a parent's drag region or overflow can't reach it.
 */
export function Dialog({ title, onClose, headContent, actions, onSubmit, size = 'md', closeLabel = 'Close', className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // React's autoFocus fires before showModal(), while the dialog is still hidden, so focus is placed here.
    const first = dialog.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not(:disabled), textarea:not(:disabled)');
    (first ?? dialog).focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  const content = (
    <>
      <div className={styles.body}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </>
  );

  return createPortal(
    <dialog
      ref={ref}
      className={['page-scale', styles.dialog, styles[size], className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      tabIndex={-1}
      closedby={onSubmit ? 'closerequest' : 'any'}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        // Handled here rather than by the native close request, so it also works where that isn't fired,
        // and doesn't reach page-level Esc handlers (Search goes back on Esc).
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => {
        // Backdrop click (closedby="any"): let React unmount it instead of the browser closing it.
        e.preventDefault();
        onClose();
      }}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>{title}</h2>
        {headContent}
        <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {onSubmit ? (
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>{content}</form>
      ) : content}
    </dialog>,
    document.body,
  );
}
