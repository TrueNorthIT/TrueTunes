import { useImage } from '../../hooks/useImage';
import { ExplicitBadge } from './ExplicitBadge';
import styles from './MediaRow.module.css';

interface Props {
  name: string;
  artUrl?: string | null;
  explicit?: boolean;
  isPlaying?: boolean;
  isSelected?: boolean;
  leading?: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onAdd?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onHover?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export function MediaRow({
  name, artUrl, explicit, isPlaying, isSelected, leading, subtitle, trailing,
  onAdd, onClick, onDoubleClick, onHover, draggable, onDragStart,
}: Props) {
  const cachedArt = useImage(artUrl);
  const classes = [
    styles.row,
    isPlaying  ? styles.playing   : '',
    isSelected ? styles.selected  : '',
    draggable  ? styles.draggable : (onClick ? styles.clickable : ''),
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      data-playing={isPlaying ? 'true' : undefined}
      draggable={draggable}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onHover}
      onDragStart={onDragStart}
    >
      {leading !== undefined && <div className={styles.leading}>{leading}</div>}
      <div className={styles.artWrap}>
        {cachedArt
          ? <img className={styles.art} src={cachedArt} alt="" />
          : <div className={styles.artPh}>♪</div>
        }
        <div className={styles.overlay}>▶</div>
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{name}{explicit && <ExplicitBadge />}</div>
        {subtitle !== undefined && <div className={styles.sub}>{subtitle}</div>}
      </div>
      {trailing !== undefined && <div className={styles.trailing}>{trailing}</div>}
      {onAdd && (
        <button className={styles.addBtn} onClick={e => { e.stopPropagation(); onAdd(); }}>+</button>
      )}
    </div>
  );
}
