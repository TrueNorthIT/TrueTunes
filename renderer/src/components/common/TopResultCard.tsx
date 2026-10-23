import { useId, type ReactNode } from 'react';
import { usePhotoState } from '../../lib/photoPlaceholder';
import { ExplicitBadge } from './ExplicitBadge';
import styles from './TopResultCard.module.css';

interface Props {
  title: string;
  /** One line saying what it is, e.g. "Song · The Killers · Hot Fuss". */
  meta?: string;
  /** Album art, artist photo or video thumbnail: it fills the card. Ask for a large size. */
  imageUrl?: string | null;
  explicit?: boolean;
  /** The art and title open it: the album for a song, the page for an artist or album. */
  onOpen: () => void;
  openLabel: string;
  onMouseEnter?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Pills and the office chip, under the meta line. */
  children?: ReactNode;
  className?: string;
}

/**
 * The search hit the person most likely meant, as a print with its label: the artwork fills the card edge to edge
 * and the heading, title, meta and actions sit bottom left on a scrim. With no art (or the service's grey silhouette)
 * the card falls back to the lit wall with the tint wash, same layout. The whole card opens it; its open button carries
 * data-search-stop so the search box and arrow keys can focus it.
 */
export function TopResultCard({ title, meta, imageUrl, explicit, onOpen, openLabel, onMouseEnter, onContextMenu, children, className }: Props) {
  const headingId = useId();
  // One pixel check through the shared cache: a flat grey placeholder is no art at all.
  const { state, src } = usePhotoState(imageUrl ?? null);
  const art = state === 'photo' ? src : null;
  return (
    <section
      className={[styles.card, art ? styles.withArt : '', className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
    >
      {art && <img className={styles.fill} src={art} alt="" />}
      <button type="button" className={styles.cover} onClick={onOpen} aria-label={openLabel} data-search-stop="" />
      <div className={styles.content}>
        <h2 id={headingId} className={styles.heading}>Top result</h2>
        <div className={styles.title}>
          {title}
          {explicit && <ExplicitBadge />}
        </div>
        {meta && <div className={styles.meta}>{meta}</div>}
        {children && <div className={styles.actions}>{children}</div>}
      </div>
    </section>
  );
}
