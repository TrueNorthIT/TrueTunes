import { getName, browseSub, getItemArt, isAlbum, isArtist, isPlaylist, isContainer, isProgram } from '../lib/itemHelpers';
import { MediaCard } from './common/MediaCard';
import type { SonosItem } from '../types/sonos';
import styles from '../styles/CardRow.module.css';

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
        <MediaCard
          key={i}
          name={getName(item)}
          sub={browseSub(item)}
          artUrl={getItemArt(item)}
          circular={isArtist(item)}
          onAdd={(isContainer(item) || isArtist(item)) ? undefined : () => onAdd(item)}
          onOpen={(isAlbum(item) || isPlaylist(item) || isContainer(item) || isProgram(item) || isArtist(item)) ? () => onOpen(item) : undefined}
        />
      ))}
    </div>
  );
}
