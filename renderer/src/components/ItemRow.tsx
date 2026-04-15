import { useImage } from '../hooks/useImage';
import { ExplicitBadge } from './ExplicitBadge';
import styles from '../styles/ItemRow.module.css';

interface Props {
  name: string;
  sub?: string | null;
  subLink?: string | null;
  onSubLink?: () => void;
  onSubLinkHover?: () => void;
  artUrl?: string | null;
  isPlaying?: boolean;
  showAddButton?: boolean;
  onAdd?: () => void;
  onOpen?: () => void;
  onDoubleClick?: () => void;
  onHover?: () => void;
  explicit?: boolean;
}

export function ItemRow({ name, sub, subLink, onSubLink, onSubLinkHover, artUrl, isPlaying = false, showAddButton = false, onAdd, onOpen, onDoubleClick, onHover, explicit }: Props) {
  const cachedArt = useImage(artUrl);
  return (
    <div
      className={`${styles.row}${isPlaying ? ' ' + styles.playing : ''}${onOpen ? ' ' + styles.clickable : ''}`}
      data-playing={isPlaying ? 'true' : undefined}
      onClick={onOpen}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onHover}
    >
      <div className={styles.artWrap}>
        {cachedArt
          ? <img className={styles.art} src={cachedArt} alt="" />
          : <div className={styles.artPh}>♪</div>
        }
        <div className={styles.overlay}>▶</div>
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{name}{explicit && <ExplicitBadge />}</div>
        {(sub || subLink) && (
          <div className={styles.sub}>
            {sub}
            {sub && subLink ? ' \u2022 ' : ''}
            {subLink && (
              <button className={styles.subLink} onClick={e => { e.stopPropagation(); onSubLink?.(); }} onMouseEnter={onSubLinkHover}>
                {subLink}
              </button>
            )}
          </div>
        )}
      </div>
      {showAddButton && (
        <button className={styles.addBtn} onClick={e => { e.stopPropagation(); onAdd?.(); }}>+</button>
      )}
    </div>
  );
}
