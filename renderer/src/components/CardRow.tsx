import { getName, browseSub, getItemArt, isAlbum, isPlaylist, isContainer, isProgram } from '../lib/itemHelpers';
import { TrackCard } from './TrackCard';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/HomePanel.module.css';

export function CardRow({
  items,
  isLoading,
  onAdd,
  onOpen,
}: {
  items: SonosItem[];
  isLoading: boolean;
  onAdd: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  if (isLoading) {
    return (
      <div className={styles.cardRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.placeholder} />
        ))}
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className={styles.cardRow}>
      {items.map((item, i) => (
        <TrackCard
          key={i}
          name={getName(item)}
          sub={browseSub(item)}
          artUrl={getItemArt(item)}
          onAdd={isContainer(item) ? undefined : () => onAdd(item)}
          onOpen={(isAlbum(item) || isPlaylist(item) || isContainer(item) || isProgram(item)) ? () => onOpen(item) : undefined}
        />
      ))}
    </div>
  );
}
