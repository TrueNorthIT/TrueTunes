import { useImage } from '../hooks/useImage';
import styles from '../styles/TrackCard.module.css';

interface Props {
  name: string;
  sub?: string | null;
  artUrl?: string | null;
  onAdd?: () => void;
  onOpen?: () => void;
}

export function TrackCard({ name, sub, artUrl, onAdd, onOpen }: Props) {
  const cachedArt = useImage(artUrl);
  return (
    <div className={styles.card} onClick={onOpen}>
      <div className={styles.artWrap}>
        {cachedArt
          ? <img className={styles.art} src={cachedArt} alt="" />
          : <div className={styles.artPh}>♪</div>
        }
        {onAdd && (
          <div className={styles.overlay}>
            <button
              className={styles.addBtn}
              onClick={e => { e.stopPropagation(); onAdd(); }}
            >
              +
            </button>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{name}</div>
        {sub && <div className={styles.sub}>{sub}</div>}
      </div>
    </div>
  );
}
